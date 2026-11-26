<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\Server as ServerModel;
use App\Services\ServerService;
use Closure;
use Illuminate\Http\Request;

/**
 * @deprecated use {@see ServerV2}
 */
class Server
{
    public function handle(Request $request, Closure $next, ?string $nodeType = null)
    {
        $request->validate([
            'token' => [
                'string', 'required',
                function ($attribute, $value, $fail) {
                    if (!\App\Support\Setting::matchesNodeToken($value)) {
                        $fail("Invalid {$attribute}");
                    }
                },
            ],
            'node_id' => ['required', static function ($key, $value, $fail) {
                if (!is_int($value) && !is_string($value)) $fail('Invalid node identifier');
            }],
            'node_type' => [
                'nullable',
                function ($attribute, $value, $fail) use ($request) {
                    if (!is_string($value)) { $fail('Invalid node type specified'); return; }
                    if ($value === 'v2node') {
                        $value = null;
                    }
                    if (!ServerModel::isValidType($value)) {
                        $fail('Invalid node type specified');
                        return;
                    }
                    $request->merge([$attribute => ServerModel::normalizeType($value)]);
                },
            ]
        ]);

        $nodeType = $request->input('node_type', $nodeType);
        $normalizedNodeType = ServerModel::normalizeType($nodeType);
        $serverInfo = ServerService::getServer(
            $request->input('node_id'),
            $normalizedNodeType
        );
        if (!$serverInfo) {
            if ($normalizedNodeType === null || !ServerService::getServer($request->input('node_id'))) {
                return response()->json(['message' => 'Node binding removed'], 410, [
                    'X-Xboard-Node-State' => 'revoked', 'Cache-Control' => 'no-store',
                ]);
            }
            throw new ApiException('Server does not exist');
        }

        $request->attributes->set('node_info', $serverInfo);

        return $next($request);
    }
}
