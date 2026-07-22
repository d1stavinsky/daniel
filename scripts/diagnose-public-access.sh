#!/usr/bin/env bash
# Public accessibility checklist for ENSURA (run on the VPS as root).
set -euo pipefail

DOMAIN="${DOMAIN:-ensura.co.il}"
EXPECTED_IP="${EXPECTED_IP:-185.241.4.184}"

echo "== 1) Public IP of this host =="
curl -4 -fsS --max-time 5 https://ifconfig.me || curl -4 -fsS --max-time 5 https://api.ipify.org
echo

echo "== 2) DNS A / AAAA (apex + www) =="
for host in "$DOMAIN" "www.$DOMAIN"; do
  echo "-- $host"
  dig +short "$host" A @8.8.8.8 || true
  dig +short "$host" AAAA @8.8.8.8 || true
done

echo "== 3) Listening sockets (must include 0.0.0.0:80 and 0.0.0.0:443) =="
ss -tulpn | grep -E ':80|:443' || true

echo "== 4) Docker compose status =="
cd /root/axis-app 2>/dev/null || cd "$(dirname "$0")/.."
docker compose --env-file .env.production ps || docker compose ps

echo "== 5) App bind inside container (must be 0.0.0.0:3000) =="
docker compose --env-file .env.production exec -T app sh -c 'wget -qO- http://127.0.0.1:3000/ >/dev/null && echo app_ok' || echo app_fail
docker compose --env-file .env.production exec -T app sh -c 'printenv HOSTNAME PORT' || true

echo "== 6) Firewall (ufw) =="
if command -v ufw >/dev/null 2>&1; then
  ufw status verbose || true
else
  echo "ufw not installed"
fi

echo "== 7) Local HTTPS response headers (no Alt-Svc / h3 expected) =="
curl -fsSI --max-time 10 "https://$DOMAIN/" | head -n 20 || true

echo "== 8) Expectation check =="
A_RECORD="$(dig +short "$DOMAIN" A @8.8.8.8 | head -1 || true)"
WWW_RECORD="$(dig +short "www.$DOMAIN" A @8.8.8.8 | head -1 || true)"
if [[ "$A_RECORD" != "$EXPECTED_IP" ]]; then
  echo "WARN: $DOMAIN A=$A_RECORD (expected $EXPECTED_IP)"
else
  echo "OK: $DOMAIN → $EXPECTED_IP"
fi
if [[ -z "$WWW_RECORD" ]]; then
  echo "FAIL: www.$DOMAIN has no A record — mobile users typing www will fail DNS"
elif [[ "$WWW_RECORD" != "$EXPECTED_IP" ]]; then
  echo "WARN: www.$DOMAIN A=$WWW_RECORD (expected $EXPECTED_IP)"
else
  echo "OK: www.$DOMAIN → $EXPECTED_IP"
fi

echo "Done."
