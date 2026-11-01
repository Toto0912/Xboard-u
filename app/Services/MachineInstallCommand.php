<?php

namespace App\Services;

class MachineInstallCommand
{
    public static function build(string $panelUrl, string $token, int $machineId): string
    {
        $release = 'https://github.com/Toto0912/xboard-node-u/releases/latest/download/';
        $panel = escapeshellarg($panelUrl);
        $secret = escapeshellarg($token);
        $script = implode('; ', [
            'set -eu',
            'umask 077',
            'tmp="$(mktemp -d)"',
            'trap \'rm -rf "$tmp"\' EXIT',
            "trap 'exit 1' HUP INT TERM",
            'if [ -f /etc/alpine-release ]; then apk add --no-cache curl ca-certificates',
            "printf '%s\\n' {$secret} > \"\$tmp/token\"",
            "curl -fsSL '{$release}install-alpine.sh' -o \"\$tmp/install.sh\"",
            "sh \"\$tmp/install.sh\" --mode machine --panel {$panel} --id {$machineId} --token-file \"\$tmp/token\" --kernel singbox",
            "else command -v curl >/dev/null || { echo 'Please install curl first.' >&2; exit 1; }",
            "command -v bash >/dev/null || { echo 'Please install bash first.' >&2; exit 1; }",
            "curl -fsSL '{$release}install.sh' -o \"\$tmp/install.sh\"",
            "bash \"\$tmp/install.sh\" --mode machine --panel {$panel} --token {$secret} --machine-id {$machineId} --kernel singbox",
            'fi',
        ]);

        // One command for root, sudo users, systemd and Alpine/OpenRC. All values
        // are shell-quoted, including the script passed through the sudo wrapper.
        $launcher = 'if [ "$(id -u)" -eq 0 ]; then exec sh -c "$1"; else exec sudo sh -c "$1"; fi';
        return 'sh -c ' . escapeshellarg($launcher) . ' -- ' . escapeshellarg($script);
    }
}
