#!/usr/bin/env bash
# Fresh Docker installations only. Existing deployments use the image override.
set -euo pipefail
umask 077
repo='https://github.com/Toto0912/Xboard-u'
version=latest
target=/opt/xboard-u
layout=bridge
sqlite=false
download_only=false
fail() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }
usage() {
    printf '%s\n' 'Usage: bash install.sh [--dir PATH] [--layout bridge|host] [--version vX.Y.Z] [--sqlite] [--download-only]' \
        '仅用于全新安装；已有面板请参阅 docs/UPGRADE-XBOARD-U.md。' \
        '需要已安装 Docker Compose v2、curl、sha256sum；默认交互选择数据库。'
}
while (($#)); do
    case "$1" in
        --dir|--layout|--version)
            (($# >= 2)) || fail "$1 缺少参数"
            case "$1" in --dir) target=$2;; --layout) layout=$2;; --version) version=$2;; esac
            shift 2;;
        --sqlite) sqlite=true; shift;;
        --download-only) download_only=true; shift;;
        -h|--help) usage; exit 0;;
        *) fail "未知参数：$1";;
    esac
done
[[ $layout == bridge || $layout == host ]] || fail 'layout 必须为 bridge 或 host'
[[ $version == latest || $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail '版本格式应为 v0.1.0'
[[ $target == /* && $target != / ]] || fail '--dir 必须是绝对路径且不能为根目录'
for command in curl sha256sum mktemp; do command -v "$command" >/dev/null || fail "缺少 $command"; done
if [[ -e $target || -L $target ]]; then
    [[ -d $target && ! -L $target ]] || fail '目标路径不是普通目录'
    [[ -z $(find "$target" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail '目标目录非空：为保护现有面板，拒绝覆盖。请使用升级指南。'
fi
if ! $download_only; then
    command -v docker >/dev/null || fail '请先安装 Docker 和 Compose v2'
    docker compose version >/dev/null
    docker info >/dev/null
fi
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
if [[ $version == latest ]]; then
    resolved=$(curl --proto '=https' --tlsv1.2 -fsSL -o /dev/null -w '%{url_effective}' "$repo/releases/latest")
    version=${resolved##*/}
    [[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail '无法解析最新正式版本'
fi
asset=compose.yaml
[[ $layout != host ]] || asset=compose.host.yaml
base="$repo/releases/download/$version"
curl --proto '=https' --tlsv1.2 -fsSL "$base/$asset" -o "$temp/$asset"
curl --proto '=https' --tlsv1.2 -fsSL "$base/SHA256SUMS.txt" -o "$temp/SHA256SUMS.txt"
expected=$(awk -v file="$asset" '$2 == file {print $1}' "$temp/SHA256SUMS.txt")
[[ $expected =~ ^[0-9a-f]{64}$ ]] || fail '缺少有效的资源校验值'
(cd "$temp" && printf '%s  %s\n' "$expected" "$asset" | sha256sum -c -) || fail '下载资源校验失败'
# Require the resolved release image, never silently substitute an upstream image.
grep -Fq "image: ghcr.io/toto0912/xboard-u:$version" "$temp/$asset" || fail '编排中的镜像版本不匹配'
mkdir -p -- "$target"
cd -- "$target"
set -o noclobber
cat "$temp/$asset" > compose.yaml
: > .env
mkdir -p .docker/.data storage/logs storage/theme plugins
printf '[INFO] 已准备 %s (%s)，目录：%s\n' "$version" "$layout" "$target"
$download_only && exit 0
docker compose -f compose.yaml pull
args=(run -it --rm -e ENABLE_REDIS=true)
$sqlite && args+=(-e ENABLE_SQLITE=true)
docker compose -f compose.yaml "${args[@]}" xboard php artisan xboard:install
grep -Eq '^INSTALLED=(true|1)[[:space:]]*$' .env || fail '初始化未完成；文件已保留，请检查输出后在此目录手动重试初始化。'
docker compose -f compose.yaml up -d
printf '%s\n' '[INFO] 安装完成，默认监听 7001。请保存上方管理员账号、密码和管理入口。' \
    '[INFO] 日志：docker compose logs --tail=100 -f xboard'
