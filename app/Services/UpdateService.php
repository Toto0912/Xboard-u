<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;

class UpdateService
{
    const CACHE_UPDATE_INFO = 'UPDATE_INFO';
    const CACHE_LAST_CHECK = 'LAST_UPDATE_CHECK';
    const CACHE_VERSION = 'CURRENT_VERSION';
    const CACHE_VERSION_DATE = 'CURRENT_VERSION_DATE';

    public function getCurrentVersion(): string
    {
        $date = Cache::get(self::CACHE_VERSION_DATE) ?? date('Ymd');
        $version = Cache::rememberForever(self::CACHE_VERSION, fn () => $this->getCurrentCommit());
        return $date . '-' . $version;
    }

    public function updateVersionCache(): void
    {
        Cache::forever(self::CACHE_VERSION_DATE, date('Ymd'));
        Cache::forever(self::CACHE_VERSION, $this->getCurrentCommit());
        Cache::forget(self::CACHE_UPDATE_INFO);
    }

    protected function getCurrentCommit(): string
    {
        if (is_dir(base_path('.git'))) {
            $result = Process::path(base_path())->run('git rev-parse --short=7 HEAD');
            if ($result->successful() && trim($result->output()) !== '') {
                return trim($result->output());
            }
        }
        return (string) config('app.version');
    }

    public function checkForUpdates(): array
    {
        // The original updater fetches/reset-hard to the upstream project.
        // Fork deployments must keep their reviewed code and existing data.
        return [
            'has_update' => false,
            'is_local_newer' => false,
            'current_version' => config('app.version'),
            'latest_version' => config('app.version'),
            'update_logs' => [],
            'download_url' => '',
            'published_at' => '',
            'author' => '',
            'update_mode' => 'deployment',
        ];
    }

    public function executeUpdate(): array
    {
        return [
            'success' => false,
            'message' => 'xboard-u 请通过经过验证的源码或镜像更新，参阅 docs/UPGRADE-XBOARD-U.md。',
        ];
    }

    public function getLastCheckTime()
    {
        return Cache::get(self::CACHE_LAST_CHECK);
    }

    public function getCachedUpdateInfo(): array
    {
        // Ignore stale upstream-update metadata carried across an upgrade.
        return $this->checkForUpdates();
    }
}
