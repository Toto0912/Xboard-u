<?php

namespace App\Jobs;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\DB;
use App\Support\TrafficBatch;

class TrafficFetchJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    protected $data;
    protected $server;
    protected $protocol;
    protected $timestamp;
    public $tries = 1;
    public $timeout = 20;

    public function __construct(array $server, array $data, $protocol, int $timestamp)
    {
        $this->onQueue('traffic_fetch');
        $this->server = $server;
        $this->data = $data;
        $this->protocol = $protocol;
        $this->timestamp = $timestamp;
    }

    public function handle(): void
    {
        $userIds = array_keys($this->data);

        $increments = [];
        foreach ($this->data as $uid => $v) {
            $increments[(int) $uid] = [$v[0] * $this->server['rate'], $v[1] * $this->server['rate']];
        }
        DB::transaction(fn () => TrafficBatch::increment((new User())->getTable(), $increments,
            ['t' => time(), 'updated_at' => time()]), 3);

        if (!empty($userIds)) {
            Redis::sadd('traffic:pending_check', ...$userIds);
        }
    }
}
