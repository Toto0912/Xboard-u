<?php

namespace Tests\Feature\Admin;

use App\Protocols\ClashMeta;
use App\Protocols\General;
use App\Protocols\SingBox;
use App\Protocols\Stash;
use App\Services\ServerService;
use App\Models\Server;
use App\Support\MihomoXhttp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class MihomoRealitySubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private const UUID = '7f894d8b-0d1c-4612-a901-b1475c06f513';
    private const OPTION = 'support-x25519mlkem768';

    private function node(string $protocol, int $tls = 2, string $network = 'tcp'): array
    {
        return ['id' => 1, 'name' => 'reality-test-' . $protocol, 'type' => $protocol,
            'host' => 'proxy.example.test', 'port' => 443, 'password' => self::UUID,
            'protocol_settings' => ['network' => $network, 'tls' => $tls, 'flow' => '',
                'network_settings' => $network === 'xhttp' ? ['path' => '/split', 'mode' => 'auto'] : [],
                'tls_settings' => ['server_name' => 'tls.example.test'],
                'reality_settings' => ['server_name' => 'reality.example.test', 'dest' => 'target.example.test',
                    'server_port' => 443, 'public_key' => str_repeat('A', 43), 'private_key' => 'server-only', 'short_id' => '0123'],
            ]];
    }

    public static function transports(): array
    {
        return [['vless', 'tcp'], ['vless', 'grpc'], ['vless', 'xhttp'], ['trojan', 'tcp'], ['trojan', 'grpc']];
    }

    #[DataProvider('transports')]
    public function test_reality_nodes_enable_mlkem_without_modifying_input(string $protocol, string $network): void
    {
        $node = $this->node($protocol, 2, $network);
        $original = $node;
        $result = $protocol === 'vless' ? ClashMeta::buildVless(self::UUID, $node) : ClashMeta::buildTrojan(self::UUID, $node);
        $this->assertSame(true, $result['reality-opts'][self::OPTION] ?? null);
        $this->assertSame(str_repeat('A', 43), $result['reality-opts']['public-key']);
        $this->assertSame('0123', $result['reality-opts']['short-id']);
        $this->assertSame($original, $node);
    }

    public function test_plain_and_tls_nodes_do_not_receive_mlkem_option(): void
    {
        foreach ([['vless', 0], ['vless', 1], ['trojan', 1]] as [$protocol, $tls]) {
            $node = $this->node($protocol, $tls);
            $result = $protocol === 'vless' ? ClashMeta::buildVless(self::UUID, $node) : ClashMeta::buildTrojan(self::UUID, $node);
            $this->assertArrayNotHasKey('reality-opts', $result);
            $this->assertStringNotContainsString(self::OPTION, json_encode($result));
        }
    }

    public function test_xhttp_download_enables_option_only_for_reality(): void
    {
        foreach (['reality', 'tls', 'none'] as $security) {
            $down = ['address' => 'download.example.test', 'port' => 443, 'network' => 'xhttp', 'security' => $security,
                'realitySettings' => ['publicKey' => str_repeat('A', 43), 'shortId' => '0123', 'serverName' => 'reality.example.test'],
                'xhttpSettings' => ['path' => '/split']];
            $opts = MihomoXhttp::convert(['path' => '/split', 'mode' => 'auto', 'extra' => ['downloadSettings' => $down]])['download-settings'];
            if ($security === 'reality') {
                $this->assertSame(true, $opts['reality-opts'][self::OPTION] ?? null);
            } else {
                $this->assertArrayNotHasKey(self::OPTION, $opts['reality-opts']);
            }
        }
    }

    public function test_yaml_subscription_serializes_option_as_boolean(): void
    {
        $user = ['uuid' => self::UUID, 'u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $servers = [$this->node('vless'), $this->node('trojan'), $this->node('vless', 1)];
        $response = (new ClashMeta($user, $servers, 'meta', '1.19.33'))->handle();
        $proxies = Yaml::parse($response->getContent())['proxies'];
        $this->assertCount(3, $proxies);
        $this->assertSame(true, $proxies[0]['reality-opts'][self::OPTION] ?? null);
        $this->assertSame(true, $proxies[1]['reality-opts'][self::OPTION] ?? null);
        $this->assertArrayNotHasKey('reality-opts', $proxies[2]);
        $this->assertStringNotContainsString('server-only', $response->getContent());
    }

    public function test_stash_reality_builders_enable_mlkem_and_preserve_keys(): void
    {
        $stash = new Stash([], [], 'stash', '3.6.0');
        foreach (['vless', 'trojan'] as $protocol) {
            foreach ([1, 2] as $tls) {
                $node = $this->node($protocol, $tls);
                $original = $node;
                $result = $protocol === 'vless' ? $stash->buildVless(self::UUID, $node) : $stash->buildTrojan(self::UUID, $node);
                if ($tls === 2) {
                    $this->assertSame(true, $result['reality-opts'][self::OPTION] ?? null);
                    $this->assertSame(str_repeat('A', 43), $result['reality-opts']['public-key']);
                    $this->assertSame('0123', $result['reality-opts']['short-id']);
                } else {
                    $this->assertArrayNotHasKey('reality-opts', $result);
                    $this->assertStringNotContainsString(self::OPTION, json_encode($result));
                }
                $this->assertSame($original, $node);
            }
        }
    }

    public function test_stash_yaml_enables_option_without_changing_protocol_filters(): void
    {
        $user = ['uuid' => self::UUID, 'u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $servers = [$this->node('vless'), $this->node('vless', 1), $this->node('trojan', 1), $this->node('trojan')];
        // Preserve the existing Stash filter: Trojan Reality is not exported.
        $response = (new Stash($user, $servers, 'stash', '3.6.0'))->handle();
        $proxies = Yaml::parse($response->getContent())['proxies'];
        $this->assertCount(3, $proxies);
        $this->assertSame(true, $proxies[0]['reality-opts'][self::OPTION] ?? null);
        $this->assertSame('reality.example.test', $proxies[0]['sni']);
        $this->assertArrayNotHasKey('reality-opts', $proxies[1]);
        $this->assertArrayNotHasKey('reality-opts', $proxies[2]);
        $this->assertStringNotContainsString('server-only', $response->getContent());
    }

    public function test_singbox_general_and_server_payload_do_not_receive_yaml_option(): void
    {
        $user = ['uuid' => self::UUID, 'u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $node = $this->node('vless');
        foreach ([SingBox::class, General::class] as $class) {
            $response = (new $class($user, [$node]))->handle();
            $content = is_object($response) ? $response->getContent() : $response;
            if ($class === General::class) {
                $content = base64_decode($content);
            }
            $this->assertStringNotContainsString(self::OPTION, $content);
        }
        $server = new Server($node + ['server_port' => 443, 'rate' => 1]);
        $payload = ServerService::buildNodeConfig($server);
        $this->assertStringNotContainsString(self::OPTION, json_encode($payload));
    }
}
