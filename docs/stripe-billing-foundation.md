# Stripe Billing Foundation

StudiesTalk uses a provider-based billing boundary so existing manual invoices and payments continue to work while Stripe subscriptions can be enabled later.

## Provider

Current provider:

```text
stripe
```

Future providers such as PayPal or Mollie should be added as separate services rather than changing the manual invoice flow.

## Environment

Required before real Stripe use:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_CHECKOUT_SUCCESS_URL=https://your-domain/admin?tab=billing&stripe=success
STRIPE_CHECKOUT_CANCEL_URL=https://your-domain/admin?tab=billing&stripe=cancelled
```

Optional:

```env
STRIPE_DEFAULT_CURRENCY=eur
```

Never expose `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` to the browser.

## Endpoints

Admin:

```text
GET  /api/admin/billing/stripe/status
POST /api/admin/billing/stripe/workspaces/:workspaceId/checkout-session
POST /api/admin/billing/stripe/workspaces/:workspaceId/portal-session
```

Workspace checkout:

```text
POST /api/billing/create-checkout-session
GET  /api/billing/customer-portal
```

The checkout route requires an authenticated user, derives `workspaceId` from the verified JWT/session, verifies the workspace exists, creates/reuses the Stripe customer, maps `plan` to the configured Stripe price, and returns only `session.url`.

## Workspace Enforcement

Backend billing enforcement checks workspace billing status on authenticated workspace API traffic:

```text
active   -> allow
trialing -> allow
past_due -> allow with billing warning headers
canceled -> block non-admin users with 402
```

Workspace admins and platform admins can still access enough backend surface to manage billing and recover the account.

Webhook:

```text
POST /api/billing/webhook
```

The webhook uses the raw request body and verifies Stripe signatures with `STRIPE_WEBHOOK_SECRET`. The legacy `/api/billing/stripe/webhook` path is kept as an alias, but new Stripe dashboard configuration should use `/api/billing/webhook`.

Handled events:

```text
checkout.session.completed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
customer.subscription.deleted
customer.subscription.updated
```

## Data Model

Existing tables are preserved:

```text
workspace_billing
invoices
payments
```

Stripe adds provider state to `workspace_billing`:

```text
provider
provider_customer_id
provider_subscription_id
status
current_period_end
stripe_customer_id
stripe_subscription_id
stripe_price_id
stripe_subscription_status
```

The `provider_*` columns are the provider-neutral production fields. The `stripe_*` columns are retained for compatibility and debugging during the Stripe rollout.

Stripe adds provider references to existing records:

```text
invoices.provider
invoices.provider_invoice_id
payments.provider
payments.provider_payment_intent_id
```

Stripe provider events are recorded in:

```text
billing_provider_events
```

Stripe invoice payments are written into the existing `invoices` and `payments` tables with `provider = 'stripe'`.

## Verification

Run with Node 20:

```bash
nvm use 20
npm run preflight
npm run test:stripe-billing:smoke
```
