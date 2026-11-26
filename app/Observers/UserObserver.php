<?php

namespace App\Observers;

use App\Jobs\NodeUserSyncJob;
use App\Models\User;
use App\Services\TrafficResetService;

class UserObserver
{
  public function __construct(
    private readonly TrafficResetService $trafficResetService
  ) {
  }

  public function updated(User $user): void
  {
    $syncFields = ['group_id', 'uuid', 'speed_limit', 'device_limit', 'banned', 'expired_at', 'transfer_enable', 'u', 'd', 'plan_id'];
    $needsSync = $user->wasChanged($syncFields);
    $rawOldGroupId = $user->wasChanged('group_id') ? $user->getOriginal('group_id') : null;
    $oldGroupId = ($rawOldGroupId !== null && (int) $rawOldGroupId > 0 && (int) $rawOldGroupId !== (int) $user->group_id)
      ? (int) $rawOldGroupId
      : null;
    $needsRecalc = $user->wasChanged(['plan_id', 'expired_at']);
    $userId = (int) $user->id;

    if (!$needsSync && !$needsRecalc) {
      return;
    }

    $this->afterCommit($user, function () use ($userId, $needsRecalc, $needsSync, $oldGroupId): void {
      if ($needsRecalc) {
        if ($fresh = User::find($userId)) {
          $this->recalculateNextResetAt($fresh);
        }
      }
      if ($needsSync) {
        NodeUserSyncJob::dispatch($userId, 'updated', $oldGroupId);
      }
    });
  }

  public function created(User $user): void
  {
    $userId = (int) $user->id;
    $this->afterCommit($user, function () use ($userId): void {
      if ($fresh = User::find($userId)) {
        $this->recalculateNextResetAt($fresh);
      }
      NodeUserSyncJob::dispatch($userId, 'created');
    });
  }

  public function deleted(User $user): void
  {
    $rawGroupId = $user->getOriginal('group_id') ?: $user->group_id;
    $groupId = ($rawGroupId !== null && (int) $rawGroupId > 0) ? (int) $rawGroupId : null;
    if (!$groupId) {
      return;
    }

    $userId = (int) $user->id;
    $this->afterCommit($user, fn () => NodeUserSyncJob::dispatch($userId, 'deleted', $groupId));
  }

  private function afterCommit(User $user, callable $callback): void
  {
    $connection = $user->getConnection();
    if ($connection->transactionLevel() > 0) {
      $connection->afterCommit($callback);
    } else {
      $callback();
    }
  }

  /**
   * 根据当前用户状态重新计算 next_reset_at
   */
  private function recalculateNextResetAt(User $user): void
  {
    $user->refresh();
    User::withoutEvents(function () use ($user) {
      $nextResetTime = $this->trafficResetService->calculateNextResetTime($user);
      $user->next_reset_at = $nextResetTime?->timestamp;
      $user->save();
    });
  }
}
