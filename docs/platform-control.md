# Platform Control

`Platform Control` is the super-admin policy layer for StudiesTalk. It manages platform-wide defaults and workspace-level overrides for operational behavior, limits, feature access, and subscription policy.

## Architecture

Platform Control stores structured JSON in `platform_settings` and resolves settings in this order:

1. global platform settings
2. workspace override
3. effective merged result

Secrets do not belong here. Provider credentials remain in `Secrets / Integrations` and bootstrap secrets remain in `.env` or the host secret manager.

## Global vs Workspace Overrides

- `scope='global'` and `workspace_id IS NULL`
  - platform owner defaults
- `scope='workspace'` and `workspace_id = <workspace id>`
  - workspace-specific override

Workspace overrides are deep-merged on top of global settings. Overrides should contain only the keys that differ from global policy.

## What Belongs Here

- workspace defaults
- feature flags
- cost and budget governance
- provider usage limits
- AI runtime policy
- communication limits and fallback behavior
- storage rules
- security rules
- subscription plan defaults and plan bundles

## What Must Stay In `.env`

These are bootstrap or host-level secrets and must not move into Platform Control:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PLATFORM_SECRETS_MASTER_KEY`
- `COOKIE_SECURE`
- `APP_BASE_URL`

## What Belongs In Secrets / Integrations

Provider credentials and rotatable secrets stay in the encrypted secrets system:

- OpenAI keys
- Twilio credentials
- SMTP credentials
- Google credentials
- Jitsi credentials
- S3/R2 credentials

Platform Control may enable, disable, or limit providers, but it does not store their secrets.

## Advanced JSON Mode

The admin UI keeps an `Advanced JSON` mode for emergency editing and developer operations. It reads and writes the same structured settings object as the form cards.

## Future Stripe Plan

Platform Control is designed to support a future billing layer:

- Stripe-backed plan definitions
- per-workspace subscription assignment
- automatic suspension rules
- invoicing and payment failure policy
- cost governance tied to subscription entitlements

That future billing layer should read from Platform Control for defaults and plan metadata, while Stripe remains the payment processor and source of payment state.
