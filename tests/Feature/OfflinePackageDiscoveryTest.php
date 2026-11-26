<?php

namespace Tests\Feature;

use Illuminate\Filesystem\Filesystem;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;

class OfflinePackageDiscoveryTest extends TestCase
{
    public function test_composer_can_discover_packages_before_database_and_redis_exist(): void
    {
        $root = dirname(__DIR__, 2);
        $cache = sys_get_temp_dir().'/xb-discovery-'.bin2hex(random_bytes(8));
        mkdir($cache, 0700);
        $process = new Process([PHP_BINARY, 'artisan', '--no-ansi', 'package:discover'], $root, [
            'APP_PACKAGES_CACHE' => "$cache/packages.php",
            'APP_SERVICES_CACHE' => "$cache/services.php",
            'APP_CONFIG_CACHE' => "$cache/config.php",
            'APP_ROUTES_CACHE' => "$cache/routes.php",
            'DB_CONNECTION' => 'sqlite',
            'DB_DATABASE' => 'database/missing-'.basename($cache).'.sqlite',
            'DATABASE_URL' => false,
            'REDIS_HOST' => '127.0.0.1',
            'REDIS_PORT' => '1',
        ]);
        try {
            $process->mustRun();
            $this->assertFileExists("$cache/packages.php");
        } finally {
            (new Filesystem())->deleteDirectory($cache);
        }
    }
}
