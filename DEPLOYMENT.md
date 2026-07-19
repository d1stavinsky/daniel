# AXIS VPS deployment checklist

The container runs the persistent Next.js production server. Twilio and Resend webhooks are normal
HTTP requests handled by that process; Compose restarts it automatically and allows 30 seconds for
graceful shutdown.

## First deployment

1. Point the domain's DNS `A` record to the DigitalOcean VPS.
2. Install Docker Engine and the Docker Compose plugin on the server.
3. Clone and configure the application:

```bash
git clone <repository-url> axis-partner-dashboard
cd axis-partner-dashboard
cp .env.example .env.production
chmod 600 .env.production
nano .env.production
```

Set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the public HTTPS origin. Set
`WHATSAPP_WEBHOOK_PUBLIC_URL` to:

```text
https://<your-domain>/api/webhook/whatsapp-intake
```

Configure the Resend inbound webhook as:

```text
https://<your-domain>/api/webhook/resend
```

Apply the repository's database migrations to the production database before accepting traffic.
Migrations are intentionally not run automatically when the container starts.

4. Validate, build, and start:

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production build --pull
docker compose --env-file .env.production up -d
docker compose ps
docker compose logs --tail=100 app
```

5. Configure Caddy or Nginx to terminate HTTPS and proxy the domain to `127.0.0.1:3000`. Do not
expose port 3000 publicly.
6. Verify:

```bash
curl -fsS http://127.0.0.1:3000/api/webhook/whatsapp-intake
docker inspect --format='{{.State.Health.Status}}' axis-partner-dashboard
```

Finally, update the Twilio and Resend consoles with the permanent HTTPS URLs and send one test
message/email.

## Deploying updates

```bash
cd axis-partner-dashboard
git pull --ff-only
docker compose --env-file .env.production up -d --build
docker compose logs --tail=100 app
```

## Operations

```bash
docker compose logs -f app
docker compose restart app
docker compose down
```

Use an external cron or DigitalOcean scheduled job for `/api/cron/scan-stuck`; webhooks themselves
do not need a separate worker.
