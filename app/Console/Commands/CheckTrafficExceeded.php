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
        $count = Redis::scard('traffic:pending_check');
        if ($count <= 0) {
            return;
        }

        $pendingUserIds = array_map('intval', Redis::spop('traffic:pending_check', $count));

        $exceededUsers = User::toBase()
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
            $notifiedCount += NodeSyncService::notifyUsersRemovedFromGroup($userIdsInGroup, (int) $groupId);
        }

        $this->info("Checked " . count($pendingUserIds) . " users, notified {$notifiedCount} nodes for " . $exceededUsers->count() . " exceeded users.");
    }
}
