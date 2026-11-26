<?php

namespace Tests\Feature;

use App\Models\InviteCode;
use App\Models\User;
use App\Services\Plugin\HookManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class InviteRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private InviteCode $invite;

    protected function setUp(): void
    {
        parent::setUp();
        admin_setting(['invite_force' => 1, 'invite_never_expire' => 0]);
        $inviter = $this->existingUser('inviter@example.com');
        $this->invite = new InviteCode();
        $this->invite->code = 'TESTONCE';
        $this->invite->user_id = $inviter->id;
        $this->invite->save();
    }

    public function test_failed_save_leaves_the_same_code_available_for_retry(): void
    {
        $failNextSave = true;
        User::creating(static function () use (&$failNextSave) {
            if ($failNextSave) {
                $failNextSave = false;
                return false;
            }
        });

        $email = 'retry@example.com';
        $this->register($email, $this->invite->code)->assertStatus(500);
        $this->assertDatabaseMissing('v2_user', ['email' => $email]);
        $this->assertFalse($this->invite->refresh()->status);

        $this->register($email, $this->invite->code)->assertOk();
        $this->assertTrue($this->invite->refresh()->status);
        $this->assertDatabaseHas('v2_user', ['email' => $email, 'invite_user_id' => $this->invite->user_id]);
    }

    public function test_email_unique_constraint_failure_does_not_consume_the_invitation(): void
    {
        $email = 'already-taken@example.com';
        // A different registration commits after email validation but before the invited insert.
        $winner = fn () => $this->existingUser($email);
        HookManager::register('user.register.before', $winner);
        try {
            $this->register($email, $this->invite->code)->assertStatus(400)
                ->assertJsonPath('message', __('Email already exists'));
        } finally {
            HookManager::remove('user.register.before', $winner);
        }
        $this->assertFalse($this->invite->refresh()->status);
        $this->assertDatabaseHas('v2_user', ['email' => $email, 'invite_user_id' => null]);
        $this->register('other@example.com', $this->invite->code)->assertOk();
        $this->assertTrue($this->invite->refresh()->status);
    }

    public function test_single_use_code_cannot_register_a_second_user_even_if_invitations_are_optional(): void
    {
        admin_setting(['invite_force' => 0]);
        $this->register('first@example.com', $this->invite->code)->assertOk();
        $this->register('second@example.com', $this->invite->code)->assertStatus(400)
            ->assertJsonPath('message', __('Invalid invitation code'));

        $this->assertTrue($this->invite->refresh()->status);
        $this->assertSame(1, User::where('invite_user_id', $this->invite->user_id)->count());
        $this->assertDatabaseMissing('v2_user', ['email' => 'second@example.com']);
        $this->register('second@example.com')->assertOk();
        $this->register('unreferred@example.com', 'UNKNOWN')->assertOk();
        $this->assertDatabaseHas('v2_user', ['email' => 'unreferred@example.com', 'invite_user_id' => null]);
    }

    public function test_required_invitations_reject_missing_and_unknown_codes_and_reusable_codes_stay_valid(): void
    {
        admin_setting(['invite_never_expire' => 1]);
        $this->register('missing@example.com')->assertStatus(422);
        $this->register('missing@example.com', 'UNKNOWN')->assertStatus(400);
        $this->assertDatabaseMissing('v2_user', ['email' => 'missing@example.com']);

        $this->register('first@example.com', $this->invite->code)->assertOk();
        $this->register('second@example.com', $this->invite->code)->assertOk();
        $this->assertFalse($this->invite->refresh()->status);
        $this->assertSame(2, User::where('invite_user_id', $this->invite->user_id)->count());
    }

    private function register(string $email, ?string $code = null): TestResponse
    {
        return $this->postJson('/api/v1/passport/auth/register', [
            'email' => $email, 'password' => 'password123', 'invite_code' => $code,
        ]);
    }

    private function existingUser(string $email): User
    {
        return User::create([
            'email' => $email, 'password' => 'fixture', 'uuid' => (string) Str::uuid(), 'token' => Str::random(32),
        ]);
    }
}
