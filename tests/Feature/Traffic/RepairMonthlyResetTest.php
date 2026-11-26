<?php

namespace Tests\Feature\Traffic;

use App\Models\Plan;
use App\Models\TrafficResetLog;
use App\Models\User;
use App\Services\TrafficResetService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RepairMonthlyResetTest extends TestCase
{
    use RefreshDatabase;

    private function at(string $date): int
    {
        return CarbonImmutable::parse($date, config('app.timezone'))->timestamp;
    }

    private function user(int $id, array $changes = [], ?int $mode = Plan::RESET_TRAFFIC_MONTHLY): User
    {
        $plan = Plan::create(['name' => "plan {$id}", 'group_id' => 1, 'transfer_enable' => 100, 'reset_traffic_method' => $mode]);
        return User::withoutEvents(fn () => User::forceCreate($changes + [
            'id' => $id, 'plan_id' => $plan->id, 'group_id' => 1, 'email' => "repair-{$id}@example.test",
            'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id), 'password' => 'fixture', 'token' => sprintf('%032d', $id),
            'u' => 3, 'd' => 7, 'transfer_enable' => 100, 'reset_count' => 1,
            'expired_at' => $this->at('2037-03-31 10:00'), 'next_reset_at' => $this->at('2027-03-03 10:00'),
            'last_reset_at' => $this->at('2027-01-31 10:00'), 'created_at' => $this->at('2027-01-01'),
            'updated_at' => $this->at('2027-02-10'),
        ]));
    }

    private function repair(bool $apply = true): void
    {
        $this->artisan('reset:repair-month', ['month' => '2027-02', '--apply' => $apply])->assertSuccessful();
    }

    public function test_preview_and_apply_distinguish_a_completed_reset_from_a_pending_one(): void
    {
        $this->travelTo(CarbonImmutable::parse('2027-03-01 12:00', config('app.timezone')));
        admin_setting(['reset_traffic_method' => Plan::RESET_TRAFFIC_MONTHLY]);
        $done = $this->user(1, ['last_reset_at' => $this->at('2027-02-28 10:01'),
            'updated_at' => $this->at('2027-02-28 10:01')]);
        $waiting = $this->user(2, [], null);
        $ambiguous = $this->user(3, ['updated_at' => $this->at('2027-03-01')]);
        $regular = $this->user(4, ['next_reset_at' => $this->at('2027-02-28 10:00')]);
        $otherMode = $this->user(5, [], Plan::RESET_TRAFFIC_FIRST_DAY_MONTH);
        $old = $this->at('2027-03-03 10:00');
        $due = $this->at('2027-02-28 10:00');
        $this->repair(false);
        $this->assertSame($old, $done->fresh()->next_reset_at);
        $this->assertSame($old, $waiting->fresh()->next_reset_at);
        $this->repair();
        $this->repair();
        foreach ([[$done, $this->at('2027-03-31 10:00')], [$waiting, $due], [$ambiguous, $old],
            [$regular, $due], [$otherMode, $old]] as [$user, $expected]) {
            $original = $user->fresh()->getRawOriginal();
            $this->assertSame($expected, $original['next_reset_at']);
            $this->assertSame($user->u, $original['u']);
            $this->assertSame($user->d, $original['d']);
            $this->assertSame($user->reset_count, $original['reset_count']);
            $this->assertSame($user->last_reset_at, $original['last_reset_at']);
        }
        $this->assertSame(0, TrafficResetLog::count());
    }

    public function test_future_boundary_and_repair_racing_a_new_schedule(): void
    {
        $this->travelTo(CarbonImmutable::parse('2027-02-20 12:00', config('app.timezone')));
        $waiting = $this->user(11);
        $changed = $this->user(12);
        $replacement = $this->at('2027-04-30 10:00');
        $raced = false;
        User::retrieved(function (User $row) use ($changed, $replacement, &$raced) {
            if (!$raced && $row->id === $changed->id) {
                $raced = true;
                DB::table('v2_user')->where('id', $row->id)->update(['next_reset_at' => $replacement]);
            }
        });
        $this->repair();
        $this->assertTrue($raced);
        $this->assertSame($this->at('2027-02-28 10:00'), $waiting->fresh()->next_reset_at);
        $this->assertSame($replacement, $changed->fresh()->next_reset_at);
    }

    public function test_a_preselected_worker_skips_a_corrected_date_and_regular_cron_still_resets_due_users_once(): void
    {
        $due = time() - 30;
        $future = time() + 86400;
        $user = $this->user(21, ['next_reset_at' => $due, 'expired_at' => time() + 90 * 86400]);
        $waiting = $this->user(22, ['next_reset_at' => $due, 'expired_at' => time() + 90 * 86400]);
        $stale = $user->fresh();
        DB::table('v2_user')->where('id', $user->id)->update(['next_reset_at' => $future]);
        $service = app(TrafficResetService::class);
        $this->assertFalse($service->checkAndReset($stale, TrafficResetLog::SOURCE_CRON));
        $this->artisan('reset:traffic')->assertSuccessful();
        $this->artisan('reset:traffic')->assertSuccessful();
        $this->assertSame(10, $user->fresh()->getTotalUsedTraffic());
        $this->assertSame(0, $waiting->fresh()->getTotalUsedTraffic());
        $this->assertSame(1, TrafficResetLog::where('user_id', $waiting->id)->count());
        $this->assertSame(0, TrafficResetLog::where('user_id', $user->id)->count());
    }
}
