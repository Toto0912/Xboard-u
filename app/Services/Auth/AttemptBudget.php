<?php

namespace App\Services\Auth;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

final class AttemptBudget
{
    public static function reserve(string $key, int $limit, int $seconds): bool
    {
        try {
            return Cache::lock($key . ':budget', 10)->block(2, function () use ($key, $limit, $seconds) {
                if (RateLimiter::attempts($key) >= $limit) {
                    return false;
                }
                RateLimiter::hit($key, $seconds);
                return true;
            });
        } catch (LockTimeoutException $exception) {
            return false;
        }
    }

    public static function release(string $key): void
    {
        try {
            Cache::lock($key . ':budget', 10)->block(2, function () use ($key) {
                if (RateLimiter::attempts($key) > 0) {
                    RateLimiter::decrement($key);
                }
            });
        } catch (LockTimeoutException $exception) {
            // Another request still owns the budget. The reservation expires with its window.
        }
    }
}
