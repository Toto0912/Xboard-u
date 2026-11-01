#!/usr/bin/env bash
# Fresh install + HTTP smoke test. All runtime data must be outside the source.
set -euo pipefail
assets=$(realpath "$1")
mkdir -p "$2"
runtime=$(realpath "$2")
source_root=$(cd "$(dirname "$0")/.." && pwd)
[[ $runtime != "$source_root" && $runtime != "$source_root/"* ]]
cd "$runtime"
cp "$assets/compose.yaml" compose.yaml
if [[ -n ${RELEASE_IMAGE:-} ]]; then
    sed -i "s|image: ghcr.io/toto0912/xboard-u:.*|image: $RELEASE_IMAGE|" compose.yaml
fi
touch .env
mkdir -p .docker/.data storage/logs storage/theme plugins
project="xbu-smoke-$$"
compose=(docker compose -p "$project" -f compose.yaml)
trap '"${compose[@]}" down -v >/dev/null 2>&1 || true' EXIT
# The random initial password is private test output, never a release artifact.
"${compose[@]}" run --rm -T -e ENABLE_SQLITE=true -e ENABLE_REDIS=true \
    -e ADMIN_ACCOUNT=release-test@example.invalid xboard php artisan xboard:install >install-private.log 2>&1
grep -Eq '^INSTALLED=(true|1)[[:space:]]*$' .env
"${compose[@]}" up -d
for ((attempt=0; attempt<60; attempt++)); do
    if curl -fsS http://127.0.0.1:7001/ -o /dev/null; then
        "${compose[@]}" exec -T xboard php artisan --version
        printf '%s\n' 'Fresh SQLite installation and HTTP smoke test passed'
        exit 0
    fi
    sleep 2
done
printf '%s\n' 'HTTP readiness failed' >&2
exit 1
