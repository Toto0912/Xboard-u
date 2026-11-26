<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class CaptchaService
{
    public function verify(Request $request): array
    {
        if (!(int) admin_setting('captcha_enable', 0)) {
            return [true, null];
        }
        $type = admin_setting('captcha_type', 'recaptcha');
        $provider = match ($type) {
            'turnstile' => ['https://challenges.cloudflare.com/turnstile/v0/siteverify', 'turnstile_token', 'turnstile_secret_key'],
            'recaptcha' => ['https://www.google.com/recaptcha/api/siteverify', 'recaptcha_data', 'recaptcha_key'],
            'recaptcha-v3' => ['https://www.google.com/recaptcha/api/siteverify', 'recaptcha_v3_token', 'recaptcha_v3_secret_key'],
            default => null,
        };
        if (!$provider) {
            return [false, [400, __('Invalid captcha type')]];
        }
        [$url, $field, $secret] = $provider;
        $token = $request->input($field);
        $invalid = [false, [400, __('Invalid code is incorrect')]];
        $unavailable = [false, [503, __('Captcha service unavailable. Please try again later.')]];
        if (!is_string($token) || trim($token) === '') {
            return $invalid;
        }
        try {
            $response = Http::asForm()->connectTimeout(3)->timeout(6)->post($url, [
                'secret' => admin_setting($secret), 'response' => $token, 'remoteip' => $request->ip(),
            ]);
        } catch (ConnectionException $e) {
            return $unavailable;
        }
        $result = $response->json();
        if (!$response->successful() || !is_bool($result['success'] ?? null)) {
            return $unavailable;
        }
        if (!$result['success']) {
            $codes = $result['error-codes'] ?? [];
            return is_array($codes) && array_intersect($codes, ['invalid-input-secret', 'missing-input-secret', 'internal-error']) ? $unavailable : $invalid;
        }
        if ($type === 'recaptcha-v3' && (!is_numeric($result['score'] ?? null)
            || $result['score'] < (float) admin_setting('recaptcha_v3_score_threshold', 0.5))) {
            return $invalid;
        }
        return [true, null];
    }
} 