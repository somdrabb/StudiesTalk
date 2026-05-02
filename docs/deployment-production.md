# StudiesTalk Production Deployment

This guide describes a VPS deployment using Docker Compose, PostgreSQL, Nginx, and Let's Encrypt.

## Prerequisites

- Ubuntu 22.04 or newer VPS.
- Domain DNS access.
- Docker and Docker Compose plugin installed.
- Node 20 for local smoke tests.

Run local checks before deploying:

```bash
nvm use 20
npm run preflight
npm run test:production-readiness:smoke
```

## Prepare Environment

Copy the production example and fill real values:

```bash
cp .env.production.example .env.production
```

Required production values:

- `APP_BASE_URL=https://your-domain.example`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PLATFORM_SECRETS_MASTER_KEY`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLIC_KEY`
- SMTP/IONOS credentials
- `SENTRY_DSN` for error monitoring

Never commit `.env.production`.

## Docker Deploy

Build and start:

```bash
docker compose --env-file .env.production up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f app
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/health/deep
```

The compose file exposes the app on host port `3000` and runs PostgreSQL as a local service.

## Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt update
sudo apt install nginx
```

Example site config:

```nginx
server {
  server_name app.example.com;

  client_max_body_size 250M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/studiestalk /etc/nginx/sites-enabled/studiestalk
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS With Let's Encrypt

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.example.com
```

After HTTPS is active:

- Set `APP_BASE_URL=https://app.example.com`.
- Set `COOKIE_SECURE=true`.
- Restart the stack.

```bash
docker compose --env-file .env.production up -d
```

## Sentry

Set:

```text
SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
```

If `SENTRY_DSN` is empty, the app still runs. When configured, runtime exceptions, unhandled rejections, and 5xx request failures are captured.

## Logs

Docker should be the primary log collector:

```bash
docker compose logs -f app
```

StudiesTalk also writes operational evidence under:

```text
storage/ops
```

Mount this path on persistent storage in production.

## Health Checks

Use:

```text
GET /health
GET /health/deep
```

`/health/deep` returns safe operational status only. It must not expose provider secrets.

## Backups

Run:

```bash
npm run backup:sqlite
npm run verify:backup
npm run restore:test
```

For PostgreSQL production, configure provider-level database snapshots until a dedicated PostgreSQL backup job is added.

## Deployment Flow

1. Pull latest code.
2. Update `.env.production`.
3. Run `docker compose --env-file .env.production up -d --build`.
4. Run health checks.
5. Run a login smoke with a super admin.
6. Check Sentry for startup errors.
7. Confirm backup and restore-test evidence.
