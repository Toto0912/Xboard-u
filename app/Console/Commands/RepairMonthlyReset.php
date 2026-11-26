<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

class RepairMonthlyReset extends Command
{
    protected $signature = 'reset:repair-month {month : Short month in YYYY-MM format} {--apply : Write the proposed schedule changes}';
    protected $description = 'Preview or repair monthly reset dates that overflowed a specific short month';

    public function handle(): int
    {
        $input = (string) $this->argument('month');
        if (!preg_match('/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/D', $input)) {
            $this->error('Use YYYY-MM, for example 2027-02.');
            return self::INVALID;
        }
        $zone = config('app.timezone');
        $month = CarbonImmutable::createFromFormat('!Y-m', $input, $zone);
        $overflowDays = 31 - $month->daysInMonth;
        if ($overflowDays === 0) {
            $this->info('This month has no overflowing day.');
            return self::SUCCESS;
        }
        $following = $month->addMonth();
        $inheritsMonthly = (int) admin_setting('reset_traffic_method', Plan::RESET_TRAFFIC_MONTHLY) === Plan::RESET_TRAFFIC_MONTHLY;
        $candidates = User::query()->useWritePdo()->where('banned', false)
            ->where('expired_at', '>', now()->timestamp)
            ->whereBetween('next_reset_at', [$following->timestamp, $following->addDays($overflowDays)->timestamp - 1])
            ->whereHas('plan', function ($query) use ($inheritsMonthly) {
                $query->where(function ($query) use ($inheritsMonthly) {
                    $query->where('reset_traffic_method', Plan::RESET_TRAFFIC_MONTHLY);
                    if ($inheritsMonthly) {
                        $query->orWhere(function ($inherited) {
                            $inherited->whereNull('reset_traffic_method')->whereNotExists(function ($setting) {
                                $setting->selectRaw('1')->from('v2_settings')->where('name', 'reset_traffic_method')
                                    ->where('value', '<>', (string) Plan::RESET_TRAFFIC_MONTHLY);
                            });
                        });
                    }
                });
            });
        $apply = $this->option('apply');
        $this->info($apply ? 'Applying schedule changes' : 'Preview only');
        $proposed = $updated = $review = 0;
        foreach ((clone $candidates)->lazyById(300) as $user) {
            $expiry = CarbonImmutable::createFromTimestamp($user->expired_at, $zone);
            $overflow = $expiry->day - $month->daysInMonth;
            if ($overflow <= 0) {
                continue;
            }
            $stored = $following->day($overflow)->setTimeFrom($expiry);
            if ($stored->timestamp !== $user->next_reset_at) {
                continue;
            }
            $due = $month->endOfMonth()->setTimeFrom($expiry);
            $next = $following->day($expiry->day)->setTimeFrom($expiry);
            $now = now()->timestamp;
            $last = $user->last_reset_at;
            if ($now >= $next->timestamp || $user->expired_at <= $due->timestamp || $last > $now) {
                $target = null;
            } elseif ($last !== null && $last >= $due->timestamp) {
                // An actual reset already covered the clamped boundary.
                $target = $next;
            } elseif ($now < $due->timestamp) {
                $target = $due;
            } elseif ($last > 0 && $user->updated_at < $due->timestamp && $user->created_at < $due->timestamp) {
                // The subscription existed unchanged across the boundary and is still waiting.
                if ($stored->timestamp <= $now) {
                    // Both dates are already due. Preserve the scheduler's pending work.
                    continue;
                }
                $target = $due;
            } else {
                $target = null;
            }
            if ($target === null) {
                $review++;
                $this->line("user={$user->id} review: unable to establish the due reset");
                continue;
            }
            $proposed++;
            $this->line("user={$user->id} {$stored->toDateTimeString()} -> {$target->toDateTimeString()}");
            if ($apply) {
                $changed = (clone $candidates)->whereKey($user->id)
                    ->where('plan_id', $user->plan_id)->where('expired_at', $user->expired_at)
                    ->where('expired_at', '>', now()->timestamp)
                    ->where('next_reset_at', $stored->timestamp)->where('last_reset_at', $last)
                    ->where('updated_at', $user->updated_at)
                    ->toBase()->update(['next_reset_at' => $target->timestamp]);
                $updated += $changed;
                if (!$changed) {
                    $this->warn("user={$user->id} changed concurrently; schedule preserved");
                }
            }
        }
        $this->info("Proposed={$proposed} Updated={$updated} Review={$review}");
        return self::SUCCESS;
    }
}
