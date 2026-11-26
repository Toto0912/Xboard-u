<?php

namespace Tests\Feature\Order;

use App\Models\Order;
use App\Models\Plan;
use App\Models\TrafficResetLog;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Plugin\HookManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OrderTrafficResetTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(bool $oneTime, bool $switch, int $event, string $period): array
    {
        admin_setting(['change_order_event_id' => $event, 'renew_order_event_id' => $event,
            'plan_change_enable' => 1, 'surplus_enable' => 0]);
        $fields = ['prices' => ['monthly' => 10, 'onetime' => 10], 'name' => 'Fixture',
            'show' => true, 'sell' => true, 'renew' => true, 'capacity_limit' => null];
        $old = Plan::create($fields + ['group_id' => 1, 'transfer_enable' => 100]);
        $target = $switch ? Plan::create($fields + ['group_id' => 2, 'transfer_enable' => 50]) : $old;
        $user = User::create(['email' => 'reset@example.test', 'password' => 'fixture',
            'uuid' => '00000000-0000-4000-8000-000000000001', 'token' => str_repeat('a', 32),
            'plan_id' => $old->id, 'group_id' => $old->group_id, 'expired_at' => $oneTime ? null : time() + 86400,
            'transfer_enable' => 100 * 1073741824, 'u' => 60 * 1073741824, 'd' => 20 * 1073741824]);
        $order = OrderService::createFromRequest($user, $target, $period);
        $order->update(['status' => Order::STATUS_PROCESSING]);
        return [$user, $target, $order];
    }

    public static function transitions(): array
    {
        return [
            'one-time to other monthly' => [true, true, 0, 'monthly', true],
            'one-time to other monthly plus event' => [true, true, 1, 'monthly', true],
            'same plan one-time to monthly' => [true, false, 0, 'monthly', true],
            'ordinary renewal' => [false, false, 0, 'monthly', false],
            'ordinary change' => [false, true, 0, 'monthly', false],
            'ordinary change with reset event' => [false, true, 1, 'monthly', true],
            'one-time purchase with reset event' => [false, true, 1, 'onetime', true],
        ];
    }

    #[DataProvider('transitions')]
    public function test_order_open_resets_usage_once_when_required(bool $oneTime, bool $switch, int $event, string $period, bool $reset): void
    {
        [$user, $target, $order] = $this->fixture($oneTime, $switch, $event, $period);
        (new OrderService($order))->open();
        (new OrderService($order))->open();
        $user->refresh();
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $this->assertSame($target->id, $user->plan_id);
        $this->assertSame($target->group_id, $user->group_id);
        $this->assertSame($target->transfer_enable * 1073741824, $user->transfer_enable);
        $this->assertSame($period === 'onetime', $user->expired_at === null);
        $this->assertSame($reset ? 0 : 80 * 1073741824, $user->u + $user->d);
        $this->assertSame((int) $reset, $user->reset_count);
        $logs = TrafficResetLog::where('user_id', $user->id)->where('trigger_source', TrafficResetLog::SOURCE_ORDER)->get();
        $this->assertCount((int) $reset, $logs);
        if ($reset) {
            $this->assertSame(80 * 1073741824, $logs->first()->old_total);
        }
    }

    public function test_failed_reset_rolls_back_the_whole_one_time_to_monthly_upgrade(): void
    {
        [$user, , $order] = $this->fixture(true, true, 1, 'monthly');
        $before = $user->fresh()->getRawOriginal();
        HookManager::register('traffic.reset.after', fn () => throw new \RuntimeException('fixture reset failure'));
        try {
            (new OrderService($order))->open();
            $this->fail('Reset failure must abort opening');
        } catch (\RuntimeException $e) {
            $this->assertSame('流量重置失败', $e->getMessage());
        }
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertSame(Order::STATUS_PROCESSING, $order->fresh()->status);
        $this->assertSame(0, TrafficResetLog::count());
    }
}
