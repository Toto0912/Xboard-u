<?php

namespace App\Http\Controllers\V2\Server;

use App\Http\Controllers\Controller;
use App\Services\ServerService;
use App\Services\TrafficBatchCapability;
use App\Services\TrafficBatchReceiver;
use App\WebSocket\NodeWorker;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class ServerController extends Controller
{
    /**
     * server handshake api
     */
    public function handshake(Request $request): JsonResponse
    {
        $websocket = ['enabled' => false];

        if ((bool) admin_setting('server_ws_enable', 1) && Cache::has(NodeWorker::HEARTBEAT_CACHE_KEY)) {
            $customUrl = trim((string) admin_setting('server_ws_url', ''));

            if ($customUrl !== '') {
                $wsUrl = rtrim($customUrl, '/');
            } else {
                $wsScheme = $request->isSecure() ? 'wss' : 'ws';
                $wsUrl = "{$wsScheme}://{$request->getHttpHost()}/ws";
            }

            $websocket = [
                'enabled' => true,
                'ws_url' => $wsUrl,
            ];
        }

        return response()->json([
            'capabilities' => ['traffic_batch_v1' => TrafficBatchCapability::available()],
            'websocket' => $websocket,
            'settings' => [
                'push_interval' => (int) admin_setting('server_push_interval', 60),
                'pull_interval' => (int) admin_setting('server_pull_interval', 60),
            ],
        ]);
    }

    public function trafficBatch(Request $request, TrafficBatchReceiver $receiver): JsonResponse
    {
        $body = $request->getContent();
        abort_if(strlen($body) > 131072, 413, 'Traffic batch exceeds 128 KiB');
        $input = json_decode($body, false, 8);
        abort_unless(is_object($input), 422, 'Expected a JSON object');
        $node = $request->attributes->get('node_info');
        abort_unless($node, 403, 'An authorized node is required');
        $batchId = $receiver->accept($node, $input->batch_id ?? null, $input->traffic ?? null);
        return response()->json(['batch_id' => $batchId]);
    }

    /**
     * node report api - merge traffic + alive + status + metrics
     */
    public function report(Request $request): JsonResponse
    {
        $node = $request->attributes->get('node_info');

        ServerService::touchNode($node);

        $traffic = $request->input('traffic');
        if (is_array($traffic) && !empty($traffic)) {
            ServerService::processTraffic($node, $traffic);
        }

        $alive = $request->input('alive');
        if (is_array($alive)) {
            app(\App\Services\DeviceStateService::class)->replaceNodeDevices($node->id, $alive);
        }

        $online = $request->input('online');
        if (is_array($online) && !empty($online)) {
            ServerService::processOnline($node, $online);
        }

        $status = $request->input('status');
        if (is_array($status) && !empty($status)) {
            ServerService::processStatus($node, $status);
        }

        $metrics = $request->input('metrics');
        if (is_array($metrics) && !empty($metrics)) {
            ServerService::updateMetrics($node, $metrics);
        }

        return response()->json(['data' => true]);
    }
}
