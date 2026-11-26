<?php

namespace App\Services\Auth;

use App\Utils\CacheKey;
use Illuminate\Support\Facades\Cache;

final class EmailChallenge
{
    public static function matches(string $email, string $purpose, string $value): bool
    {
        $cached = Cache::get(CacheKey::get('EMAIL_VERIFY_CODE', $email));
        if (is_array($cached)) {
            if (($cached['purpose'] ?? null) !== $purpose) {
                return false;
            }
            $cached = $cached['code'] ?? null;
        }
        // Codes already in flight before the upgrade expire within five minutes.
        return (is_string($cached) || is_int($cached)) && hash_equals((string) $cached, $value);
    }
}
