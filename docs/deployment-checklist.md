# StudiesTalk Deployment Checklist

## Before first production launch

- Fill real `.env` values
- Set `NODE_ENV=production`
- Set `DB_ENGINE=postgres`
- Set `DATABASE_URL`
- Set `APP_BASE_URL` to the real HTTPS domain
- Set `COOKIE_SECURE=true`
- Replace JWT placeholder secrets
- Review file storage strategy
- Review Jitsi deployment mode
- Run `npm run preflight`
- Run `npm run db:migrate:pg`
- Check `/health`

## Legal / compliance

- Fill real Impressum details
- Publish Privacy
- Publish Terms
- Publish Impressum
- Publish DPA
- Publish Cookie Policy
- Review Trust page text
- Complete lawyer review before commercial launch

## Data / operations

- Confirm PostgreSQL backups
- Confirm uploads backup path
- Run a restore test
- Rotate secrets before go-live
- Review admin/super-admin accounts

## Security verification

Run the security hardening checks with Node 20 before hosting:

```bash
nvm use 20
npm run preflight
npm run test:security:smoke
npm run test:tenant-isolation:smoke
```

## Launch decision

Do not call the platform production-ready until:

- preflight is clean enough for the target environment
- migrations are applied
- health checks pass
- backups exist and restore has been tested
- legal text has been reviewed
