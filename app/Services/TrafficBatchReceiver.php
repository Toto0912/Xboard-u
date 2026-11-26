<?php

namespace App\Services;

use App\Models\Server;
use App\Services\Plugin\HookManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

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
            $this->stageTasks($receipt->id, $received->timestamp, true);
            return [$receipt->id, false];
        }, 3);
        abort_if($conflict, 409, 'Batch ID already received with different traffic');
        if ($receiptId !== null) {
            DB::afterCommit(fn () => $this->dispatchReceipt($receiptId));
        }
        return $batchId;
    }

    /**
     * The caller has recorded raw activity and invoked the two legacy hooks once on the whole report.
     * Each HTTP submission is independent. Only retries of the resulting jobs share an identity.
     */
    public function acceptLegacy(int $nodeId, string $nodeType, array $server, mixed $protocol, array $data, int $day): bool
    {
        if (!is_string($protocol) || $protocol === '' || strlen($protocol) > 11
            || !isset($server['id'], $server['rate']) || !is_numeric($server['rate'])
            || filter_var($server['id'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => self::MAX_STAT_ID]]) === false) {
            return false;
        }
        $rate = (float) $server['rate'];
        if (!is_finite($rate) || $rate < 0 || $rate > 99999999.99) {
            return false;
        }

        $chunks = array_chunk($data, 1000, true);
        try {
            $totals = array_map(fn ($chunk) => $this->totals($chunk, $rate), $chunks);
        } catch (HttpException $e) {
            // Some external legacy filters return fractional byte values. Preserve their existing queue contract.
            return false;
        }

        $received = now()->timestamp;
        DB::transaction(function () use ($nodeId, $nodeType, $server, $protocol, $rate, $day, $received, $chunks, $totals) {
            foreach ($chunks as $index => $chunk) {
                $payload = json_encode($chunk, JSON_THROW_ON_ERROR);
                $id = DB::table('v2_traffic_batches')->insertGetId([
                    'server_id' => $nodeId, 'batch_id' => (string) Str::uuid(), 'digest' => hash('sha256', $payload),
                    'received_at' => $received, 'record_at' => $day, 'activity_type' => $nodeType,
                    'stat_server_id' => $server['id'], 'protocol' => $protocol, 'rate' => $rate,
                    'raw_u' => $totals[$index][0], 'raw_d' => $totals[$index][1], 'payload' => $payload,
                ]);
                $this->stageTasks($id, $received, false);
                DB::afterCommit(fn () => $this->dispatchReceipt($id));
            }
        }, 3);
        return true;
    }

    private function stageTasks(int $receiptId, int $receivedAt, bool $withActivity): void
    {
        $kinds = ['usage', 'user_stat', 'server_stat', 'quota_check'];
        if ($withActivity) {
            $kinds[] = 'activity';
        }
        $tasks = [];
        foreach ($kinds as $kind) {
            $tasks[] = ['receipt_id' => $receiptId, 'kind' => $kind,
                'available_at' => $kind === 'quota_check' ? null : $receivedAt];
        }
        DB::table('v2_traffic_batch_tasks')->insert($tasks);
    }

    private function dispatchReceipt(int $id): void
    {
        try {
            TrafficBatchOutbox::dispatchDue($id);
        } catch (\Throwable $error) {
            // A queue outage cannot reverse committed work. The scheduler will redispatch it.
            report($error);
        }
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
