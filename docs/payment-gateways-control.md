# Payment Gateways Control

The Platform Owner dashboard includes a Super Admin page named **Payment Gateways** for configuring Stripe, PayPal, Mollie, and future payment providers.

## Access Rules

- Super admin only.
- Super admin MFA must be verified.
- Mutating requests require CSRF.
- Raw secrets are never returned to the browser.
- Rotate, delete, disable, live-mode switch, and active-provider changes require confirmation in the admin UI.
- Real keys must never be committed to git.

## Stored Provider Keys

Stripe:

- `STRIPE_PUBLIC_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_ENTERPRISE`

PayPal:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_MODE`

Mollie:

- `MOLLIE_API_KEY`
- `MOLLIE_WEBHOOK_SECRET`
- `MOLLIE_PROFILE_ID`

Generic:

- `PAYMENT_ACTIVE_PROVIDER`
- `PAYMENT_ENVIRONMENT`

Secrets are stored through the existing platform secrets service when `PLATFORM_SECRETS_MASTER_KEY` is configured. Environment variables remain as fallback values, but they are only shown as masked status.

## Configure Stripe

1. Create a Stripe account.
2. Create test and live API keys in Stripe Dashboard.
3. Create products/prices for Starter, Pro, and Enterprise.
4. Open Admin Dashboard -> Payment Gateways -> Stripe.
5. Enable Stripe, select `test` first, enter the publishable key, secret key, webhook secret, and price IDs.
6. Save, then use **Test connection**.
7. Switch to `live` only after webhook verification and checkout testing are complete.

## Configure PayPal

1. Create a PayPal developer application.
2. Copy client ID, client secret, webhook ID, and mode.
3. Open Admin Dashboard -> Payment Gateways -> PayPal.
4. Enable PayPal and save the values.
5. Use **Test connection** to validate that required config exists.

PayPal checkout is not implemented in this step.

## Configure Mollie

1. Create a Mollie account and profile.
2. Copy API key, webhook secret, and profile ID.
3. Open Admin Dashboard -> Payment Gateways -> Mollie.
4. Enable Mollie and save the values.
5. Use **Test connection** to validate that required config exists.

Mollie checkout is not implemented in this step.

## Rotation

Use **Rotate** next to a secret key to replace the stored encrypted value. Rotation writes a platform gateway event and a platform secret audit entry. The new raw value is discarded after the request and only a masked value is returned.

## Delete

Use **Delete** next to a configured key to remove the database-stored secret. If the same key exists in the environment, the env fallback can still be used at runtime and may still show as configured.

## Webhook Health

The Webhooks tab shows configured/not configured/not tested status for Stripe, PayPal, and Mollie. Full checkout and webhook processing will be implemented in the billing step, so this page currently focuses on secret readiness and event evidence.

## Evidence

Provider changes are written to `payment_gateway_events` without raw secrets. The UI shows recent save, rotate, delete, test, active-provider, and webhook-related events.

Run:

```bash
nvm use 20
npm run preflight
npm run test:payment-gateways:smoke
```
