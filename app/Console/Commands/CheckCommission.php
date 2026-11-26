<?php

namespace App\Console\Commands;

use App\Models\CommissionLog;
use Illuminate\Console\Command;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CheckCommission extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'check:commission';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = '返佣服务';

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->autoCheck();
        $this->autoPayCommission();
    }

    public function autoCheck()
    {
        if ((int)admin_setting('commission_auto_check_enable', 1)) {
            Order::where('commission_status', 0)
                ->where('invite_user_id', '!=', NULL)
                ->whereIn('status', Order::COMMISSION_ELIGIBLE_STATUSES)
                ->where('updated_at', '<=', strtotime('-3 day', time()))
                ->update([
                    'commission_status' => 1
                ]);
        }
    }

    public function autoPayCommission()
    {
        $pending = Order::where('commission_status', 1)->whereNotNull('invite_user_id')
            ->whereIn('status', Order::COMMISSION_ELIGIBLE_STATUSES);
        foreach ((clone $pending)->select('id')->lazyById(200) as $candidate) {
            DB::transaction(function () use ($pending, $candidate) {
                $order = (clone $pending)->lockForUpdate()->find($candidate->id);
                if (!$order) {
                    return;
                }
                $order->commission_status = $this->creditInviters($order) ? 2 : 3;
                if (!$order->save()) {
                    throw new \RuntimeException("Failed to settle commission for order {$order->id}");
                }
            }, 3);
        }
    }

    private function creditInviters(Order $order): bool
    {
        $inviteUserId = $order->invite_user_id;
        if ((int)admin_setting('commission_distribution_enable', 0)) {
            $commissionShareLevels = [
                0 => (int)admin_setting('commission_distribution_l1'),
                1 => (int)admin_setting('commission_distribution_l2'),
                2 => (int)admin_setting('commission_distribution_l3')
            ];
        } else {
            $commissionShareLevels = [
                0 => 100
            ];
        }
        // Validate the payable chain before the first wallet credit, including zero-share levels.
        $seen = [$order->user_id => true];
        $recipients = [];
        foreach ($commissionShareLevels as $percentage) {
            if (!$inviteUserId || isset($seen[$inviteUserId])) {
                break;
            }
            $inviter = User::lockForUpdate()->find($inviteUserId);
            if (!$inviter) {
                break;
            }
            $seen[$inviteUserId] = true;
            $recipients[] = [$inviter, $percentage];
            $inviteUserId = $inviter->invite_user_id;
        }
        if (isset($seen[$inviteUserId])) {
            Log::warning('Commission withheld: circular invitation', ['order_id' => $order->id, 'user_id' => $inviteUserId]);
            return false;
        }

        $wallet = (int)admin_setting('withdraw_close_enable', 0) ? 'balance' : 'commission_balance';
        $totalPercentage = 0;
        $allocatedCents = 0;
        foreach ($recipients as [$inviter, $percentage]) {
            // Round the cumulative entitlement so per-level rounding cannot create or lose cents.
            $totalPercentage += $percentage;
            $totalCents = (int) round($order->commission_balance * $totalPercentage / 100, 0, PHP_ROUND_HALF_UP);
            $commissionBalance = $totalCents - $allocatedCents;
            $allocatedCents = $totalCents;
            if (!$commissionBalance) continue;
            if ($inviter->increment($wallet, $commissionBalance) === false) {
                throw new \RuntimeException("Failed to credit commission for user {$inviter->id}");
            }
            $log = new CommissionLog([
                'invite_user_id' => $inviter->id,
                'user_id' => $order->user_id,
                'trade_no' => $order->trade_no,
                'order_amount' => $order->total_amount,
                'get_amount' => $commissionBalance
            ]);
            if (!$log->save()) {
                throw new \RuntimeException("Failed to record commission for order {$order->id}");
            }
            // update order actual commission balance
            $order->actual_commission_balance = $order->actual_commission_balance + $commissionBalance;
        }
        return true;
    }

}
