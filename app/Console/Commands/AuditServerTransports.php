<?php

namespace App\Console\Commands;

use App\Models\Server;
use Illuminate\Console\Command;

final class AuditServerTransports extends Command
{
    protected $signature = 'server:audit-transports';

    protected $description = 'List active server connections that require review before using the bundled Xray core';

    public function handle(): int
    {
        $rows = [];
        foreach (Server::query()->select(['id', 'type', 'host', 'port', 'server_port', 'protocol_settings', 'cdn_settings'])->lazyById() as $node) {
            $settings = $node->serverConnection()['protocol_settings'];
            $network = $settings['network'] ?? null;
            $issues = [];
            if (in_array($network, ['h2', 'h3', 'http', 'quic'], true)) {
                $issues[] = 'Xray 旧传输需迁移';
            }
            $headers = $settings['network_settings']['headers'] ?? null;
            if (in_array($network, ['ws', 'websocket'], true) && is_array($headers)
                && array_key_exists('host', array_change_key_case($headers))) {
                $issues[] = 'Xray WebSocket 请使用独立 host 字段';
            }
            if (!empty($settings['tls_settings']['allow_insecure'])) {
                $issues[] = 'Xray 已移除 allowInsecure';
            }
            if (!$issues) {
                continue;
            }

            $rows[] = [
                $node->id,
                $node->type,
                $network,
                $settings['target_kernel'] ?? '未登记',
                implode(' / ', $issues),
            ];
        }

        $this->info('以下提示适用于实际使用 Xray 的节点。请核对节点端实际内核。');
        $this->table(['节点 ID', '协议', '服务端传输', '面板目标内核', '处理说明'], $rows);
        return self::SUCCESS;
    }
}
