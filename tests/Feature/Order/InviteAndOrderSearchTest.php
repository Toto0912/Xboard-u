<?php

namespace Tests\Feature\Order;

use App\Models\CommissionLog;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InviteAndOrderSearchTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $values = []): User
    {
        return User::withoutEvents(fn () => User::create($values + [
            'uuid' => (string) Str::uuid(), 'email' => Str::random(12).'@example.test',
            'password' => 'fixture', 'token' => Str::random(32),
        ]));
    }

    private function plan(): Plan
    {
        return Plan::create(['name' => 'fixture', 'group_id' => 1, 'transfer_enable' => 10,
            'prices' => ['monthly' => 1.05], 'renew' => true, 'show' => true, 'sell' => true]);
    }

    private function purchase(User $buyer, Plan $plan): Order
    {
        Sanctum::actingAs($buyer);
        $number = $this->postJson('/api/v1/user/order/save', ['plan_id' => $plan->id, 'period' => 'month_price'])
            ->assertOk()->json('data');
        return Order::where('trade_no', $number)->firstOrFail();
    }

    private function stats(User $inviter): array
    {
        Sanctum::actingAs($inviter);
        return $this->getJson('/api/v1/user/invite/fetch')->assertOk()->json('data.stat');
    }

    private function aged(Order $order, int $status): void
    {
        DB::table('v2_order')->where('id', $order->id)->update(['status' => $status, 'updated_at' => time()-4*86400]);
    }

    public function test_invite_percent_pending_and_wallet_agree_for_inherited_zero_and_custom_commission(): void
    {
        admin_setting(['invite_commission' => 10, 'commission_distribution_enable' => 0, 'commission_auto_check_enable' => 1,
            'withdraw_close_enable' => 0]);
        $plan = $this->plan();
        foreach ([[null, 10, 11], [0, 0, 0], [5, 5, 5]] as [$rate, $displayed, $cents]) {
            $inviter = $this->user(['commission_rate' => $rate, 'commission_type' => User::COMMISSION_TYPE_PERIOD]);
            $order = $this->purchase($this->user(['invite_user_id' => $inviter->id]), $plan);
            $this->assertSame(105, (int) $order->total_amount);
            $this->assertSame($cents, (int) $order->commission_balance);
            $this->aged($order, Order::STATUS_COMPLETED);
            $stats = $this->stats($inviter);
            $this->assertSame([$cents, $displayed], [$stats[2], $stats[3]]);
            $this->artisan('check:commission')->assertSuccessful();
            $credited = CommissionLog::where('trade_no', $order->trade_no);
            $this->assertSame($cents > 0 ? 1 : 0, $credited->count());
            $this->assertSame($cents, (int) $credited->sum('get_amount'));
            $stats = $this->stats($inviter);
            $this->assertSame([$cents, 0, $displayed, $cents], array_slice($stats, 1));
        }
    }

    public function test_first_level_estimate_rounds_each_eligible_order_including_discounted_orders(): void
    {
        admin_setting(['commission_distribution_enable' => 1, 'commission_distribution_l1' => 50,
            'commission_distribution_l2' => 0, 'commission_distribution_l3' => 0,
            'commission_auto_check_enable' => 1, 'withdraw_close_enable' => 0]);
        $inviter = $this->user(['commission_rate' => 1, 'commission_type' => User::COMMISSION_TYPE_PERIOD]);
        $plan = $this->plan();
        $orders = [];
        foreach ([Order::STATUS_COMPLETED, Order::STATUS_DISCOUNTED, Order::STATUS_CANCELLED] as $status) {
            $order = $this->purchase($this->user(['invite_user_id' => $inviter->id]), $plan);
            $this->assertSame(1, (int) $order->commission_balance);
            $this->aged($order, $status);
            $orders[] = $order;
        }
        $this->assertSame(2, $this->stats($inviter)[2]);
        $this->artisan('check:commission')->assertSuccessful();
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame([2, 0, 1, 2], array_slice($this->stats($inviter), 1));
        foreach ($orders as $i => $order) {
            $logs = CommissionLog::where('trade_no', $order->trade_no)->pluck('get_amount')->map(fn ($v) => (int) $v)->all();
            $this->assertSame($i < 2 ? [1] : [], $logs);
        }
    }

    public function test_admin_order_filter_preserves_issued_reference_and_legacy_credit_field(): void
    {
        $plan = $this->plan();
        $first = $this->purchase($this->user(), $plan);
        $second = $this->purchase($this->user(), $plan);
        $first->update(['callback_no' => '0000123409876500012345', 'surplus_credit' => 2, 'total_amount' => 2]);
        $second->update(['callback_no' => '123409876500012345', 'surplus_credit' => 11, 'total_amount' => 11]);
        Sanctum::actingAs($this->user(['is_admin' => true]));
        $url = '/api/v2/'.hash('crc32b', config('app.key')).'/order/fetch';
        foreach ([$first, $second] as $order) {
            $this->assertMatchesRegularExpression('/^[0-9]{25}$/', $order->trade_no);
            $params = ['filter' => [['id' => 'trade_no', 'value' => 'like:'.$order->trade_no]]];
            $this->postJson($url, $params)->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $order->id);
        }
        foreach ([['trade_no', 'like:'.substr($first->trade_no, 0, 8), 2],
            ['callback_no', 'eq:0000123409876500012345', 1], ['callback_no', 'eq:123409876500012345', 1],
            ['surplus_credit', 'gte:10', 1], ['refund_amount', 'gte:10', 1]] as [$field, $value, $count]) {
            $res = $this->postJson($url, ['filter' => [['id' => $field, 'value' => $value]]])->assertOk()->assertJsonPath('total', $count);
            if ($field !== 'trade_no') {
                $res->assertJsonPath('data.0.id', str_contains($value, ':0000') ? $first->id : $second->id);
            }
        }
        foreach (['total_amount', 'refund_amount', 'surplus_credit'] as $field) {
            $this->postJson($url, ['sort' => [['id' => $field, 'desc' => true]]])->assertOk()->assertJsonPath('data.0.id', $second->id);
        }
        foreach (['eq:invalid', [2, 'invalid']] as $invalid) {
            $this->postJson($url, ['filter' => [['id' => 'total_amount', 'value' => $invalid]]])->assertUnprocessable();
        }
        foreach ([['like:11', 1], ['gt:2.5', 1], ['eq:3000000000', 0], [['0002', '3000000000'], 1]] as [$value, $count]) {
            $this->postJson($url, ['filter' => [['id' => 'total_amount', 'value' => $value]]])->assertOk()->assertJsonPath('total', $count);
        }
        $this->postJson($url, ['filter' => [['id' => 'retired', 'value' => 'eq:10']]])->assertUnprocessable();
    }
}
