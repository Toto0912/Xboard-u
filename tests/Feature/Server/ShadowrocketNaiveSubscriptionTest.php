<?php

namespace Tests\Feature\Server;

use App\Protocols\Shadowrocket;
use Tests\TestCase;

class ShadowrocketNaiveSubscriptionTest extends TestCase
{
    private const USER = [
        'id' => 41, 'uuid' => '490e0654-3693-48bc-831a-4cc979a01a41',
        'u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null,
    ];

    private const NODE = [
        'type' => 'naive', 'name' => '测试 #1', 'host' => '2001:db8::41', 'port' => 8443,
        'protocol_settings' => ['tls' => 1, 'tls_settings' => ['server_name' => 'node.example.test']],
    ];

    private function lines(array $user, array $nodes, ?string $version = '3100'): array
    {
        $response = (new Shadowrocket($user, $nodes, 'shadowrocket', $version))->handle();
        return explode("\r\n", rtrim(base64_decode($response->getContent(), true), "\r\n"));
    }

    public function test_native_padded_http2_uri_keeps_credentials_sni_ipv6_and_name(): void
    {
        $users = [self::USER, ['id' => 42, 'uuid' => 'eb65afa9-56ae-4198-a144-891c97600b42'] + self::USER];
        foreach ($users as $user) {
            $lines = $this->lines($user, [self::NODE]);
            $this->assertCount(2, $lines);
            $this->assertStringStartsWith('STATUS=', $lines[0]);
            $this->assertSame(1, preg_match('~^http2://([^?]+)\?([^#]+)#(.+)$~', $lines[1], $parts));
            $this->assertSame($user['id'].':'.$user['uuid'].'@[2001:db8::41]:8443', base64_decode($parts[1], true));
            parse_str($parts[2], $query);
            $this->assertSame(['padding' => '1', 'peer' => 'node.example.test'], $query);
            $this->assertSame(self::NODE['name'], rawurldecode($parts[3]));
        }
    }

    public function test_ech_is_not_silently_downgraded_and_other_nodes_still_export(): void
    {
        $ech = self::NODE;
        $ech['protocol_settings']['tls_settings']['ech'] = ['enabled' => true];
        $ordinary = self::NODE;
        $ordinary['host'] = 'ordinary.example.test';
        $ordinary['protocol_settings']['tls_settings'] = [];
        $lines = $this->lines(self::USER, [$ech, $ordinary]);
        $this->assertCount(2, $lines);
        $this->assertStringContainsString(base64_encode('41:'.self::USER['uuid'].'@ordinary.example.test:8443'), $lines[1]);
        $this->assertStringContainsString('?padding=1', $lines[1]);
        $this->assertStringNotContainsString('insecure=1', strtolower($lines[1]));
    }

    public function test_app_versions_and_numeric_builds_have_separate_thresholds(): void
    {
        foreach ([['2.2.9', 1], ['2.2.24', 2], ['1958', 1], ['1959', 2], [null, 1]] as [$version, $count]) {
            $this->assertCount($count, $this->lines(self::USER, [self::NODE], $version));
        }
    }
}
