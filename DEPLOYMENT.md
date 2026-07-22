# ENSURA VPS deployment checklist

The Next.js app runs in Docker behind **Caddy**, which terminates TLS (Let's Encrypt)
and reverse-proxies to the app on the internal Docker network.

## Architecture

```text
Internet → :80/:443 (Caddy) → app:3000 (Next.js)
                ↑
         auto HTTPS + HTTP→HTTPS redirect
```

## First deployment

1. Point DNS `A` (and optional `AAAA`) for `ensura.co.il` and `www.ensura.co.il` to the VPS.
2. Install Docker Engine and the Docker Compose plugin.
3. Open firewall ports used by ACME + HTTPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

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
