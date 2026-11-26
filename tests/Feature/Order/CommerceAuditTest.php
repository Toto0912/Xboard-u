<?php

namespace Tests\Feature\Order;

use App\Console\Commands\CheckCommission;
use App\Exceptions\ApiException;
use App\Http\Controllers\V2\Admin\GiftCardController;
use App\Http\Resources\PlanResource;
use App\Models\CommissionLog;
use App\Models\Coupon;
use App\Models\GiftCardCode;
use App\Models\GiftCardTemplate;
use App\Models\GiftCardUsage;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommerceAuditTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $values = []): User
    {
        return User::withoutEvents(fn () => User::create($values + [
            'uuid' => (string) Str::uuid(), 'email' => Str::random(12).'@example.test',
            'password' => 'fixture', 'token' => Str::random(32),
        ]));
    }

    private function plan(array $values = []): Plan
    {
        return Plan::create($values + ['name' => 'audit', 'group_id' => 1, 'transfer_enable' => 10,
            'prices' => ['monthly' => 1.05], 'renew' => true, 'show' => true, 'sell' => true]);
    }

    private function admin(): string
    {
        Sanctum::actingAs($this->user(['is_admin' => true]));
        return '/api/v2/'.hash('crc32b', config('app.key'));
    }

    private function template(array $values = []): GiftCardTemplate
    {
        return GiftCardTemplate::create($values + ['name' => 'festival', 'type' => GiftCardTemplate::TYPE_GENERAL,
            'rewards' => ['balance' => 100], 'status' => 1, 'admin_id' => 1]);
    }

    public function test_gateway_callback_contract_preserves_signed_optional_fields(): void
    {
        require_once base_path('plugins-core/Mgate/Plugin.php');
        require_once base_path('plugins-core/Epay/Plugin.php');
        $fields = ['trade_no' => 'GW100', 'out_trade_no' => 'Q100', 'note' => ' value ', 'blank' => '', 'tag' => '0'];
        foreach (['EPay' => new \Plugin\Epay\Plugin('epay'), 'MGate' => new \Plugin\Mgate\Plugin('mgate')] as $method => $plugin) {
            $plugin->setConfig(['pid' => 'shop', 'key' => 'fixture-key', 'mgate_app_secret' => 'fixture-key']);
            foreach ([true, false] as $includeEmpty) {
                $data = $fields;
                if (!$includeEmpty) {
                    unset($data['blank']);
                }
                if ($method === 'EPay') {
                    $data += ['money' => '10.21', 'pid' => 'shop', 'trade_status' => 'TRADE_SUCCESS'];
                }
                ksort($data);
                $signed = $method === 'EPay'
                    ? urldecode(http_build_query(array_filter($data, fn ($v) => $v !== '')))
                    : http_build_query($data);
                $data['sign'] = md5($signed.'fixture-key');
                $req = Request::create('/api/v1/guest/payment/notify/'.$method.'/fixture', 'POST', $data);
                $value = (new \App\Http\Middleware\TrimStrings())->handle($req, fn ($r) =>
                    (new \Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull())->handle($r, fn ($r) => $r->input()));
                $this->assertSame('GW100', $plugin->notify($value)['transaction_no']);
                $this->assertFalse($plugin->notify(array_replace($value, ['trade_no' => 'other'])));
                if ($method === 'EPay') {
                    $this->assertSame('10.21', $plugin->notify($value)['verified_order_gross']);
                    unset($value['money']);
                    $this->assertFalse($plugin->notify($value));
                }
            }
        }
    }

    public function test_alipay_requires_matching_signed_merchant_and_gross_amount(): void
    {
        require_once base_path('plugins-core/AlipayF2f/Plugin.php');
        require_once base_path('plugins-core/AlipayF2f/library/AlipayF2F.php');
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $public = openssl_pkey_get_details($key)['key'];
        $plugin = new \Plugin\AlipayF2f\Plugin('alipay_f2f');
        $plugin->setConfig(['app_id' => 'merchant', 'public_key' => preg_replace('/-----[^-]+-----|\s/', '', $public)]);
        $params = ['app_id' => 'merchant', 'out_trade_no' => 'quote-1', 'total_amount' => '10.21',
            'trade_no' => 'gateway-1', 'trade_status' => 'TRADE_SUCCESS'];
        $sign = function (array $fields) use ($key) {
            ksort($fields);
            $message = urldecode(http_build_query($fields));
            openssl_sign($message, $signature, $key, OPENSSL_ALGO_SHA256);
            return $fields + ['sign' => base64_encode($signature), 'sign_type' => 'RSA2'];
        };
        $this->assertSame('10.21', $plugin->notify($sign($params))['verified_order_gross']);
        $this->assertFalse($plugin->notify($sign(array_replace($params, ['app_id' => 'other']))));
        $this->assertFalse($plugin->notify(array_replace($sign($params), ['total_amount' => '10.20'])));
        unset($params['total_amount']);
        $this->assertFalse($plugin->notify($sign($params)));

        $buyer = $this->user();
        $order = OrderService::createFromRequest($buyer, $this->plan(), 'monthly');
        $payment = Payment::create(['payment' => 'AlipayF2F', 'uuid' => Str::random(22), 'enable' => true, 'name' => 'fixture',
            'handling_fee_fixed' => 21, 'config' => $plugin->getConfig()]);
        $attempt = \App\Models\OrderPaymentAttempt::quote($order, $payment, true);
        $plugin->boot();
        $manager = $this->mock(\App\Services\Plugin\PluginManager::class);
        $manager->shouldReceive('initializeEnabledPlugins')->andReturnNull();
        $manager->shouldReceive('getEnabledPaymentPlugins')->andReturn([$plugin]);
        \Illuminate\Support\Facades\Bus::fake([\App\Jobs\OrderHandleJob::class]);
        $notify = '/api/v1/guest/payment/notify/AlipayF2F/'.$payment->uuid;
        $params['out_trade_no'] = $attempt->merchant_reference;
        $params['total_amount'] = '1.25'; // 105 plus 21 minor units are due.
        $this->postJson($notify, $sign($params))->assertStatus(400);
        $this->assertNull($attempt->fresh()->confirmed_at);
        $params['total_amount'] = '1.26';
        $this->postJson($notify, $sign($params))->assertOk();
        $this->postJson($notify, $sign($params))->assertOk();
        $this->assertNotNull($attempt->fresh()->confirmed_at);
        \Illuminate\Support\Facades\Bus::assertDispatchedSync(\App\Jobs\OrderHandleJob::class, 1);
    }

    public function test_legacy_negative_gateway_fee_cannot_issue_new_quote(): void
    {
        $buyer = $this->user();
        $order = OrderService::createFromRequest($buyer, $this->plan(), 'monthly');
        $payment = new Payment(['handling_fee_fixed' => -5]);
        $this->expectException(ApiException::class);
        \App\Models\OrderPaymentAttempt::quote($order, $payment, true);
    }

    public function test_plan_price_cleanup_applies_on_save_and_legacy_zero_is_unsaleable(): void
    {
        $url = $this->admin().'/plan/save';
        $plan = $this->plan();
        $this->postJson($url, ['id' => $plan->id, 'name' => 'audit', 'transfer_enable' => 10,
            'prices' => ['monthly' => 1.05, 'quarterly' => 0, 'yearly' => null]])->assertOk();
        $this->assertEquals(['monthly' => 1.05], $plan->fresh()->prices);
        $plan->update(['prices' => ['monthly' => 1.05, 'quarterly' => 0]]);
        $buyer = $this->user(['balance' => 105]);
        $this->assertNull((new PlanResource($plan))->resolve()['quarter_price']);
        try {
            OrderService::createFromRequest($buyer, $plan, 'quarterly');
            $this->fail('A disabled period was sold');
        } catch (ApiException $e) {
            $this->assertSame(__('This payment period cannot be purchased, please choose another period'), $e->getMessage());
        }
        $order = OrderService::createFromRequest($buyer, $plan, 'monthly');
        $this->assertSame(0, (int) $order->total_amount);
        $this->assertSame(105, (int) $order->balance_amount);
    }

    public function test_commissions_round_half_up_in_minor_units_and_only_null_inherits(): void
    {
        admin_setting(['invite_commission' => 10]);
        $parent = $this->user(['commission_type' => User::COMMISSION_TYPE_PERIOD]);
        $plan = $this->plan();
        foreach ([[null, 11], [0, 0], [5, 5]] as [$rate, $expected]) {
            $parent->update(['commission_rate' => $rate]);
            $buyer = $this->user(['invite_user_id' => $parent->id]);
            $order = OrderService::createFromRequest($buyer, $plan, 'monthly');
            $this->assertSame($expected, (int) $order->fresh()->commission_balance);
        }
    }

    public function test_auto_approval_accepts_fulfilled_and_discounted_once_after_hold(): void
    {
        admin_setting(['commission_auto_check_enable' => 1, 'commission_distribution_enable' => 0, 'withdraw_close_enable' => 0]);
        $parent = $this->user();
        $buyer = $this->user(['invite_user_id' => $parent->id]);
        $plan = $this->plan();
        foreach ([[3, 4, true], [4, 4, true], [2, 4, false], [4, 0, false]] as [$status, $days, $eligible]) {
            $order = Order::create(['user_id' => $buyer->id, 'plan_id' => $plan->id, 'period' => 'monthly',
                'trade_no' => (string) Str::uuid(), 'type' => Order::TYPE_NEW_PURCHASE, 'status' => $status,
                'total_amount' => 100, 'commission_balance' => 10, 'invite_user_id' => $parent->id]);
            DB::table('v2_order')->where('id', $order->id)->update(['updated_at' => time()-$days*86400]);
            app(CheckCommission::class)->autoCheck();
            $this->assertSame($eligible ? 1 : 0, (int) $order->fresh()->commission_status);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->artisan('check:commission')->assertSuccessful();
        }
        $this->assertSame(2, CommissionLog::count());
        $this->assertSame(20, (int) $parent->fresh()->commission_balance);
    }

    public function test_plan_capacity_default_is_null_and_explicit_zero_keeps_its_meaning(): void
    {
        $this->assertNull($this->plan()->fresh()->capacity_limit);
        $this->assertSame(0, (int) $this->plan(['capacity_limit' => 0])->fresh()->capacity_limit);
        $this->assertSame(12, (int) $this->plan(['capacity_limit' => 12])->fresh()->capacity_limit);
    }

    public function test_festival_bonus_scales_grant_quantities_but_preserves_identity_rates_and_flags(): void
    {
        $rewards = ['plan_id' => 7, 'invite_reward_rate' => 0.25, 'balance' => 10, 'plan_validity_days' => 3,
            'reset_traffic' => true, 'transfer_enable' => 8];
        $template = $this->template(['rewards' => $rewards, 'special_config' => [
            'festival_bonus' => 2, 'start_time' => time()-50, 'end_time' => time()+50,
        ]]);
        $this->assertEquals(array_replace($rewards, ['plan_validity_days' => 6, 'balance' => 20, 'transfer_enable' => 16]),
            $template->calculateActualRewards($this->user()));
        $template->update(['special_config' => ['festival_bonus' => 2, 'start_time' => 10, 'end_time' => 20]]);
        $this->assertSame($rewards, $template->calculateActualRewards($this->user()));
    }

    public function test_gift_lists_return_selected_fields_and_template_counts_without_per_item_queries(): void
    {
        $user = $this->user();
        $template = $this->template();
        $this->template();
        $code = GiftCardCode::create(['code' => 'FIXTURE0001', 'template_id' => $template->id, 'user_id' => $user->id]);
        GiftCardUsage::create(['code_id' => $code->id, 'template_id' => $template->id, 'user_id' => $user->id,
            'rewards_given' => [], 'created_at' => time()]);
        $controller = app(GiftCardController::class);
        DB::enableQueryLog();
        $templates = $controller->templates(Request::create('/'))->getData(true)['data'];
        $this->assertCount(2, DB::getQueryLog());
        DB::disableQueryLog();
        $row = collect($templates)->firstWhere('id', $template->id);
        $this->assertSame(1, (int) $row['codes_count']);
        $this->assertSame(1, (int) $row['used_count']);
        $codes = $controller->codes(Request::create('/'))->getData(true)['data'];
        $this->assertStringEndsWith('***@***', $codes[0]['user_email']);
        $this->assertArrayNotHasKey('user', $codes[0]);
        $usage = $controller->usages(Request::create('/'))->getData(true)['data'][0];
        $this->assertSame($code->code, $usage['code']);
        $this->assertSame($user->email, $usage['user_email']);
        $this->assertArrayNotHasKey('user', $usage);
    }

    public function test_bulk_gift_codes_keep_inserts_bounded_and_all_rows_unique(): void
    {
        $template = $this->template();
        DB::enableQueryLog();
        $batch = GiftCardCode::batchGenerate($template->id, 10000, ['prefix' => 'ABCDEFGHIJ']);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(100, $queries);
        $this->assertLessThanOrEqual(999, max(array_map(fn ($q) => count($q['bindings']), $queries)));
        $this->assertSame(10000, GiftCardCode::where('batch_id', $batch)->distinct()->count('code'));
        $this->assertTrue(GiftCardCode::validateCodeFormat(GiftCardCode::where('batch_id', $batch)->value('code')));
    }

    public function test_later_gift_insert_failure_rolls_back_prior_chunk(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            $this->markTestSkipped('SQLite trigger fixture');
        }
        $template = $this->template();
        DB::unprepared("CREATE TRIGGER fail_gift_insert BEFORE INSERT ON v2_gift_card_code WHEN (SELECT COUNT(*) FROM v2_gift_card_code) >= 100 BEGIN SELECT RAISE(ABORT, 'fixture'); END");
        try {
            GiftCardCode::batchGenerate($template->id, 201);
            $this->fail('Last batch unexpectedly succeeded');
        } catch (QueryException $exception) {
            $this->assertStringContainsString('fixture', $exception->getMessage());
        }
        $this->assertSame(0, GiftCardCode::count());
    }

    public function test_coupon_csv_contains_saved_codes_and_missing_update_releases_transaction(): void
    {
        $url = $this->admin().'/coupon';
        $params = ['generate_count' => 55, 'name' => 'sale,"special"', 'type' => 1, 'value' => 150,
            'started_at' => time()-30, 'ended_at' => time()+86400, 'limit_plan_ids' => [3], 'limit_period' => ['monthly']];
        $res = $this->postJson($url.'/generate', $params)->assertOk();
        $body = $res->streamedContent();
        $rows = array_map(fn ($row) => str_getcsv($row, ',', '"', ''), explode("\r\n", trim($body)));
        $this->assertCount(56, $rows);
        $this->assertSame($params['name'], $rows[1][0]);
        $this->assertSame(55, Coupon::whereIn('code', array_column(array_slice($rows, 1), 7))->count());
        $this->assertSame([3], Coupon::first()->limit_plan_ids);
        $level = DB::transactionLevel();
        $this->postJson($url.'/update', ['id' => 99999, 'show' => 0])->assertStatus(400);
        $this->assertSame($level, DB::transactionLevel());
        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("CREATE TRIGGER fail_coupon_insert BEFORE INSERT ON v2_coupon WHEN (SELECT COUNT(*) FROM v2_coupon) >= 105 BEGIN SELECT RAISE(ABORT, 'fixture'); END");
            $this->postJson($url.'/generate', $params)->assertStatus(500);
            $this->assertSame(55, Coupon::count());
            $this->assertSame($level, DB::transactionLevel());
            $this->postJson($url.'/update', ['id' => Coupon::first()->id, 'show' => 0])->assertOk();
            $this->assertEquals(0, Coupon::first()->show);
        }
    }

    public function test_negative_fixed_payment_fee_is_rejected_without_mutating_current_quote(): void
    {
        $url = $this->admin().'/payment/save';
        admin_setting(['app_url' => 'https://example.test']);
        $params = ['name' => 'fixture', 'payment' => 'EPay', 'config' => ['pid' => 27]];
        $this->postJson($url, $params + ['handling_fee_fixed' => 5])->assertOk();
        $payment = Payment::where('name', 'fixture')->firstOrFail();
        $this->postJson($url, $params + ['id' => $payment->id, 'handling_fee_fixed' => -1])->assertUnprocessable();
        $this->assertSame(5, (int) $payment->fresh()->handling_fee_fixed);
        $this->postJson($url, $params + ['id' => $payment->id, 'handling_fee_fixed' => 0])->assertOk();
    }

    public function test_assigned_order_uses_current_entitlement_and_requires_explicit_amount(): void
    {
        $url = $this->admin().'/order/assign';
        $plan = $this->plan();
        $other = $this->plan();
        foreach ([[$plan, time()-60, Order::TYPE_NEW_PURCHASE], [$plan, null, Order::TYPE_RENEWAL],
            [$other, time()+86400, Order::TYPE_UPGRADE]] as [$presentPlan, $expiry, $type]) {
            $user = $this->user(['plan_id' => $presentPlan->id, 'expired_at' => $expiry]);
            $params = ['email' => $user->email, 'plan_id' => $plan->id, 'period' => 'month_price'];
            $this->postJson($url, $params + ['total_amount' => ''])->assertUnprocessable();
            $this->postJson($url, $params + ['total_amount' => 0])->assertOk();
            $this->assertSame($type, (int) Order::where('user_id', $user->id)->firstOrFail()->type);
        }
    }

    public function test_historical_negative_balance_is_preserved_during_order_and_cancellation(): void
    {
        $buyer = $this->user(['balance' => -215]);
        $order = OrderService::createFromRequest($buyer, $this->plan(), 'monthly');
        $this->assertSame(105, (int) $order->total_amount);
        $this->assertSame(0, (int) $order->balance_amount);
        $this->assertSame(-215, (int) $buyer->fresh()->balance);
        $order->update(['balance_amount' => -15]);
        $this->assertTrue((new OrderService($order))->cancel());
        $this->assertSame(-215, (int) $buyer->fresh()->balance);
    }
}
