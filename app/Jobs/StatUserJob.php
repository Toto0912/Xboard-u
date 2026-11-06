<?php

namespace App\Jobs;

use App\Models\StatUser;
use App\Support\TrafficBatch;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class StatUserJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected array $data;
    protected array $server;
    protected string $protocol;
    protected string $recordType;
    public $tries = 3;
    public $timeout = 60;
    public $maxExceptions = 3;

    public function backoff(): array { return [1, 5, 10]; }

    public function __construct(array $server, array $data, string $protocol, string $recordType = 'd')
    {
        $this->onQueue('stat');
        $this->data = $data;
        $this->server = $server;
        $this->protocol = $protocol;
        $this->recordType = $recordType;
    }

    public function handle(): void
    {
        $recordAt = $this->recordType === 'm' ? strtotime(date('Y-m-01')) : strtotime(date('Y-m-d'));
        $now = time();
        $rows = [];
        foreach ($this->data as $uid => $v) {
            $rows[] = ['user_id' => (int) $uid, 'server_rate' => $this->server['rate'],
                'record_at' => $recordAt, 'record_type' => $this->recordType,
                'u' => intval($v[0] * $this->server['rate']), 'd' => intval($v[1] * $this->server['rate']),
                'created_at' => $now, 'updated_at' => $now];
        }
        usort($rows, fn ($a, $b) => $a['user_id'] <=> $b['user_id']);
        DB::transaction(function () use ($rows, $recordAt, $now) {
            if (DB::connection()->getDriverName() === 'sqlite') {
                // Older SQLite deployments have no unique stat-user index.
                // Preserve that schema and serialize the read/increment/insert.
                foreach (array_chunk($rows, 100) as $chunk) {
                    $existing = StatUser::whereIn('user_id', array_column($chunk, 'user_id'))
                        ->where('server_rate', $this->server['rate'])->where('record_at', $recordAt)
                        ->where('record_type', $this->recordType)->orderBy('id')->get()
                        ->groupBy('user_id')->map->first();
                    $increments = $insert = [];
                    foreach ($chunk as $row) {
                        if (isset($existing[$row['user_id']])) {
                            $increments[$existing[$row['user_id']]->id] = [$row['u'], $row['d']];
                        } else { $insert[] = $row; }
                    }
                    TrafficBatch::increment((new StatUser())->getTable(), $increments, ['updated_at' => $now]);
                    if ($insert !== []) StatUser::insert($insert);
                }
                return;
            }
            $pgsql = DB::connection()->getDriverName() === 'pgsql';
            $table = DB::connection()->getQueryGrammar()->wrapTable((new StatUser())->getTable());
            foreach (array_chunk($rows, 500) as $chunk) {
                StatUser::upsert($chunk,
                    $pgsql ? ['user_id', 'server_rate', 'record_at'] : ['user_id', 'server_rate', 'record_at', 'record_type'],
                    ['u' => DB::raw($pgsql ? "{$table}.u + EXCLUDED.u" : 'u + VALUES(u)'),
                     'd' => DB::raw($pgsql ? "{$table}.d + EXCLUDED.d" : 'd + VALUES(d)'), 'updated_at' => $now]);
            }
        }, 3);
    }
}
