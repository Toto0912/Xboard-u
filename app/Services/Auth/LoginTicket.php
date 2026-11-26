<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\AuthService;
use App\Utils\CacheKey;
use App\Utils\Helper;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;

final class LoginTicket
{
    public static function issue(User $user, int $lifetime): string
    {
        $code = Helper::guid();
        $token = $user->currentAccessToken();
        Cache::put(CacheKey::get('TEMP_TOKEN', $code), [
            'user' => $user->getKey(),
            'credential' => hash('sha256', (string) $user->getAuthPassword()),
            'token' => $token instanceof PersonalAccessToken ? $token->getKey() : null,
        ], $lifetime);

        return $code;
    }

    public static function consume(string $code): ?User
    {
        $key = CacheKey::get('TEMP_TOKEN', $code);
        $ticket = Cache::lock($key . ':consume', 10)->get(fn () => Cache::pull($key));
        if (!is_array($ticket) || !isset($ticket['user'], $ticket['credential'])) {
            return null;
        }

        $user = User::whereKey($ticket['user'])->lockForUpdate()->first();
        if (!$user || $user->banned || !hash_equals($ticket['credential'], hash('sha256', (string) $user->getAuthPassword()))) {
            return null;
        }
        if (isset($ticket['token'])) {
            $token = $user->tokens()->find($ticket['token']);
            if (!$token || !AuthService::tokenIsCurrent($token)) {
                return null;
            }
        }

        return $user;
    }

    public static function redirectPath(?string $target): string
    {
        if (!$target || !preg_match('~^/?[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/?(?:[?#][^\x00-\x20\\\\]*)?$~D', $target)) {
            return 'dashboard';
        }
        return $target;
    }

    public static function loginPath(string $code, ?string $target): string
    {
        return '/#/login?' . http_build_query(['verify' => $code, 'redirect' => self::redirectPath($target)], '', '&', PHP_QUERY_RFC3986);
    }
}
