<?php

namespace App\Services;

use App\Models\Server;
use App\Services\Plugin\HookManager;
use Illuminate\Support\Facades\DB;

final class TrafficBatchReceiver
{
    // The existing daily stat tables store user_id and server_id as signed INTEGER.
    private const MAX_STAT_ID = 2147483647;

    public function accept(Server $node, mixed $batchId, mixed $rows): string
    {
        abort_unless(is_string($batchId) && preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $batchId),
            422, 'Expected a lowercase v4 batch UUID');
        abort_unless(is_array($rows) && array_is_list($rows) && count($rows) >= 1 && count($rows) <= 1000,
            422, 'Expected 1 to 1000 traffic rows');
        $data = [];
        foreach ($rows as $row) {
            abort_unless(is_array($row) && array_is_list($row) && count($row) === 3
                && is_int($row[0]) && $row[0] > 0 && !isset($data[$row[0]]), 422, 'Invalid or duplicate user ID');
            $data[$row[0]] = [$row[1], $row[2]];
        }
        $this->totals($data);
        ksort($data);
        $digest = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        $received = now()->toImmutable();

        // The unique insert serializes duplicate submissions before any traffic filters execute.
        [$receiptId, $conflict] = DB::transaction(function () use ($node, $batchId, $data, $digest, $received) {
            $key = ['server_id' => $node->id, 'batch_id' => $batchId];
            $receipts = DB::table('v2_traffic_batches');
            $inserted = $receipts->insertOrIgnore($key + [
                'digest' => $digest, 'received_at' => $received->timestamp,
                'record_at' => $received->startOfDay()->timestamp,
                'activity_type' => $node->type, 'stat_server_id' => $node->id,
                'protocol' => $node->type, 'rate' => 0,
            ]);
            $receipt = $receipts->where($key)->lockForUpdate()->first(['id', 'digest']);
            if (!$receipt) {
                throw new \RuntimeException('Traffic receipt could not be reserved');
            }
            if (!$inserted) {
                $conflict = !hash_equals($receipt->digest, $digest);
                $receipts->increment($conflict ? 'conflict_count' : 'duplicate_count');
                return [null, $conflict];
            }

            $server = $node->toArray();
            $server['rate'] = $node->getCurrentRate($received);
            // Keep the single-argument filter contract; external effects can key on this identity.
            $server['traffic_batch'] = $key;
            $filtered = HookManager::filter('traffic.process.before', [$server, $node->type, $data]);
            $filtered[0]['traffic_batch'] = $key;
            [$server, $protocol, $usage] = HookManager::filter('traffic.before_process', $filtered);
            abort_unless(is_array($usage) && count($usage) <= 1000 && is_string($protocol) && $protocol !== ''
                && strlen($protocol) <= 11 && isset($server['id'], $server['rate'])
                && filter_var($server['id'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => self::MAX_STAT_ID]]) !== false
                && is_numeric($server['rate']), 422, 'Invalid filtered traffic metadata');
            $rate = (float) $server['rate'];
            abort_unless(is_finite($rate) && $rate >= 0 && $rate <= 99999999.99, 422, 'Invalid traffic rate');
            [$up, $down] = $this->totals($usage, $rate);
            ksort($usage);
            $receipts->update([
                'rate' => $rate, 'protocol' => $protocol, 'stat_server_id' => $server['id'],
                'raw_u' => $up, 'raw_d' => $down,
                'payload' => json_encode($usage, JSON_THROW_ON_ERROR),
                'activity_users' => json_encode(ServerTrafficActivity::activeUsers($data), JSON_THROW_ON_ERROR),
            ]);
            $tasks = [];
            foreach (['usage', 'user_stat', 'server_stat', 'quota_check', 'activity'] as $kind) {
                $tasks[] = ['receipt_id' => $receipt->id, 'kind' => $kind,
                    'available_at' => $kind === 'quota_check' ? null : $received->timestamp];
            }
            DB::table('v2_traffic_batch_tasks')->insert($tasks);
            return [$receipt->id, false];
        }, 3);
        abort_if($conflict, 409, 'Batch ID already received with different traffic');
        if ($receiptId !== null) {
            // Redis availability cannot undo durable acceptance. The scheduler also scans pending tasks.
            try {
                app(TrafficBatchOutbox::class)->dispatchDue($receiptId);
            } catch (\Throwable $error) {
                report($error);
            }
        }
        return $batchId;
    }

    private function totals(array $data, ?float $rate = null): array
    {
        $totals = [0, 0];
        foreach ($data as $id => $bytes) {
            abort_unless(is_int($id) && $id > 0 && $id <= self::MAX_STAT_ID
                && is_array($bytes) && array_is_list($bytes) && count($bytes) === 2,
                422, 'Invalid traffic row');
            foreach ($bytes as $direction => $count) {
                abort_unless(is_int($count) && $count >= 0 && $count <= PHP_INT_MAX - $totals[$direction],
                    422, 'Traffic bytes exceed signed integer range');
                abort_if($rate !== null && $count * $rate >= (float) PHP_INT_MAX, 422, 'Rated traffic exceeds integer range');
                $totals[$direction] += $count;
            }
            abort_if($rate === null && $bytes === [0, 0], 422, 'Empty traffic row');
        }
        return $totals;
    }
}
