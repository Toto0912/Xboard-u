<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class UpdateService
{
    const CACHE_UPDATE_INFO = 'UPDATE_INFO';
    const CACHE_LAST_CHECK = 'LAST_UPDATE_CHECK';
    const CACHE_VERSION = 'CURRENT_VERSION';
    const CACHE_VERSION_DATE = 'CURRENT_VERSION_DATE';

    public function getCurrentVersion(): string
    {
        $version = trim((string) config('app.version'));
        if ($version === '') {
            return 'v2.4.1';
        }
        return str_starts_with($version, 'v') ? $version : 'v' . $version;
    }

    public function updateVersionCache(): void
    {
        Cache::forever(self::CACHE_VERSION_DATE, date('Ymd'));
        Cache::forever(self::CACHE_VERSION, $this->getCurrentVersion());
        Cache::forget(self::CACHE_UPDATE_INFO);
    }

    public function checkForUpdates(): array
    {
        // The original updater fetches/reset-hard to the upstream project.
        // Fork deployments must keep their reviewed code and existing data.
        $currentVersion = $this->getCurrentVersion();
        return [
            'has_update' => false,
            'is_local_newer' => false,
            'current_version' => $currentVersion,
            'latest_version' => $currentVersion,
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
