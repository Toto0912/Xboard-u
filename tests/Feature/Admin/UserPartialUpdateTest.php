<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use App\Services\Plugin\HookManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserPartialUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function user(int $id, array $fields = []): User
    {
        return User::withoutEvents(fn () => User::forceCreate($fields + [
            'id' => $id, 'email' => "edit-{$id}@example.test", 'password' => 'fixture',
            'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id), 'token' => sprintf('%032d', $id),
        ]));
    }

    public function test_partial_updates_preserve_new_values_and_distinguish_explicit_inviter_changes(): void
    {
        $admin = $this->user(1, ['is_admin' => true]);
        Sanctum::actingAs($admin);
        $inviter = $this->user(2);
        $user = $this->user(3, ['invite_user_id' => $inviter->id, 'balance' => 1200]);
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/update';
        User::whereKey($user->id)->update(['balance' => 800, 'commission_balance' => 2900,
            'expired_at' => 2000000007, 'plan_id' => 17, 'group_id' => 9, 'banned' => 1]);
        $this->postJson($path, ['id' => 3, 'remarks' => 'updated'])->assertOk();
        $this->assertDatabaseHas('v2_user', ['id' => 3, 'remarks' => 'updated', 'balance' => 800,
            'commission_balance' => 2900, 'expired_at' => 2000000007, 'plan_id' => 17,
            'group_id' => 9, 'banned' => 1, 'invite_user_id' => 2]);

        $this->postJson($path, ['id' => 3, 'invite_user_email' => 'missing@example.test'])->assertStatus(400);
        $this->assertSame(2, (int) $user->fresh()->invite_user_id);
        $this->postJson($path, ['id' => 3, 'invite_user_email' => $admin->email])->assertOk();
        $this->assertSame(1, (int) $user->fresh()->invite_user_id);
        $this->postJson($path, ['id' => 3, 'invite_user_email' => null])->assertOk();
        $this->assertNull($user->fresh()->invite_user_id);
    }

    public function test_wallet_edit_checks_both_original_values_before_writing_any_field(): void
    {
        Sanctum::actingAs($this->user(1, ['is_admin' => true]));
        $this->user(2, ['balance' => 1000, 'commission_balance' => 29, 'remarks' => 'old']);
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/update';
        $edit = ['id' => 2, 'balance' => 2.29, 'commission_balance' => 0, 'remarks' => 'new'];
        foreach ([[12, 0.29], [10, 0.41]] as [$balance, $commission]) {
            $this->postJson($path, $edit + ['expected_balance' => $balance,
                'expected_commission_balance' => $commission])->assertStatus(409);
            $this->assertDatabaseHas('v2_user', ['id' => 2, 'balance' => 1000, 'commission_balance' => 29, 'remarks' => 'old']);
        }
        $this->postJson($path, $edit + ['expected_balance' => 10, 'expected_commission_balance' => 0.29])->assertOk();
        $this->assertDatabaseHas('v2_user', ['id' => 2, 'balance' => 229, 'commission_balance' => 0, 'remarks' => 'new']);
        $this->postJson($path, ['id' => 2, 'balance' => 3])->assertOk();
        $this->assertDatabaseHas('v2_user', ['id' => 2, 'balance' => 300]);
    }

    public function test_both_admin_routes_reject_self_descendants_and_already_cyclic_ancestors(): void
    {
        Sanctum::actingAs($this->user(1, ['is_admin' => true]));
        $target = $this->user(2, ['remarks' => 'original', 'balance' => 100]);
        $direct = $this->user(3, ['invite_user_id' => 2]);
        $deep = $this->user(4, ['invite_user_id' => 3]);
        $loop = $this->user(5);
        $other = $this->user(6, ['invite_user_id' => 5]);
        User::whereKey($loop->id)->update(['invite_user_id' => $other->id]); // Pre-existing legacy cycle.
        $endpoint = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/';
        foreach ([$target, $direct, $deep, $loop] as $candidate) {
            $this->postJson($endpoint . 'update', [
                'id' => $target->id, 'invite_user_email' => $candidate->email, 'remarks' => 'changed',
                'expected_balance' => 1, 'balance' => 2, 'banned' => true,
            ])->assertStatus(422);
            $this->postJson($endpoint . 'setInviteUser', [
                'id' => $target->id, 'invite_user_id' => $candidate->id,
            ])->assertStatus(422);
            $this->assertDatabaseHas('v2_user', ['id' => $target->id, 'remarks' => 'original',
                'balance' => 100, 'banned' => 0, 'invite_user_id' => null]);
        }
        $this->postJson($endpoint . 'setInviteUser', ['id' => $loop->id, 'invite_user_id' => null])->assertOk();
        $this->postJson($endpoint . 'update', ['id' => $target->id, 'invite_user_email' => $other->email])->assertOk();
        $this->assertSame($other->id, $target->fresh()->invite_user_id);
    }

    public function test_plugin_added_inviter_is_checked_and_written_under_lock(): void
    {
        $admin = $this->user(1, ['is_admin' => true]);
        Sanctum::actingAs($admin);
        $target = $this->user(2);
        $child = $this->user(3, ['invite_user_id' => $target->id]);
        $parentId = $child->id;
        HookManager::registerFilter('admin.user.update.params', function ($params) use (&$parentId) {
            $params['invite_user_id'] = $parentId;
            return $params;
        });
        $depth = DB::transactionLevel();
        $writeDepth = null;
        HookManager::register('admin.user.update.before', function () use (&$writeDepth) {
            $writeDepth = DB::transactionLevel();
        });
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/update';
        $params = ['id' => $target->id, 'remarks' => 'changed'];
        $this->postJson($path, $params)->assertStatus(422);
        $this->assertNull($writeDepth);
        $this->assertNull($target->fresh()->invite_user_id);
        $this->assertNull($target->fresh()->remarks);

        $parentId = $admin->id;
        $this->postJson($path, $params)->assertOk();
        $this->assertGreaterThan($depth, $writeDepth);
        $this->assertDatabaseHas('v2_user', ['id' => $target->id, 'invite_user_id' => $parentId, 'remarks' => 'changed']);
    }
}
