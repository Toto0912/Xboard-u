<?php

namespace App\Console\Commands;

use App\Models\Server;
use App\Models\User;
use App\Services\NodeSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Redis;

class CheckTrafficExceeded extends Command
{
    protected $signature = 'check:traffic-exceeded';
    protected $description = '检查流量超标用户并通知节点';

    public function handle()
    {
        // A crash leaves the generation claimable. New arrivals stay in pending.
        $claim = <<<'LUA'
if redis.call('exists', KEYS[2]) == 0 then
    if redis.call('exists', KEYS[1]) == 0 then return {} end
    redis.call('incr', KEYS[3])
    redis.call('rename', KEYS[1], KEYS[2])
end
return {redis.call('get', KEYS[3]), redis.call('srandmember', KEYS[2], 500)}
LUA;
        $ack = <<<'LUA'
if redis.call('get', KEYS[2]) == ARGV[1] then
    return redis.call('srem', KEYS[1], unpack(ARGV, 2))
end
return 0
LUA;
        for ($batch = 0; $batch < 100; $batch++) {
            $page = Redis::eval($claim, 3, 'traffic:pending_check', 'traffic:checking', 'traffic:checking_generation');
            if (!$page) return;
            [$generation, $ids] = $page;
            $this->checkUsers(array_map('intval', $ids));
            Redis::eval($ack, 2, 'traffic:checking', 'traffic:checking_generation', $generation, ...$ids);
        }
    }

    private function checkUsers(array $pendingUserIds): void
    {

        $exceededUsers = User::toBase()->useWritePdo()
            ->whereIn('id', $pendingUserIds)
            ->whereRaw('u + d >= transfer_enable')
            ->where('transfer_enable', '>', 0)
            ->where('banned', 0)
            ->select(['id', 'group_id'])
            ->get();

        if ($exceededUsers->isEmpty()) {
            return;
        }

        $groupedUsers = $exceededUsers->groupBy('group_id');
        $notifiedCount = 0;

        foreach ($groupedUsers as $groupId => $users) {
            if (!$groupId) {
                continue;
            }

            $userIdsInGroup = $users->pluck('id')->all();
            $notifiedCount += NodeSyncService::notifyUsersRemovedFromGroup($userIdsInGroup, (int) $groupId, true);
        }

        $this->info("Checked " . count($pendingUserIds) . " users, notified {$notifiedCount} nodes for " . $exceededUsers->count() . " exceeded users.");
    }
}
