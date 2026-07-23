#!/bin/sh
set -eu

root="${SONGCRAFT_ROOT:-/opt/songcraft}"
local_url="${SONGCRAFT_LOCAL_HEALTH_URL:-http://127.0.0.1:3001/api/songcraft/health}"
public_url="${SONGCRAFT_PUBLIC_HEALTH_URL:-https://v3techbots.online/api/songcraft/health}"
failure_file="${SONGCRAFT_WATCHDOG_STATE:-/run/songcraft-watchdog.failures}"

check_health() {
  curl -fsS --max-time 15 "$1" | grep -q '"ok":true'
}

local_ok=false
public_ok=false
check_health "$local_url" && local_ok=true
check_health "$public_url" && public_ok=true

if [ "$local_ok" = true ] && [ "$public_ok" = true ]; then
  rm -f "$failure_file"
  exit 0
fi

failures=0
if [ -f "$failure_file" ]; then
  failures=$(cat "$failure_file" 2>/dev/null || printf '0')
fi
case "$failures" in
  ''|*[!0-9]*) failures=0 ;;
esac
failures=$((failures + 1))
printf '%s' "$failures" > "$failure_file"
logger -t songcraft-watchdog "health failure $failures: local=$local_ok public=$public_ok"

if [ "$failures" -lt 2 ]; then
  exit 0
fi

if [ "$local_ok" != true ]; then
  cd "$root"
  docker compose up -d --no-build redis app worker
  redis_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' songcraft-redis-1 2>/dev/null || printf 'missing')
  if [ "$redis_health" != "healthy" ] && [ "$redis_health" != "running" ]; then
    docker compose restart redis
    sleep 5
  fi
  docker compose restart app worker
elif nginx -t; then
  systemctl reload nginx
fi

rm -f "$failure_file"
