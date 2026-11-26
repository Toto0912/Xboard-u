<?php

namespace Tests\Unit\Services;

use App\Models\Plan;
use App\Models\User;
use App\Services\TrafficResetService;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MonthlyTrafficResetTest extends TestCase
{
    public static function dates(): array
    {
        return [
            'Feb before clamped target' => [1, '2030-03-31', '2023-02-28 09:59:59', '2023-02-28 10:00:00'],
            'Feb at clamped target' => [1, '2030-03-31', '2023-02-28 10:00:00', '2023-03-31 10:00:00'],
            'leap Feb before target' => [1, '2030-03-30', '2024-02-28 10:00:00', '2024-02-29 10:00:00'],
            'leap Feb after target' => [1, '2030-03-30', '2024-02-29 10:00:01', '2024-03-30 10:00:00'],
            '29th in a non-leap February' => [1, '2030-03-29', '2023-02-01 10:00:00', '2023-02-28 10:00:00'],
            'April clamp' => [1, '2030-03-31', '2024-03-31 10:00:00', '2024-04-30 10:00:00'],
            'new year' => [1, '2030-03-31', '2024-12-31 10:00:00', '2025-01-31 10:00:00'],
            'first of month from Jan 31' => [0, '2030-03-31', '2024-01-31 12:00:00', '2024-02-01 00:00:00'],
            'yearly Feb 15 from Jan 31' => [4, '2030-02-15', '2026-01-31 23:50:00', '2026-02-15 10:00:00'],
            'yearly leap anchor in non-leap year' => [4, '2032-02-29', '2026-01-31 12:00:00', '2026-02-28 10:00:00'],
            'yearly at clamped time advances to leap year' => [4, '2032-02-29', '2027-02-28 10:00:00', '2028-02-29 10:00:00'],
            'yearly cross-year clamp' => [4, '2032-02-29', '2028-12-31 23:59:59', '2029-02-28 10:00:00'],
        ];
    }

    #[DataProvider('dates')]
    public function test_next_reset_uses_business_timezone_and_the_original_anchor(
        int $mode, string $expiryDate, string $now, string $target
    ): void {
        $zone = config('app.timezone');
        $user = new User(['expired_at' => Carbon::parse($expiryDate . ' 10:00:00', $zone)->timestamp]);
        $user->setRelation('plan', new Plan(['reset_traffic_method' => $mode]));
        Carbon::setTestNow(Carbon::parse($now, $zone));
        try {
            $date = app(TrafficResetService::class)->calculateNextResetTime($user);
            $this->assertSame(Carbon::parse($target, $zone)->timestamp, $date?->timestamp);
        } finally {
            Carbon::setTestNow();
        }
    }
}
