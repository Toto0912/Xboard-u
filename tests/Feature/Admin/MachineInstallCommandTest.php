<?php

namespace Tests\Feature\Admin;

use App\Models\ServerMachine;
use App\Models\User;
use App\Services\MachineInstallCommand;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MachineInstallCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_and_existing_machine_commands_use_the_published_fork(): void
    {
        Sanctum::actingAs(User::create([
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('a', 32),
            'email' => 'admin@example.test', 'password' => bcrypt('test-password'), 'is_admin' => true,
        ]));
        admin_setting(['app_url' => 'https://panel.example.test/']);
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/server/machine';
        $created = $this->postJson($path . '/save', ['name' => 'local-machine'])->assertOk()->json('data');
        $machine = ServerMachine::findOrFail($created['id']);
        $expected = MachineInstallCommand::build('https://panel.example.test', $machine->token, $machine->id);
        $this->assertSame($expected, $created['install_command']);
        $this->getJson($path . '/installCommand?id=' . $machine->id)
            ->assertOk()->assertJsonPath('data.command', $expected);
        $this->assertStringContainsString('Toto0912/xboard-node-u/releases/latest/download/', $expected);
        $this->assertStringNotContainsString('cedar2025', $expected);
        $this->assertStringContainsString('install-alpine.sh', $expected);
        $this->assertStringContainsString('--kernel singbox', $expected);
        $this->assertStringNotContainsString("\n", $expected);
    }
}
