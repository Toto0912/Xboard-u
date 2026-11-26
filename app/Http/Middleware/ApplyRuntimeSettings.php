<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

class ApplyRuntimeSettings
{
    public function handle(Request $request, Closure $next)
    {
        $appUrl = admin_setting('app_url');
        URL::forceRootUrl(is_string($appUrl) && $appUrl !== '' ? $appUrl : null);
        URL::forceScheme(admin_setting('force_https', false) ? 'https' : null);

        return $next($request);
    }
}

