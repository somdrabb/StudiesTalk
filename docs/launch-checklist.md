# StudiesTalk Launch Checklist

Use this before putting a real customer on the platform.

## Infrastructure

- [ ] VPS provisioned with enough CPU, RAM, and disk.
- [ ] Docker and Docker Compose installed.
- [ ] `.env.production` created from `.env.production.example`.
- [ ] `NODE_ENV=production`.
- [ ] `APP_BASE_URL` uses `https`.
- [ ] `COOKIE_SECURE=true`.
- [ ] Strong JWT secrets generated.
- [ ] `PLATFORM_SECRETS_MASTER_KEY` generated and stored securely.

## Domain And HTTPS

- [ ] Domain DNS points to the VPS.
- [ ] Nginx reverse proxy configured.
- [ ] Let's Encrypt certificate issued.
- [ ] Certificate auto-renewal tested.
- [ ] `/health` returns OK through the public domain.
- [ ] `/health/deep` returns safe data and no secrets.

## Billing

- [ ] Stripe live account ready.
- [ ] Stripe live keys set.
- [ ] Stripe webhook endpoint configured.
- [ ] Stripe webhook secret set.
- [ ] Product and price IDs configured.
- [ ] Test checkout and portal flows completed.

## Email And SMS

- [ ] SMTP/IONOS credentials configured.
- [ ] Sender domain verified.
- [ ] Test email sent.
- [ ] Twilio configured only if SMS is enabled.
- [ ] SMS limits and cost controls reviewed.

## Backups And Restore

- [ ] Backup schedule configured.
- [ ] Backup evidence file is written.
- [ ] Backup verification passed.
- [ ] Restore test passed.
- [ ] Backup retention policy configured.
- [ ] Off-server backup strategy selected for production.

## Security

- [ ] Super admin MFA enforced.
- [ ] Normal admin cross-tenant access blocked.
- [ ] CSRF protection verified.
- [ ] Login rate limits verified.
- [ ] Upload size limits verified.
- [ ] File access isolation verified.
- [ ] Support audit smoke passed.

## Legal And Compliance

- [ ] Impressum reviewed by legal counsel.
- [ ] Privacy policy reviewed.
- [ ] Terms reviewed.
- [ ] DPA/AVV reviewed.
- [ ] Subprocessor list reviewed.
- [ ] VAT/invoice fields reviewed by accountant.
- [ ] Data retention settings confirmed.

## Observability

- [ ] Sentry DSN set.
- [ ] Sentry receives test errors.
- [ ] Docker logs are retained or forwarded.
- [ ] Incident and maintenance evidence works.
- [ ] Operations log summary works.

## Final Commands

```bash
nvm use 20
npm run preflight
npm run test:production-readiness:smoke
npm run test:security:smoke
npm run test:tenant-isolation:smoke
npm run test:support-audit:smoke
```

## Go / No-Go

Do not launch paid SaaS until:

- Stripe live billing is verified.
- Legal documents are reviewed.
- Backups and restore tests are proven.
- Sentry or equivalent monitoring is active.
- Support access visibility is explained to customers.
