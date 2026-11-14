<?php

namespace App\Protocols;

use App\Models\Server;
use App\Support\AbstractProtocol;
use App\Support\SurgeXhttp;
use App\Utils\Helper;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

class Surge extends AbstractProtocol
{
    // Surge can represent arbitrary WS headers. Validate the remaining native
    // Sing-box-only transport options below instead of the shared blanket filter.
    protected bool $supportsNativeSingBoxTransport = true;

    public $flags = ['surge'];
    const CUSTOM_TEMPLATE_FILE = 'resources/rules/custom.surge.conf';
    const DEFAULT_TEMPLATE_FILE = 'resources/rules/default.surge.conf';

    public $allowedProtocols = [
        Server::TYPE_SHADOWSOCKS, Server::TYPE_VMESS, Server::TYPE_VLESS,
        Server::TYPE_TROJAN, Server::TYPE_HYSTERIA, Server::TYPE_TUIC,
        Server::TYPE_ANYTLS, Server::TYPE_SOCKS, Server::TYPE_HTTP,
    ];

    protected function filterServersByVersion()
    {
        return array_values(array_filter(parent::filterServersByVersion(), function ($server) {
            $type = $server['type'];
            if ($type === Server::TYPE_VLESS) {
                return $this->supportsSurgeVersion('6.0.0', '6.12.0', 12840);
            }
            if ($type === Server::TYPE_HYSTERIA) {
                if (!$this->supportsSurgeVersion('5.8.0', '5.4.0', 2398)) {
                    return false;
                }
                if (data_get($server, 'protocol_settings.obfs.open')) {
                    $gecko = data_get($server, 'protocol_settings.obfs.type', 'salamander') === 'gecko';
                    return $this->supportsSurgeVersion($gecko ? '5.20.0' : '5.17.0', $gecko ? '6.7.0' : '6.4.3', $gecko ? 11730 : 10320);
                }
            }
            if ($type === Server::TYPE_ANYTLS) {
                return $this->supportsSurgeVersion('5.17.0', '6.4.3', 10320);
            }
            return true;
        }));
    }

    private function supportsSurgeVersion(string $ios, string $mac, int $build): bool
    {
        // An explicit versionless export targets the current configuration syntax.
        if (blank($this->clientVersion)) {
            return true;
        }
        // Historical Surge subscriptions use build numbers, not semantic versions.
        if (ctype_digit($this->clientVersion) && (int) $this->clientVersion >= 1000) {
            return (int) $this->clientVersion >= $build;
        }
        $agent = $this->userAgent ?? '';
        $isMac = preg_match('/surge[\s_-]*mac|macos|macintosh|mac os x/i', $agent)
            && !preg_match('/iphone|ipad|ios|tvos/i', $agent);
        return version_compare($this->clientVersion, $isMac ? $mac : $ios, '>=');
    }

    public function handle()
    {
        $config = subscribe_template('surge');
        $lines = [];
        $names = [];
        // Avoid duplicate node names and collisions with template policies.
        $reserved = ['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP', 'REJECT-TINYGIF'];
        if (preg_match('/\[Proxy Group\]([^\[]*)/i', $config, $groups)) {
            preg_match_all('/^\s*([^#;\r\n=]+)\s*=/m', $groups[1], $matches);
            $reserved = array_merge($reserved, array_map('trim', $matches[1]));
        }
        foreach ($this->servers as $item) {
            try {
                $baseName = $item['name'];
                $suffix = 1;
                while (in_array($item['name'], [...$reserved, ...$names], true)) {
                    $item['name'] = $baseName . ' (' . ++$suffix . ')';
                }
                $password = $item['password'];
                $line = match ($item['type']) {
                    Server::TYPE_SHADOWSOCKS => self::buildShadowsocks($password, $item),
                    Server::TYPE_VMESS => self::buildVmess($password, $item),
                    Server::TYPE_VLESS => self::buildVless($password, $item),
                    Server::TYPE_TROJAN => self::buildTrojan($password, $item),
                    Server::TYPE_HYSTERIA => self::buildHysteria($password, $item),
                    Server::TYPE_TUIC => self::buildTuic($password, $item),
                    Server::TYPE_ANYTLS => self::buildAnyTLS($password, $item),
                    Server::TYPE_SOCKS => self::buildSocks($password, $item),
                    Server::TYPE_HTTP => self::buildHttp($password, $item),
                };
                $lines[] = $line;
                $names[] = $item['name'];
            } catch (InvalidArgumentException $error) {
                Log::warning('Skipped incompatible Surge node', [
                    'node_id' => $item['id'] ?? null, 'reason' => $error->getMessage(),
                ]);
            }
        }

        $user = $this->user;
        $appName = admin_setting('app_name', 'XBoard');
        $subsDomain = request()->getHost();
        $subsURL = Helper::getSubscribeUrl($user['token'], $subsDomain ? 'https://' . request()->getHttpHost() : null);
        $subsURL .= (str_contains($subsURL, '?') ? '&' : '?') . 'flag=surge';
        $upload = round($user['u'] / (1024 ** 3), 2);
        $download = round($user['d'] / (1024 ** 3), 2);
        $total = round($user['transfer_enable'] / (1024 ** 3), 2);
        $expiry = $user['expired_at'] === null ? '长期有效' : date('Y-m-d H:i:s', $user['expired_at']);
        $info = 'title=' . self::value($appName . '订阅信息') . ', content=' . self::value("上传流量：{$upload}GB\\n下载流量：{$download}GB\\n剩余流量：" . ($total - $upload - $download) . "GB\\n套餐流量：{$total}GB\\n到期时间：{$expiry}");
        $config = strtr($config, [
            '$subs_link' => $subsURL, '$subs_domain' => $subsDomain,
            '$proxies' => implode('', $lines), '$subscribe_info' => $info,
            '$proxy_group' => implode(', ', array_map(self::value(...), $names ?: ['DIRECT'])),
        ]);

        return response($config, 200)
            ->header('content-type', 'application/octet-stream')
            ->header('subscription-userinfo', "upload={$user['u']}; download={$user['d']}; total={$user['transfer_enable']}; expire={$user['expired_at']}")
            ->header('profile-update-interval', '24')
            ->header('content-disposition', "attachment;filename*=UTF-8''" . rawurlencode($appName) . '.conf');
    }

    public static function buildVless($uuid, $server)
    {
        $settings = $server['protocol_settings'];
        $network = $settings['network'] ?? 'tcp';
        $tls = (int) ($settings['tls'] ?? 0);
        $flow = $settings['flow'] ?? '';
        $encryption = data_get($settings, 'encryption.enabled')
            ? data_get($settings, 'encryption.encryption', '') : '';
        if (data_get($settings, 'encryption.enabled') && (!$encryption || $encryption === 'none')) {
            throw new InvalidArgumentException('VLESS Encryption requires a client key');
        }
        if (!in_array($tls, [0, 1, 2], true) || !in_array($network, ['tcp', 'ws', 'grpc', 'xhttp'], true)
            || !in_array($flow, ['', 'none', 'xtls-rprx-vision', 'xtls-rprx-vision-udp443'], true)) {
            throw new InvalidArgumentException('unsupported VLESS security, transport or flow');
        }
        if (($network === 'ws' && $tls === 2) || ($network === 'grpc' && ($tls === 0 || !in_array($flow, ['', 'none'], true)))) {
            throw new InvalidArgumentException('unsupported VLESS transport/security combination');
        }
        $options = ['username' => $uuid];
        if ($encryption) {
            $options['encryption'] = $encryption;
        }
        if ($flow && $flow !== 'none') {
            if (!$encryption && ($network !== 'tcp' || $tls === 0)) {
                throw new InvalidArgumentException('Vision requires RAW + TLS/REALITY or VLESS Encryption');
            }
            $options['flow'] = $flow;
        }
        if ($tls === 2) {
            $key = data_get($settings, 'reality_settings.public_key', '');
            $shortId = data_get($settings, 'reality_settings.short_id') ?? '';
            $sni = data_get($settings, 'reality_settings.server_name', '');
            if (!is_string($key) || !preg_match('/^[A-Za-z0-9_+\/-]{43}=?$/D', $key)
                || strlen(base64_decode(strtr($key, '-_', '+/'), true) ?: '') !== 32
                || !is_string($shortId) || !preg_match('/^[a-fA-F0-9]{0,16}$/D', $shortId) || !$sni) {
                throw new InvalidArgumentException('invalid Reality public key, short ID or SNI');
            }
            $options += ['reality-public-key' => $key, 'reality-short-id' => $shortId, 'sni' => $sni];
        } elseif ($tls === 1) {
            $options += ['tls' => true] + self::tls($settings['tls_settings'] ?? []);
        }
        return self::line($server, 'vless', $options + self::transport($settings));
    }

    public static function buildVmess($uuid, $server)
    {
        $settings = $server['protocol_settings'];
        if (!in_array($settings['network'] ?? 'tcp', ['tcp', 'ws'], true) || (int) ($settings['tls'] ?? 0) === 2) {
            throw new InvalidArgumentException('Surge VMess supports RAW/WS without Reality');
        }
        $options = ['username' => $uuid, 'vmess-aead' => true, 'udp-relay' => true];
        if ((int) ($settings['tls'] ?? 0) === 1) {
            $options += ['tls' => true] + self::tls($settings['tls_settings'] ?? []);
        }
        return self::line($server, 'vmess', $options + self::transport($settings));
    }

    public static function buildTrojan($password, $server)
    {
        $settings = $server['protocol_settings'];
        if (!in_array($settings['network'] ?? 'tcp', ['tcp', 'ws'], true) || (int) ($settings['tls'] ?? 1) !== 1) {
            throw new InvalidArgumentException('Surge Trojan supports RAW/WS with ordinary TLS');
        }
        return self::line($server, 'trojan', ['password' => $password]
            + self::tls($settings['tls_settings'] ?? []) + self::transport($settings));
    }

    public static function buildHysteria($password, $server)
    {
        $settings = $server['protocol_settings'];
        if ((int) ($settings['version'] ?? 2) !== 2) {
            throw new InvalidArgumentException('Surge does not support Hysteria v1');
        }
        $options = ['password' => $password] + self::tls($settings['tls'] ?? []);
        // Surge documents download-bandwidth only; server upload limits stay server-side.
        if (data_get($settings, 'bandwidth.down')) {
            $options['download-bandwidth'] = data_get($settings, 'bandwidth.down');
        }
        if (data_get($settings, 'obfs.open')) {
            $type = data_get($settings, 'obfs.type', 'salamander');
            $secret = data_get($settings, 'obfs.password');
            if (!in_array($type, ['salamander', 'gecko'], true) || !is_string($secret) || $secret === '') {
                throw new InvalidArgumentException('unsupported or missing Hysteria obfuscation');
            }
            $options[$type . '-password'] = $secret;
        }
        return self::line($server, 'hysteria2', $options + self::portHopping($server, $settings));
    }

    public static function buildTuic($password, $server)
    {
        $settings = $server['protocol_settings'];
        $version = (int) ($settings['version'] ?? 5);
        if (!in_array($version, [4, 5], true)) {
            throw new InvalidArgumentException('unsupported TUIC version');
        }
        // The node API uses the derived user password for both TUIC v5 credentials.
        $options = $version === 4 ? ['token' => $password] : ['uuid' => $password, 'password' => $password];
        $options += self::tls($settings['tls'] ?? []);
        if (!empty($settings['alpn'])) {
            $options['alpn'] = self::alpn($settings['alpn']);
        }
        return self::line($server, $version === 4 ? 'tuic' : 'tuic-v5', $options + self::portHopping($server, $settings));
    }

    public static function buildAnyTLS($password, $server)
    {
        return self::line($server, 'anytls', ['password' => $password]
            + self::tls(data_get($server, 'protocol_settings.tls', [])));
    }

    public static function buildSocks($password, $server)
    {
        $tls = data_get($server, 'protocol_settings.tls');
        return self::line($server, $tls ? 'socks5-tls' : 'socks5',
            ['username' => $password, 'password' => $password, 'udp-relay' => true]
            + ($tls ? self::tls(data_get($server, 'protocol_settings.tls_settings', [])) : []));
    }

    public static function buildHttp($password, $server)
    {
        $tls = data_get($server, 'protocol_settings.tls');
        return self::line($server, $tls ? 'https' : 'http', ['username' => $password, 'password' => $password]
            + ($tls ? self::tls(data_get($server, 'protocol_settings.tls_settings', [])) : []));
    }

    public static function buildShadowsocks($password, $server)
    {
        $settings = $server['protocol_settings'];
        if (!in_array($settings['cipher'] ?? '', ['aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm',
            'chacha20-ietf-poly1305', '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'], true)) {
            throw new InvalidArgumentException('unsupported Surge Shadowsocks cipher');
        }
        $options = ['encrypt-method' => $settings['cipher'], 'password' => $password, 'udp-relay' => true];
        if (!empty($settings['plugin'])) {
            if ($settings['plugin'] !== 'obfs') {
                throw new InvalidArgumentException('unsupported Surge Shadowsocks plugin');
            }
            $plugin = [];
            foreach (explode(';', $settings['plugin_opts'] ?? '') as $pair) {
                if (str_contains($pair, '=')) {
                    [$key, $value] = explode('=', $pair, 2);
                    $plugin[trim($key)] = trim($value);
                }
            }
            if (!in_array($plugin['obfs'] ?? '', ['http', 'tls'], true)) {
                throw new InvalidArgumentException('invalid Shadowsocks obfs mode');
            }
            $options['obfs'] = $plugin['obfs'];
            foreach (['obfs-host' => 'obfs-host', 'path' => 'obfs-uri'] as $source => $target) {
                if (isset($plugin[$source])) {
                    $options[$target] = $plugin[$source];
                }
            }
        }
        return self::line($server, 'ss', $options);
    }

    private static function transport(array $settings): array
    {
        $params = $settings['network_settings'] ?? [];
        if (!empty($params['max_early_data']) || !empty($params['early_data_header_name'])
            || !empty($params['idle_timeout']) || !empty($params['ping_timeout']) || !empty($params['permit_without_stream'])) {
            throw new InvalidArgumentException('transport options cannot be represented in Surge');
        }
        return match ($settings['network'] ?? 'tcp') {
            'tcp' => self::raw($params),
            'ws' => ['ws' => true] + (isset($params['path']) ? ['ws-path' => $params['path']] : [])
                + ['ws-headers' => $params['headers'] ?? []],
            'grpc' => ['grpc' => true, 'grpc-service-name' => $params['serviceName'] ?? $params['service_name'] ?? '']
                + (isset($params['authority']) ? ['grpc-authority' => $params['authority']] : [])
                + (!empty($params['multiMode']) ? ['grpc-mode' => 'multi'] : []),
            'xhttp' => SurgeXhttp::convert($params),
            default => throw new InvalidArgumentException('unsupported Surge transport'),
        };
    }

    private static function raw(array $params): array
    {
        if (!in_array(data_get($params, 'header.type', 'none'), ['none', null, ''], true)) {
            throw new InvalidArgumentException('Surge cannot represent RAW header camouflage');
        }
        return [];
    }

    private static function tls(?array $tls): array
    {
        $tls ??= [];
        if (data_get($tls, 'ech.enabled')) {
            throw new InvalidArgumentException('Surge does not support ECH');
        }
        $options = [];
        if (!empty($tls['server_name'])) {
            $options['sni'] = $tls['server_name'];
        }
        if (!empty($tls['allow_insecure'])) {
            $options['skip-cert-verify'] = true;
        }
        if (!empty($tls['alpn'])) {
            $options['alpn'] = self::alpn($tls['alpn']);
        }
        return $options;
    }

    private static function alpn(mixed $value): string
    {
        if (is_string($value)) {
            return $value;
        }
        if (!is_array($value) || array_filter($value, fn ($item) => !is_string($item))) {
            throw new InvalidArgumentException('invalid ALPN list');
        }
        return implode(',', $value);
    }

    private static function portHopping(array $server, array $settings): array
    {
        if (empty($server['ports'])) {
            return [];
        }
        $ports = preg_split('/[,;\s]+/', trim((string) $server['ports']));
        foreach ($ports as $range) {
            if (!preg_match('/^(\d+)(?:[-:](\d+))?$/D', $range, $match)
                || (int) $match[1] < 1 || (int) ($match[2] ?? $match[1]) > 65535
                || (int) $match[1] > (int) ($match[2] ?? $match[1])) {
                throw new InvalidArgumentException('invalid port hopping range');
            }
        }
        $options = ['port-hopping' => str_replace(':', '-', implode(';', $ports))];
        if (!empty($settings['hop_interval'])) {
            $options['port-hopping-interval'] = (int) $settings['hop_interval'];
        }
        return $options;
    }

    private static function line(array $server, string $type, array $options): string
    {
        $parts = [self::value($server['host']), self::value($server['port'])];
        if (in_array($type, ['socks5', 'socks5-tls', 'http', 'https'], true)) {
            $parts[] = self::value($options['username']);
            $parts[] = self::value($options['password']);
            unset($options['username'], $options['password']);
        }
        foreach ($options as $key => $value) {
            if (in_array($key, ['ws-headers', 'xhttp-headers'], true)) {
                $headers = [];
                foreach ($value as $name => $header) {
                    if (!preg_match('/^[!#$%&\x27*+.^_`~0-9a-z-]+$/iD', (string) $name) || !is_string($header) || str_contains($header, '|')) {
                        throw new InvalidArgumentException('unrepresentable Surge request header');
                    }
                    $headers[] = $name . ':' . $header;
                }
                if (!$headers) {
                    continue;
                }
                $value = implode('|', $headers);
            }
            $parts[] = $key . '=' . self::value($value);
        }
        return self::value($server['name']) . ' = ' . $type . ', ' . implode(', ', $parts) . "\r\n";
    }

    private static function value(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if ((!is_scalar($value) && $value !== null) || preg_match('/[\x00-\x1f\x7f]/', (string) $value)) {
            throw new InvalidArgumentException('invalid Surge configuration value');
        }
        $value = (string) $value;
        return $value === '' || preg_match('/[,=\s"\\\\#;]/u', $value)
            ? '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $value) . '"' : $value;
    }
}
