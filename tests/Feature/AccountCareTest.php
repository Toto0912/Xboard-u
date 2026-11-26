<?php

namespace Tests\Feature;

use App\Exceptions\ApiException;
use App\Http\Controllers\V1\Guest\TelegramController;
use App\Http\Controllers\V1\User\KnowledgeController;
use App\Http\Controllers\V2\Admin\ConfigController;
use App\Http\Middleware\RequestLog;
use App\Jobs\SendEmailJob;
use App\Models\AdminAuditLog;
use App\Models\Knowledge;
use App\Models\MailLog;
use App\Models\MailTemplate;
use App\Models\Ticket;
use App\Models\User;
use App\Services\Auth\LoginService;
use App\Services\Auth\LoginTicket;
use App\Services\AuthService;
use App\Services\MailService;
use App\Services\TicketService;
use App\Utils\CacheKey;
use App\Utils\Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AccountCareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Queue::fake();
    }

    private function user(string $name, array $attributes = []): User
    {
        return User::create($attributes + [
            'email' => $name . '@example.org',
            'password' => password_hash('old-password', PASSWORD_DEFAULT),
            'uuid' => Helper::guid(true),
            'token' => Helper::guid(),
        ]);
    }

    public function test_ticket_service_checks_ownership_and_latest_open_state_and_staff_email_renders_plain_text(): void
    {
        $owner = $this->user('owner');
        $other = $this->user('other');
        $staff = $this->user('staff', ['is_staff' => 1]);
        $service = app(TicketService::class);
        $ticket = $service->createTicket($owner->id, 'subject <draft>', 1, 'Question');
        $this->assertFalse($service->reply($ticket, 'Note', $other->id));
        $this->assertSame(1, $ticket->messages()->count());
        $this->assertNotFalse($service->reply($ticket, 'More information', $owner->id));
        $service->replyByAdmin($ticket->id, "Line \"one\"\nLine <two>", $staff->id);
        $this->assertEquals(Ticket::REPLY_STATUS_REPLIED, $ticket->fresh()->reply_status);
        $job = Queue::pushed(SendEmailJob::class)->first();
        $this->assertNotNull($job);
        Mail::shouldReceive('send')->once()->andReturnUsing(function ($view, $data) {
            $html = view($view, $data)->render();
            $this->assertStringContainsString('&lt;draft&gt;', $html);
            $this->assertStringContainsString('&lt;two&gt;', $html);
            $this->assertStringContainsString('&quot;one&quot;', $html);
            $this->assertStringContainsString('<br', $html);
        });
        $job->handle();
        MailTemplate::create(['name' => 'notify', 'subject' => 'Reply', 'content' => '<p>{{content}}</p>']);
        Cache::forget('mail_template:notify');
        Mail::shouldReceive('html')->once()->andReturnUsing(function ($html) {
            $this->assertStringStartsWith('<p>', $html);
            $this->assertStringContainsString('&lt;two&gt;', $html);
            $this->assertStringNotContainsString('&amp;lt;', $html);
        });
        $job->handle();
        Ticket::whereKey($ticket->id)->update(['status' => Ticket::STATUS_CLOSED]);
        $this->assertFalse($service->reply($ticket, 'Later', $staff->id));
        $this->assertSame(3, $ticket->messages()->count());
    }

    public function test_short_tickets_follow_token_lifetime_account_status_and_single_redemption(): void
    {
        $user = $this->user('devices');
        $token = $user->createToken('device');
        $actor = AuthService::findUserByBearerToken('Bearer ' . $token->plainTextToken);
        $this->assertSame($user->id, $actor->id);
        $code = LoginTicket::issue($actor, 60);
        $key = CacheKey::get('TEMP_TOKEN', $code);
        $lock = Cache::lock($key . ':consume', 10);
        $this->assertTrue($lock->get());
        $this->assertNull(LoginTicket::consume($code));
        $lock->release();
        $this->assertSame($user->id, DB::transaction(fn () => LoginTicket::consume($code))->id);
        $this->assertNull(LoginTicket::consume($code));
        $outstanding = LoginTicket::issue($actor, 60);
        $token->accessToken->delete();
        $this->assertNull(AuthService::findUserByBearerToken($token->plainTextToken));
        $this->assertNull(LoginTicket::consume($outstanding));
        $expired = $user->createToken('expired', ['*'], now()->subMinute());
        $this->assertNull(AuthService::findUserByBearerToken($expired->plainTextToken));
        $limited = $user->createToken('configured-expiry');
        $limited->accessToken->forceFill(['created_at' => now()->subMinutes(5)])->save();
        config(['sanctum.expiration' => 2]);
        $this->assertNull(AuthService::findUserByBearerToken($limited->plainTextToken));
        $expiring = LoginTicket::issue($user, 1);
        $this->travel(2)->seconds();
        $this->assertNull(LoginTicket::consume($expiring));
        $this->travelBack();
        $valid = $user->createToken('active');
        $pending = LoginTicket::issue($user, 60);
        $user->update(['banned' => 1]);
        $this->assertNull(AuthService::findUserByBearerToken($valid->plainTextToken));
        $this->assertNull(LoginTicket::consume($pending));
        $this->assertSame('dashboard', LoginTicket::redirectPath('https://example.org/'));
        $this->assertSame('/order/detail?id=1', LoginTicket::redirectPath('/order/detail?id=1'));
        $this->assertStringContainsString('redirect=%2Forder%2Fdetail%3Fid%3D1', LoginTicket::loginPath('test', '/order/detail?id=1'));
    }

    public function test_failed_password_recovery_preserves_devices_and_success_revokes_both_and_old_ticket(): void
    {
        $user = $this->user('recover');
        $service = app(LoginService::class);
        $user->createToken('desktop');
        $user->createToken('mobile');
        $pending = LoginTicket::issue($user, 60);
        Cache::put(CacheKey::get('EMAIL_VERIFY_CODE', $user->email), '123456', 300);
        $this->assertFalse($service->resetPassword($user->email, 'invalid', 'new-password')[0]);
        $this->assertSame(2, $user->tokens()->count());
        $this->assertTrue($service->resetPassword($user->email, '123456', 'new-password')[0]);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertNull(LoginTicket::consume($pending));
        $this->assertTrue($service->login($user->email, 'new-password')[0]);
    }

    public function test_audit_keeps_operator_object_and_fields_without_values_or_query_string(): void
    {
        $user = $this->user('admin', ['is_admin' => 1]);
        $request = Request::create('/api/v2/admin/config/save?item=test-private-value', 'POST', [
            'id' => 9, 'email_password' => 'test-private-value', 'server_token' => 'test-private-value',
            'telegram_bot_token' => 'test-private-value', 'plugin' => ['settings' => ['payment_key' => 'test-private-value']],
        ]);
        $request->setUserResolver(fn () => $user);
        (new RequestLog())->handle($request, fn () => response()->json(true));
        $entry = AdminAuditLog::sole();
        $this->assertEquals($user->id, $entry->admin_id);
        $this->assertSame('config.save', $entry->action);
        $this->assertSame(9, json_decode($entry->request_data, true)['id']);
        $this->assertStringContainsString('plugin', $entry->request_data);
        $this->assertStringNotContainsString('test-private-value', $entry->toJson());
    }

    public function test_mail_response_is_safe_and_log_failure_does_not_repeat_delivery(): void
    {
        $user = $this->user('mailer');
        $request = Request::create('/');
        $request->setUserResolver(fn () => $user);
        $controller = app(ConfigController::class);
        config(['mail.password' => 'test-private-value']);
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('test-private-value'));
        $failed = $controller->testSendMail($request);
        $this->assertSame(502, $failed->getStatusCode());
        $this->assertStringNotContainsString('test-private-value', $failed->getContent());
        $this->assertStringNotContainsString('test-private-value', MailLog::sole()->toJson());
        MailLog::creating(static function () {
            throw new \RuntimeException('test log unavailable');
        });
        Mail::shouldReceive('send')->once();
        $ok = $controller->testSendMail($request);
        $this->assertSame(200, $ok->getStatusCode());
        $this->assertTrue($ok->getData(true)['data']);
    }

    public function test_knowledge_search_uses_only_visible_text(): void
    {
        $guest = $this->user('reader');
        $subscriber = $this->user('subscriber', ['transfer_enable' => 100, 'expired_at' => null]);
        Knowledge::create(['title' => 'Help', 'category' => 'Guides', 'language' => 'en-US', 'show' => 1, 'sort' => 1,
            'body' => 'Public sample <!--access start-->Member reference<!--access end-->']);
        $search = function (User $user, string $keyword) {
            $request = Request::create('/', 'GET', ['language' => 'en-US', 'keyword' => $keyword]);
            $request->setUserResolver(fn () => $user);
            return app(KnowledgeController::class)->fetch($request)->getData(true)['data'];
        };
        $this->assertEmpty($search($guest, 'reference'));
        $this->assertNotEmpty($search($guest, 'Public'));
        $this->assertEmpty($search($guest, '%'));
        $this->assertNotEmpty($search($subscriber, 'reference'));
    }

    public function test_shared_verification_uses_provider_outcome_and_v3_score(): void
    {
        admin_setting(['captcha_enable' => 1, 'captcha_type' => 'turnstile', 'turnstile_secret_key' => 'fixture']);
        Http::fake(['*' => Http::sequence()
            ->push([], 503)->push(['success' => 'yes'])->push(['success' => false])->push(['success' => true])
            ->push(['success' => true, 'score' => 0.1])->push(['success' => true, 'score' => 0.9])]);
        $service = app(\App\Services\CaptchaService::class);
        $request = Request::create('/', 'POST', ['turnstile_token' => 'challenge']);
        $this->assertSame(503, $service->verify($request)[1][0]);
        $this->assertSame(503, $service->verify($request)[1][0]);
        $this->assertSame(400, $service->verify($request)[1][0]);
        $this->assertTrue($service->verify($request)[0]);
        admin_setting(['captcha_type' => 'recaptcha-v3', 'recaptcha_v3_secret_key' => 'fixture']);
        $request = Request::create('/', 'POST', ['recaptcha_v3_token' => 'challenge']);
        $this->assertFalse($service->verify($request)[0]);
        $this->assertTrue($service->verify($request)[0]);
    }

    public function test_login_failure_budget_and_email_resend_expiration(): void
    {
        $user = $this->user('rate');
        admin_setting(['password_limit_enable' => 1, 'password_limit_count' => 2, 'password_limit_expire' => 1]);
        $service = app(LoginService::class);
        $this->assertSame(400, $service->login($user->email, 'incorrect')[1][0]);
        $this->assertTrue($service->login(strtoupper($user->email), 'old-password')[0]);
        $this->assertSame(400, $service->login($user->email, 'incorrect')[1][0]);
        $this->assertSame(429, $service->login($user->email, 'incorrect')[1][0]);
        $key = CacheKey::get('LAST_SEND_EMAIL_VERIFY_TIMESTAMP', $user->email);
        $request = \App\Http\Requests\Passport\CommSendEmailVerify::create('/', 'POST', ['email' => $user->email]);
        $controller = app(\App\Http\Controllers\V1\Passport\CommController::class);
        $this->assertSame(200, $controller->sendEmailVerify($request)->getStatusCode());
        $this->assertSame(400, $controller->sendEmailVerify($request)->getStatusCode());
        $challenge = Cache::get(CacheKey::get('EMAIL_VERIFY_CODE', $user->email));
        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $challenge['code']);
        $this->assertFalse(\App\Services\Auth\EmailChallenge::matches($user->email, 'register', (string) $challenge['code']));
        $this->assertTrue(\App\Services\Auth\EmailChallenge::matches($user->email, 'reset', (string) $challenge['code']));
        Cache::forget($key);
        $this->assertSame(200, $controller->sendEmailVerify($request)->getStatusCode());
        Queue::assertPushed(SendEmailJob::class, 2);
    }

    public function test_admin_coupon_cents_and_periods_filter_units_and_persian_knowledge(): void
    {
        $admin = $this->user('admin-ui', ['is_admin' => 1]);
        \Laravel\Sanctum\Sanctum::actingAs($admin);
        $base = '/api/v2/' . hash('crc32b', config('app.key'));
        $payload = ['name' => 'Sample', 'type' => 1, 'code' => 'sample', 'value' => 50, 'started_at' => time()-30,
            'ended_at' => time()+600, 'limit_period' => ['monthly', 'month_price', 'quarter_price']];
        $this->postJson($base . '/coupon/generate', $payload)->assertOk();
        $coupon = \App\Models\Coupon::where('code', 'sample')->sole();
        $this->assertSame(['monthly', 'quarterly'], json_decode($coupon->getRawOriginal('limit_period'), true));
        $this->postJson($base . '/coupon/show', ['id' => $coupon->id])->assertOk();
        $order = new \App\Models\Order(['user_id' => $admin->id, 'period' => 'month_price', 'total_amount' => 100, 'plan_id' => 1]);
        $this->assertTrue((new \App\Services\CouponService('sample'))->use($order));
        $this->assertEquals(50, $order->discount_amount);

        $low = $this->user('low', ['balance' => 100]);
        $mid = $this->user('mid', ['balance' => 1000]);
        $high = $this->user('high', ['balance' => 1001]);
        foreach (['eq' => [$mid->id], 'gt' => [$high->id], 'lt' => [$admin->id, $low->id]] as $op => $expected) {
            $result = $this->postJson($base . '/user/fetch', ['filter' => [['id' => 'balance', 'value' => $op . ':1000']]])->assertOk();
            $this->assertEqualsCanonicalizing($expected, array_column($result->json('data'), 'id'));
        }
        $this->postJson($base . '/user/generate', ['email_suffix' => 'example.org'])->assertUnprocessable();
        $this->assertSame(4, User::count());
        $article = ['category' => 'Guides', 'title' => 'راهنما', 'body' => 'مرحبا', 'language' => 'fa-IR', 'show' => true];
        $this->postJson($base . '/knowledge/save', $article)->assertOk();
        $kb = Knowledge::where('language', 'fa-IR')->sole();
        $this->postJson($base . '/knowledge/save', ['id' => $kb->id] + array_merge($article, ['title' => 'راهنمای جدید']))->assertOk();
        $this->getJson($base . '/knowledge/fetch?id=' . $kb->id)->assertOk()->assertJsonPath('data.language', 'fa-IR');
        $this->getJson('/api/v1/user/knowledge/fetch?language=fa-IR')->assertOk()->assertJsonPath('data.Guides.0.title', 'راهنمای جدید');
    }

    public function test_payment_service_separates_web_redirects_from_opaque_qr_contents(): void
    {
        $gateway = new class {
            public array $reply = [];
            public function pay($payload): array { return $this->reply; }
        };
        $payment = new class($gateway) extends \App\Services\PaymentService {
            public function __construct($fixture) {
                $this->method = 'fixture';
                $this->config = ['uuid' => 'example', 'notify_domain' => null];
                $this->payment = $fixture;
            }
        };
        $order = ['trade_no' => 'example', 'total_amount' => 100, 'user_id' => 1, 'stripe_token' => null];
        foreach (['https://example.invalid/invoice', 'http://example.invalid/invoice'] as $url) {
            $gateway->reply = ['type' => 1, 'data' => $url];
            $this->assertSame($gateway->reply, $payment->pay($order));
        }
        $gateway->reply = ['type' => 0, 'data' => 'wallet:fixture'];
        $this->assertSame($gateway->reply, $payment->pay($order));
        foreach (['wallet:fixture', '', 'relative/path'] as $url) {
            $gateway->reply = ['type' => 1, 'data' => $url];
            try {
                $payment->pay($order);
                $this->fail('A web checkout requires an absolute supported URL.');
            } catch (ApiException $e) {
                $this->assertStringContainsString('payment link', $e->getMessage());
            }
        }
    }

    public function test_mystery_gift_pool_edits_preserve_entire_rewards_and_reject_zero_weight(): void
    {
        $admin = $this->user('pool-admin', ['is_admin' => 1]);
        \Laravel\Sanctum\Sanctum::actingAs($admin);
        $base = '/api/v2/' . hash('crc32b', config('app.key')) . '/gift-card/';
        $pool = [['weight' => 2, 'balance' => 50], ['weight' => 1, 'balance' => 120]];
        $rewards = ['expire_days' => 1, 'random_rewards' => $pool];
        $this->postJson($base . 'create-template', ['name' => 'Pool', 'type' => 3, 'rewards' => $rewards])->assertOk();
        $gift = \App\Models\GiftCardTemplate::where('name', 'Pool')->sole();
        $this->postJson($base . 'update-template', ['id' => $gift->id, 'name' => 'New', 'rewards' => $rewards])->assertOk();
        $this->assertSame($rewards, $gift->fresh()->rewards);
        $rewards['random_rewards'] = [['weight' => 3, 'balance' => 75]];
        $this->postJson($base . 'update-template', ['id' => $gift->id, 'rewards' => $rewards])->assertOk();
        $this->assertSame(75, $gift->fresh()->calculateActualRewards($admin)['balance']);
        $this->postJson($base . 'update-template', ['id' => $gift->id, 'rewards' => ['random_rewards' => [['weight' => 0]]]])->assertUnprocessable();
        $this->assertSame($rewards, $gift->fresh()->rewards);
    }

    public function test_verified_telegram_ticket_notifications_follow_staff_and_closed_ticket_rules(): void
    {
        require_once base_path('plugins-core/Telegram/Plugin.php');
        $owner = $this->user('author');
        $staff = $this->user('operator', ['telegram_id' => 200, 'is_staff' => 1]);
        $reader = $this->user('reader-tg', ['telegram_id' => 201]);
        $ticket = app(TicketService::class)->createTicket($owner->id, 'Question', 1, 'Message');
        $token = '1001:' . Helper::guid();
        $secret = Helper::guid();
        admin_setting(['telegram_bot_enable' => true, 'telegram_bot_token' => $token,
            'telegram_webhook_digest' => hash_hmac('sha256', $secret, $token)]);
        Http::fake(['*' => Http::response(['ok' => true, 'result' => true])]);
        \App\Services\Plugin\HookManager::reset();
        try {
            (new \Plugin\Telegram\Plugin('telegram'))->boot();
            $deliver = function (User $from, bool $notification = true) use ($secret, $ticket) {
                $data = ['message' => ['text' => 'Reply', 'message_id' => 10,
                    'from' => ['id' => $from->telegram_id], 'chat' => ['id' => $from->telegram_id, 'type' => 'private'],
                    'reply_to_message' => ['text' => $notification ? "📮 工单提醒 #{$ticket->id}\nDetails" : 'Other notification',
                        'from' => ['is_bot' => true, 'id' => 1001]]]];
                $request = Request::create('/', 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($data));
                $request->headers->set('X-Telegram-Bot-Api-Secret-Token', $secret);
                app(TelegramController::class)->webhook($request);
            };
            $deliver($reader);
            $deliver($staff, false);
            $this->assertSame(1, $ticket->messages()->count());
            $deliver($staff);
            $this->assertSame(2, $ticket->messages()->count());
            $this->assertEquals(Ticket::REPLY_STATUS_REPLIED, $ticket->fresh()->reply_status);
            $ticket->update(['status' => Ticket::STATUS_CLOSED]);
            $deliver($staff);
            $this->assertSame(2, $ticket->messages()->count());
        } finally {
            \App\Services\Plugin\HookManager::reset();
        }
    }

    public function test_webhook_rotation_commits_only_after_successful_registration(): void
    {
        $old = '1001:' . Helper::guid();
        $new = '1002:' . Helper::guid();
        admin_setting(['app_url' => 'https://site.example.org', 'telegram_bot_token' => $old, 'telegram_bot_enable' => true]);
        $failed = true;
        $acceptedHeader = null;
        Http::fake(function ($request) use ($new, &$failed, &$acceptedHeader) {
            $this->assertStringContainsString($new, $request->url());
            if (str_ends_with($request->url(), '/setWebhook')) {
                if ($failed) {
                    return Http::response(['ok' => false, 'description' => 'test error'], 400);
                }
                $acceptedHeader = $request['secret_token'];
            }
            return Http::response(['ok' => true, 'result' => ['id' => 1002]]);
        });
        $request = Request::create('/', 'POST', ['telegram_bot_token' => $new]);
        $controller = app(ConfigController::class);
        try {
            $controller->setTelegramWebhook($request);
            $this->fail('Registration should fail.');
        } catch (\Exception $e) {
            $this->assertStringNotContainsString($new, $e->getMessage());
        }
        $this->assertSame($old, admin_setting('telegram_bot_token'));
        $failed = false;
        $this->assertSame(200, $controller->setTelegramWebhook($request)->getStatusCode());
        $this->assertSame($new, admin_setting('telegram_bot_token'));
        $this->assertNotEmpty($acceptedHeader);
        $event = Request::create('/', 'POST');
        $event->headers->set('X-Telegram-Bot-Api-Secret-Token', $acceptedHeader);
        app(TelegramController::class)->webhook($event);
        $firstHeader = $acceptedHeader;
        $this->assertSame(200, $controller->setTelegramWebhook($request)->getStatusCode());
        $this->assertNotSame($firstHeader, $acceptedHeader);
        try {
            app(TelegramController::class)->webhook($event);
            $this->fail('The previous registration should no longer authorize delivery');
        } catch (ApiException $e) {
            $this->assertStringNotContainsString($firstHeader, $e->getMessage());
        }
        $event->headers->set('X-Telegram-Bot-Api-Secret-Token', $acceptedHeader);
        admin_setting(['telegram_bot_enable' => false]);
        $this->expectException(ApiException::class);
        app(TelegramController::class)->webhook($event);
    }
}
