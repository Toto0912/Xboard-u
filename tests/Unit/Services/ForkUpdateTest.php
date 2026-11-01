<?php

namespace Tests\Unit\Services;

use App\Services\UpdateService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class ForkUpdateTest extends TestCase
{
    public function test_fork_never_runs_the_upstream_destructive_updater(): void
    {
        Http::fake();
        Process::fake();
        Cache::put(UpdateService::CACHE_UPDATE_INFO, ['has_update' => true, 'latest_version' => 'upstream']);
        $service = new UpdateService();
        $this->assertFalse($service->checkForUpdates()['has_update']);
        $this->assertSame('deployment', $service->getCachedUpdateInfo()['update_mode']);
        $this->assertFalse($service->executeUpdate()['success']);
        Http::assertNothingSent();
        Process::assertNothingRan();
    }
}
