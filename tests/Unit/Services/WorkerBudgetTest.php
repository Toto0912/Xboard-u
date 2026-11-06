<?php

namespace Tests\Unit\Services;

use Laravel\Horizon\Supervisor;
use Laravel\Horizon\SupervisorOptions;
use Laravel\Horizon\ProvisioningPlan;
use Tests\TestCase;

class BudgetPool
{
    public int $workers = 0;
    public function __construct(private string $name) {}
    public function queue() { return $this->name; }
    public function scale($count) { $this->workers = $count; }
}

class BudgetSupervisor extends Supervisor
{
    protected function createProcessPool(SupervisorOptions $options) { return new BudgetPool($options->queue); }
}

class WorkerBudgetTest extends TestCase
{
    public function test_each_minimal_role_stays_at_one_worker_and_keeps_all_queues(): void
    {
        $keys = ['HORIZON_DATA_PIPELINE_MAX', 'HORIZON_BUSINESS_MAX', 'HORIZON_NOTIFICATION_MAX'];
        $oldEnv = $_ENV; $oldServer = $_SERVER;
        try {
            foreach ($keys as $key) $_ENV[$key] = $_SERVER[$key] = '1';
            $config = require config_path('horizon.php');
            foreach ($config['environments']['production'] as $role) {
                $options = new SupervisorOptions('budget-test', 'redis', implode(',', $role['queue']),
                    balance: $role['balance'], maxProcesses: $role['maxProcesses'], minProcesses: $role['minProcesses']);
                $supervisor = (new \ReflectionClass(BudgetSupervisor::class))->newInstanceWithoutConstructor();
                $supervisor->options = $options;
                $supervisor->processPools = $supervisor->createProcessPools();
                $supervisor->scale(1);
                $this->assertSame(1, $options->maxProcesses);
                $this->assertCount(1, $supervisor->processPools);
                $this->assertSame(1, $supervisor->processPools->sum('workers'));
                $this->assertSame(implode(',', $role['queue']), $supervisor->processPools->first()->queue());
            }
            $this->assertSame('node_sync', $config['environments']['production']['notification']['queue'][0]);
            // Include the package defaults exactly as Horizon does at boot.
            $defaults = ['supervisor-1' => ['connection' => 'redis', 'queue' => ['default'],
                'balance' => 'auto', 'maxProcesses' => 1, 'minProcesses' => 1]];
            $plan = new ProvisioningPlan('budget-test', $config['environments'],
                array_replace_recursive($defaults, $config['defaults']));
            $active = $plan->parsed['production']->filter(fn ($options) => $options->maxProcesses > 0)->all();
            $this->assertCount(3, $active);
            $this->assertSame(3, array_sum(array_map(fn ($options) => $options->maxProcesses, $active)));
            // The app's nonempty defaults also work without vendor merging.
            $plan = new ProvisioningPlan('budget-test', $config['environments'], $config['defaults']);
            $this->assertSame(0, $plan->parsed['production']['supervisor-1']->maxProcesses);
        } finally { $_ENV = $oldEnv; $_SERVER = $oldServer; }
    }
}
