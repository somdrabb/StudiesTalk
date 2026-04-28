# Secrets / Integrations Management

StudiesTalk supports encrypted platform-managed provider credentials for super admins. Critical bootstrap secrets stay outside the database.

## Env-only bootstrap secrets

These must remain in `.env` or your host secret manager:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PLATFORM_SECRETS_MASTER_KEY`
- `COOKIE_SECURE`
- `APP_BASE_URL`

## Admin-managed provider groups

These can be rotated from the admin dashboard under `Secrets / Integrations`:

- OpenAI
- Twilio SMS
- Email / SMTP
- Google Cloud Translate
- Jitsi / JaaS
- Storage S3 / R2
- Optional analytics keys

Runtime resolution is:

1. database-managed secret, if present and enabled
2. env fallback

If no DB secret exists, current behavior stays unchanged.

## Encryption model

- table: `platform_secrets`
- audit table: `platform_secret_audit`
- algorithm: `AES-256-GCM`
- key source: `PLATFORM_SECRETS_MASTER_KEY`

Stored rows contain:

- encrypted value
- IV
- auth tag
- masked display value
- value hash
- rotation / test metadata

Raw secret values are never returned by admin APIs.

## Operational warnings

- If `PLATFORM_SECRETS_MASTER_KEY` is missing, DB secret writes are disabled.
- GET APIs still return masked state and env fallback visibility.
- Changing `PLATFORM_SECRETS_MASTER_KEY` without re-encrypting existing rows makes stored secrets unreadable.

## Rotation workflow

1. Open `Admin -> Secrets / Integrations`
2. Enter a new value for the target field
3. Use `Rotate` for secret fields or `Save changes` for grouped updates
4. Run `Test connection`
5. Confirm:
   - `last tested`
   - `last rotated`
   - masked value only

Recommended rotation targets:

- OpenAI: `OPENAI_API_KEY`
- Twilio: `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- SMTP: `IONOS_SMTP_PASS`
- Jitsi: `JITSI_APP_SECRET`
- Storage: `S3_SECRET_ACCESS_KEY`

## Emergency procedure

If a provider secret leaks:

1. rotate the provider credential immediately at the vendor
2. update StudiesTalk in `Secrets / Integrations`
3. test the provider connection
4. review `platform_secret_audit`
5. inspect broader admin audit logs for related access

If `PLATFORM_SECRETS_MASTER_KEY` leaks:

1. treat all DB-managed secrets as compromised
2. rotate the master key in your host secret manager
3. rotate all provider credentials
4. re-save every DB-managed secret so rows are re-encrypted under the new key

## API security notes

- only `super_admin` may read or modify secrets routes
- secret APIs never return raw values
- secret values are not logged
- audit rows capture action, actor, IP, user-agent, and timestamp
