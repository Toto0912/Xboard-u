<?php

namespace Tests\Feature\Server;

use App\Jobs\NodeUserSyncJob;
use App\Models\Server;
use App\Models\User;
use App\Services\NodeSyncService;
use App\Services\Plugin\HookManager;
use App\Services\ServerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

class FilteredUserSyncTest extends TestCase
{
    use RefreshDatabase;

    private function node(bool $online = true): Server
    {
        $node = Server::withoutEvents(fn () => Server::create(['name' => 'filtered', 'group_ids' => [2],
            'type' => 'vless', 'rate' => 1, 'host' => 'example.test', 'port' => 443, 'server_port' => 443]));
        if ($online) Cache::put("node_ws_alive:{$node->id}", true, 120);
        return $node;
    }

    private function user(int $id): User
    {
        return User::withoutEvents(fn () => User::forceCreate(['id' => $id, 'email' => "$id@example.test",
            'password' => 'fixture', 'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id),
            'token' => sprintf('%032d', $id), 'group_id' => 2, 'plan_id' => 1,
            'transfer_enable' => 1000, 'speed_limit' => 12, 'expired_at' => null]));
    }

    public function test_profile_changes_and_group_removals_use_the_nodes_filtered_roster(): void
    {
        $restricted = $this->node();
        $allowed = $this->node();
        $this->node(false);
        $first = $this->user(10);
        $second = $this->user(11);
        $messages = [];
        Redis::shouldReceive('publish')->andReturnUsing(function ($channel, $json) use (&$messages) {
            $message = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
            $messages[$message['node_id']] = $message;
            return 1;
        });
        HookManager::registerFilter('server.users.get', static fn ($users, $node) =>
            $node->id === $restricted->id ? $users->reject(fn ($user) => $user->id === $first->id)->all() : $users);
        try {
            (new NodeUserSyncJob($first->id, 'updated'))->handle();
            $this->assertEqualsCanonicalizing([$restricted->id, $allowed->id], array_keys($messages));
            $this->assertSame('sync.users', $messages[$restricted->id]['event']);
            $this->assertSame('sync.users', $messages[$allowed->id]['event']);
            $this->assertSame([$second->id], array_column($messages[$restricted->id]['data']['users'], 'id'));
            $this->assertEqualsCanonicalizing([$first->id, $second->id], array_column($messages[$allowed->id]['data']['users'], 'id'));
            $this->assertIsArray(json_decode(ServerService::getAvailableUsers($restricted)->toJson()));
            User::query()->whereKey($second->id)->update(['banned' => true]);
            $messages = [];
            $this->assertSame(2, NodeSyncService::notifyUsersRemovedFromGroup([$second->id], 2));
            $this->assertSame([], $messages[$restricted->id]['data']['users']);
            $this->assertSame([$first->id], array_column($messages[$allowed->id]['data']['users'], 'id'));
        } finally {
            HookManager::remove('server.users.get');
        }
    }

    public function test_without_a_filter_profile_updates_still_send_a_single_delta(): void
    {
        $this->node();
        $user = $this->user(10);
        $event = null;
        Redis::shouldReceive('publish')->once()->andReturnUsing(function ($channel, $json) use (&$event) {
            $event = json_decode($json, true);
            return 1;
        });
        (new NodeUserSyncJob($user->id, 'updated'))->handle();
        $this->assertSame('sync.user.delta', $event['event']);
        $this->assertSame('add', $event['data']['action']);
        $this->assertSame([$user->id], array_column($event['data']['users'], 'id'));
    }
}
