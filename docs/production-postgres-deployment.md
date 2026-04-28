# StudiesTalk Production PostgreSQL Deployment

StudiesTalk local development uses Node 20 and SQLite. Production deployment should use PostgreSQL, HTTPS, strong secrets, and a reviewed file-storage strategy.

## Recommended path

Recommended first production path:

- Hetzner VPS
- Docker Compose
- PostgreSQL on the same host initially
- Nginx reverse proxy with HTTPS

For paid production, review object storage before customer uploads become significant.

## Environment checklist

Before deployment, fill these values in `.env`:

- `NODE_ENV=production`
- `PORT=3000`
- `APP_BASE_URL=https://app.yourdomain.com`
- `COOKIE_SECURE=true`
- `DB_ENGINE=postgres`
- `DATABASE_URL=postgres://user:password@host:5432/studiestalk`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FILE_STORAGE_ADAPTER`
- `UPLOADS_DIR`
- `JITSI_DOMAIN`
- `JITSI_APP_ID`
- `JITSI_APP_SECRET`

Do not commit real `.env` values.

## Docker Compose production setup

```bash
git clone https://github.com/somdrabb/StudiesTalk.git
cd StudiesTalk
cp .env.staging.example .env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npm run db:migrate:pg
docker compose -f docker-compose.prod.yml logs -f app
```

## Migration command

Run PostgreSQL migrations after the containers are up:

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:migrate:pg
```

The migration runner:

- reads `DATABASE_URL`
- applies SQL files in `db/schema/pg` in order
- records applied files in `schema_migrations`
- skips already applied migrations

## Nginx + HTTPS

Place Nginx in front of the app container and terminate TLS there.

Minimum requirements:

- redirect HTTP to HTTPS
- proxy to `http://127.0.0.1:3000`
- pass `X-Forwarded-Proto https`
- keep websocket upgrade support if you add reverse-proxied realtime endpoints later

## PM2 alternative

If you are not using Docker:

```bash
source ~/.nvm/nvm.sh
nvm use 20
npm ci
cp .env.staging.example .env
npm run preflight
npm run db:migrate:pg
pm2 start server.js --name studiestalk
pm2 save
```

This path still requires PostgreSQL and HTTPS.

## Deployment sequence

1. Provision VPS
2. Install Docker, Docker Compose plugin, and Nginx
3. Point DNS at the host
4. Configure HTTPS certificate
5. Copy `.env`
6. Run `npm run preflight` locally against the intended env values
7. Start containers
8. Run PostgreSQL migrations
9. Check `GET /health`
10. Review logs and legal/public pages

## Operational note

StudiesTalk still carries SQLite-oriented legacy code paths in `server.js`. The PostgreSQL migration layer and production env contract are now ready, but the final runtime cutover should still be validated against your exact production traffic before paid launch.
