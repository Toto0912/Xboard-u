<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\NodeSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class CheckExpiredUsers extends Command
{
    public const WATERMARK_CACHE_KEY = 'node_sync:expired_users_watermark';

    protected $signature = 'check:expired-users';
    protected $description = '检查自然到期用户并通知节点移除';

    public function handle(): void
    {
        $now = time();
        $lastWatermark = Cache::get(self::WATERMARK_CACHE_KEY);
        $windowStart = is_numeric($lastWatermark) ? max(0, (int) $lastWatermark - 5) : ($now - 300);

        $expiredUsers = User::toBase()->useWritePdo()
            ->whereNotNull('expired_at')
            ->where('expired_at', '>', $windowStart)
            ->where('expired_at', '<=', $now)
            ->where('banned', 0)
            ->whereNotNull('group_id')
            ->select(['id', 'group_id'])
            ->get();

        $notifiedNodes = 0;
        foreach ($expiredUsers->groupBy('group_id') as $groupId => $users) {
            if (!$groupId) {
                continue;
            }
            $notifiedNodes += NodeSyncService::notifyUsersRemovedFromGroup(
                $users->pluck('id')->all(),
                (int) $groupId, true
            );
        }

        Cache::put(self::WATERMARK_CACHE_KEY, $now, 86400 * 30);

        if ($expiredUsers->isNotEmpty()) {
            $this->info("Notified {$notifiedNodes} nodes for {$expiredUsers->count()} expired users.");
        }
    }
}
