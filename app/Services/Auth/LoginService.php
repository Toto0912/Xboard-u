<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Plugin\HookManager;
use App\Utils\CacheKey;
use App\Utils\Helper;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

class LoginService
{
    /**
     * 处理用户登录
     *
     * @param string $email 用户邮箱
     * @param string $password 用户密码
     * @return array [成功状态, 用户对象或错误信息]
     */
    public function login(string $email, string $password): array
    {
        $email = User::normalizeEmail($email);

        $attemptKey = CacheKey::get('PASSWORD_ERROR_LIMIT', $email);
        $limited = (bool) admin_setting('password_limit_enable', true);
        if ($limited) {
            if (!AttemptBudget::reserve($attemptKey, (int) admin_setting('password_limit_count', 5), 60 * (int) admin_setting('password_limit_expire', 60))) {
                return [
                    false,
                    [
                        429,
                        __('There are too many password errors, please try again after :minute minutes.', [
                            'minute' => admin_setting('password_limit_expire', 60)
                        ])
                    ]
                ];
            }
        }

        // 查找用户
        $user = User::byEmail($email)->first();
        if (!$user) {
            return [false, [400, __('Incorrect email or password')]];
        }

        // 验证密码
        if (
            !Helper::multiPasswordVerify(
                $user->password_algo,
                $user->password_salt,
                $password,
                $user->password
            )
        ) {
            return [false, [400, __('Incorrect email or password')]];
        }

        if ($limited) {
            AttemptBudget::release($attemptKey);
        }

        // 检查账户状态
        if ($user->banned) {
            return [false, [400, __('Your account has been suspended')]];
        }

        // 更新最后登录时间
        $user->last_login_at = time();
        $user->save();

        HookManager::call('user.login.after', $user);
        return [true, $user];
    }

    /**
     * 处理密码重置
     *
     * @param string $email 用户邮箱
     * @param string $emailCode 邮箱验证码
     * @param string $password 新密码
     * @return array [成功状态, 结果或错误信息]
     */
    public function resetPassword(string $email, string $emailCode, string $password): array
    {
        $email = User::normalizeEmail($email);

        $result = Cache::lock(CacheKey::get('FORGET_REQUEST_LIMIT', $email) . ':reset', 30)
            ->get(fn () => $this->resetWithCode($email, $emailCode, $password));

        return $result === false ? [false, [429, __('Reset failed, Please try again later')]] : $result;
    }

    private function resetWithCode(string $email, string $emailCode, string $password): array
    {
        $forgetRequestLimitKey = CacheKey::get('FORGET_REQUEST_LIMIT', $email);
        $forgetRequestLimit = RateLimiter::attempts($forgetRequestLimitKey);
        if ($forgetRequestLimit >= 3) {
            return [false, [429, __('Reset failed, Please try again later')]];
        }

        // 验证邮箱验证码
        if (!EmailChallenge::matches($email, 'reset', $emailCode)) {
            RateLimiter::hit($forgetRequestLimitKey, 300);
            return [false, [400, __('Incorrect email verification code')]];
        }

        // 查找用户
        $user = DB::transaction(function () use ($email, $password) {
            $user = User::byEmail($email)->lockForUpdate()->first();
            if ($user) {
                $user->password = password_hash($password, PASSWORD_DEFAULT);
                $user->password_algo = null;
                $user->password_salt = null;
                if (!$user->save()) {
                    throw new \RuntimeException('Password update failed');
                }
                $user->tokens()->delete();
            }
            return $user;
        });
        if (!$user) {
            return [false, [400, __('This email is not registered in the system')]];
        }

        Cache::forget(CacheKey::get('EMAIL_VERIFY_CODE', $email));
        HookManager::call('user.password.reset.after', $user);

        return [true, true];
    }


    /**
     * 生成临时登录令牌和快速登录URL
     *
     * @param User $user 用户对象
     * @param string $redirect 重定向路径
     * @return string|null 快速登录URL
     */
    public function generateQuickLoginUrl(User $user, ?string $redirect = null): ?string
    {
        if (!$user->exists || $user->banned) {
            return null;
        }

        $loginRedirect = LoginTicket::loginPath(LoginTicket::issue($user, 60), $redirect);

        if (admin_setting('app_url')) {
            $url = admin_setting('app_url') . $loginRedirect;
        } else {
            $url = url($loginRedirect);
        }

        return $url;
    }
}