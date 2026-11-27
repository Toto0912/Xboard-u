<?php

namespace Tests\Feature;

use App\Services\Plugin\PluginManager;
use App\Services\ThemeService;
use App\Support\PackageFiles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;
use ZipArchive;

class PackageManagementTest extends TestCase
{
    use RefreshDatabase;

    private function archive(array $members): UploadedFile
    {
        $file = tmpfile();
        $zip = new ZipArchive();
        $zip->open(stream_get_meta_data($file)['uri'], ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($members as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();
        return UploadedFile::fake()->createWithContent('Theme.zip', file_get_contents(stream_get_meta_data($file)['uri']));
    }

    public function test_theme_upgrade_rejects_invalid_candidate_and_publishes_static_files_only(): void
    {
        $name = 'Example' . Str::random(10);
        $theme = app(ThemeService::class);
        $installed = storage_path('theme/' . $name);
        $public = public_path('theme/' . $name);
        $members = [
            'config.json' => json_encode(['name' => $name, 'version' => '1.0.0']),
            'dashboard.blade.php' => 'template', 'assets/main.css' => 'one',
        ];
        try {
            $this->assertTrue($theme->upload($this->archive($members)));
            $theme->publish($name);
            $this->assertSame('one', file_get_contents($public . '/assets/main.css'));
            $this->assertFileDoesNotExist($public . '/dashboard.blade.php');
            $this->assertFileDoesNotExist($public . '/config.json');
            try {
                $theme->upload($this->archive($members + ['assets/invalid?.txt' => 'invalid']));
                $this->fail('Invalid candidate should be rejected.');
            } catch (\RuntimeException $e) {
                $this->assertSame('Invalid package member name', $e->getMessage());
            }
            $this->assertSame('one', file_get_contents($installed . '/assets/main.css'));
            $members['config.json'] = json_encode(['name' => $name, 'version' => '1.0.1']);
            $members['assets/main.css'] = 'two';
            $this->assertTrue($theme->upload($this->archive($members)));
            $this->assertSame('two', file_get_contents($installed . '/assets/main.css'));
            $this->assertTrue($theme->delete($name));
            $this->assertDirectoryDoesNotExist($installed);
        } finally {
            File::deleteDirectory($public);
            File::deleteDirectory($installed);
        }
    }

    public function test_active_theme_selection_and_dotted_directory_match_the_public_route(): void
    {
        $name = 'Example.' . Str::random(10);
        $theme = app(ThemeService::class);
        try {
            $this->assertTrue($theme->upload($this->archive([
                'config.json' => json_encode(['name' => $name, 'version' => '1.0.0']),
                'dashboard.blade.php' => 'Theme fixture {{ $theme }}',
            ])));
            foreach ([[null, $name], [$name, null], [$name, 'Xboard']] as [$current, $legacy]) {
                admin_setting(['frontend_theme' => $current, 'current_theme' => $legacy]);
                $this->assertSame($name, ThemeService::activeTheme());
                $this->get('/')->assertOk()->assertSee('Theme fixture ' . $name);
                $this->assertTrue($theme->refreshCurrentTheme());
                try {
                    $theme->delete($name);
                    $this->fail('Active theme deletion should be rejected');
                } catch (\Exception $e) {
                    $this->assertSame('Current theme cannot be deleted', $e->getMessage());
                }
            }
            try {
                $theme->switch('missing-' . $name);
                $this->fail('Unknown theme should be rejected');
            } catch (\Exception $e) {
                $this->assertSame('Theme not found', $e->getMessage());
            }
            $this->assertSame($name, ThemeService::activeTheme());
            $this->assertTrue($theme->switch('Xboard'));
            $this->assertSame('Xboard', admin_setting('current_theme'));
            $this->assertSame('Xboard', admin_setting('frontend_theme'));
            $this->assertTrue($theme->delete($name));
        } finally {
            File::deleteDirectory(public_path('theme/' . $name));
            File::deleteDirectory(storage_path('theme/' . $name));
        }
    }

    public function test_plugin_upload_update_uninstall_and_protected_directory(): void
    {
        $code = 'fixture_' . strtolower(Str::random(10));
        $manager = app(PluginManager::class);
        $path = $manager->getUserPluginPath($code);
        $manifest = ['name' => 'Fixture', 'code' => $code, 'version' => '1.0.0', 'author' => 'Tests', 'description' => 'Test package'];
        try {
            foreach (['1.0.0', '1.1.0'] as $version) {
                $manifest['version'] = $version;
                $this->assertTrue($manager->upload($this->archive(['Package/config.json' => json_encode($manifest)])));
                $this->assertSame($version, json_decode(file_get_contents($path . '/config.json'), true)['version']);
            }
            $this->assertTrue($manager->delete($code));
            $this->assertDirectoryDoesNotExist($path);
            $this->assertTrue($manager->isCorePlugin('telegram'));
            $this->expectException(\Exception::class);
            $manager->delete('telegram');
        } finally {
            File::deleteDirectory($path);
        }
    }
}
