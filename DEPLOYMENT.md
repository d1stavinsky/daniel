# ENSURA VPS deployment checklist

The Next.js app runs in Docker behind **Caddy**, which terminates TLS (Let's Encrypt)
and reverse-proxies to the app on the internal Docker network.

## Architecture

```text
Internet → :80/:443 TCP (Caddy) → app:3000 (Next.js)
                ↑
         auto HTTPS + HTTP→HTTPS redirect
         HTTP/1.1 + HTTP/2 only (HTTP/3 disabled for mobile carrier compatibility)
```

## Mobile / external network access

If the site works on your office desktop but fails on cellular or external Wi‑Fi, run this order:

### 1) DNS (most common)

`ensura.co.il` must resolve to the VPS. **`www.ensura.co.il` must also have an A record** (same IP). As of deployment checks, missing `www` causes phones that open `www.…` to fail while desktops using the apex still work.

At your DNS provider (box.co.il):

| Host | Type | Value |
| --- | --- | --- |
| `@` / `ensura.co.il` | A | `185.241.4.184` |
| `www` | A | `185.241.4.184` |

Do **not** publish an `AAAA` record unless the VPS has working public IPv6 end-to-end.

Verify from any network:

```bash
dig +short ensura.co.il A @8.8.8.8
dig +short www.ensura.co.il A @8.8.8.8
```

### 2) Firewall / security group

On the VPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
ufw status verbose
ss -tulpn | grep -E ':80|:443'
```

Also open **TCP 80/443** in the CloudWebManage / hosting panel firewall if one exists (host UFW alone is not enough when the provider filters upstream).

### 3) Docker bind (must not be localhost-only)

Caddy publishes `0.0.0.0:80` and `0.0.0.0:443`. The Next.js app listens on `HOSTNAME=0.0.0.0` port `3000` inside the Docker network only.

```bash
cd /root/axis-app
bash scripts/diagnose-public-access.sh
docker compose --env-file .env.production logs --tail=80 caddy
```

### 4) Phone-side checks

1. Open exactly `https://ensura.co.il` (not `http://`, not the bare IP).
2. Try mobile data and a different Wi‑Fi.
3. Clear Safari/Chrome site data if an old HTTP/3 (`h3`) attempt was cached.
4. Confirm DNS on the phone (Settings → Wi‑Fi → DNS) is not a broken captive resolver.


4. Clone and configure:

```bash
git clone <repository-url> axis-app
cd axis-app
cp .env.example .env.production
chmod 600 .env.production
nano .env.production
```

Required public URLs (must be HTTPS):

```bash
NEXT_PUBLIC_APP_URL=https://ensura.co.il
BETTER_AUTH_URL=https://ensura.co.il
AUTH_TRUSTED_ORIGINS=https://ensura.co.il,https://www.ensura.co.il
ACME_EMAIL=admin@ensura.co.il
```

Webhook URLs:

```text
https://ensura.co.il/api/webhook/whatsapp-intake
https://ensura.co.il/api/webhook/resend
```

Apply database migrations before accepting traffic (not run automatically on container start).

5. Build and start (app + Caddy):

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs --tail=100 caddy
docker compose logs --tail=100 app
```

6. Verify TLS:

```bash
curl -fsSI https://ensura.co.il/
curl -fsSI http://ensura.co.il/   # should 301/308 to https://
echo | openssl s_client -servername ensura.co.il -connect ensura.co.il:443 2>/dev/null | openssl x509 -noout -issuer -dates -subject
docker compose --env-file .env.production exec -T app wget -qO- http://127.0.0.1:3000/api/webhook/whatsapp-intake
```

Update Twilio and Resend consoles to the permanent HTTPS webhook URLs.

## Deploying updates

GitHub Actions on `main` resets `/root/axis-app` to `origin/main`, syncs secrets, and runs:

```bash
docker compose --env-file .env.production up -d --build --remove-orphans --force-recreate
```

Manual:

```bash
cd /root/axis-app
git pull --ff-only
docker compose --env-file .env.production up -d --build
docker compose logs --tail=100 caddy app
```

## Operations

```bash
docker compose logs -f caddy
docker compose logs -f app
docker compose restart caddy
docker compose restart app
```

Certificate data lives in the Docker volume `caddy_data`. Do not delete it unless you intend to re-issue certs.

## Troubleshooting HTTPS

| Symptom | Check |
| --- | --- |
| Browser still shows Not Secure | Confirm you open `https://…`, not `http://…`; hard-refresh |
| Caddy cannot obtain cert | DNS A record, ports 80/443 open, no other process bound to 80 |
| Port already allocated | `ss -tlnp \| grep -E ':80|:443'`; stop old Nginx/host Caddy |
| Mixed content | Ensure `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` are `https://` and rebuild |
| Auth cookies fail after HTTPS | Session cookies become `Secure` when base URL is HTTPS — clear old cookies |

```bash
docker compose --env-file .env.production logs --tail=200 caddy
docker compose --env-file .env.production exec caddy caddy list-modules | head
```
