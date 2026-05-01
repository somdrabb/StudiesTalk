# Stripe Billing

This document covers the StudiesTalk Stripe subscription foundation. It does not add PayPal or Mollie.

## Create Stripe Account

1. Create a Stripe account at `https://dashboard.stripe.com/register`.
2. Complete business verification before live payments.
3. Use test mode first. Only switch to live keys after webhook and billing smoke tests pass.

## Products And Prices

Create one recurring product price for each StudiesTalk plan:

```text
Starter
Pro
Enterprise
```

In the Stripe dashboard:

1. Go to Product catalog.
2. Create a product.
3. Add a recurring monthly price.
4. Copy each `price_...` id into the env file.

Required env:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

Do not commit real keys.

## Webhook

Configure the Stripe webhook endpoint:

```text
POST https://your-domain.example.com/api/billing/webhook
```

Events to send:

```text
checkout.session.completed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
```

The webhook route has no app auth by design, but it requires Stripe signature verification with `STRIPE_WEBHOOK_SECRET`. Unverified webhooks are rejected.

## Local Testing With Stripe CLI

Install and login:

```bash
stripe login
```

Forward webhooks to the local app:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the displayed `whsec_...` value into:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Trigger test events:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

For full end-to-end checkout, create real test mode Products/Prices and use the app checkout endpoint while logged in.

## Smoke Tests

Run with Node 20:

```bash
nvm use 20
npm run preflight
npm run test:billing:smoke
npm run test:stripe-billing:smoke
```

`billing-smoke` uses a mocked Stripe client and does not call Stripe. It verifies checkout creation, mocked webhook handling, billing record updates, Stripe payment recording, and workspace status changes.

## Example Curl

Authenticated checkout:

```bash
curl -X POST http://localhost:3000/api/billing/create-checkout-session \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_ACCESS_COOKIE; csrf_token=YOUR_CSRF_COOKIE" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"plan":"starter"}'
```

Authenticated customer portal:

```bash
curl http://localhost:3000/api/billing/customer-portal \
  -H "Cookie: access_token=YOUR_ACCESS_COOKIE"
```

Webhook testing should use Stripe CLI because it signs the payload:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
stripe trigger invoice.paid
```

## Current Limitations

- PayPal and Mollie are intentionally not implemented.
- Real checkout requires valid Stripe test/live price IDs.
- The webhook relies on Stripe metadata/customer mapping to find the workspace.
- Failed Stripe invoices are stored as open invoices because the existing invoice status constraint supports `open`, `paid`, and `void`.
