# Cost Control / Subscription Control Center

## Purpose

This module gives `super_admin` a platform-wide control surface for:

- provider cost visibility
- workspace-level usage breakdown
- platform default limits
- workspace/provider overrides
- alerting for soft and hard limit thresholds
- CSV export for reporting

It is built to be future-ready for:

- Stripe subscription automation
- plan-aware billing
- provider-specific quotas
- daily/monthly/yearly reporting expansion

## Database model

### `provider_catalog`

Catalog of supported providers and their display metadata.

Seeded providers:

- `openai`
- `twilio`
- `google_translate`
- `ionos_email`
- `storage`
- `jitsi`
- `custom`

### `workspace_provider_limits`

Limit definitions per provider and period.

- `workspace_id = NULL` means platform default
- workspace row overrides platform row
- supports `daily`, `monthly`, `yearly`
- supports soft EUR limit, hard EUR limit, and unit limit

### `usage_ledger`

Structured provider usage ledger.

Tracks:

- workspace
- provider
- feature
- units
- unit name
- unit cost
- total cost
- metadata JSON
- timestamp

### `workspace_subscriptions`

Reserved for plan/subscription management:

- plan key
- status
- monthly price
- Stripe customer/subscription IDs
- billing period boundaries

### `cost_alerts`

Generated alerts for:

- `soft_limit`
- `hard_limit`
- future anomaly detection

## Runtime behavior

### Limit resolution

1. Workspace-specific limit
2. Platform default limit
3. No limit => allow usage

### Enforcement

`enforceProviderLimit({ workspaceId, providerKey, estimatedCostEur })`

If projected usage reaches the configured hard limit, the service throws:

```json
{
  "error": "Provider budget exceeded",
  "providerKey": "openai",
  "used": 1.6,
  "limit": 2,
  "estimatedCostEur": 0.5
}
```

### Alerts

- soft limit: alert is created, request still allowed
- hard limit: alert is created, request is blocked

## Current integrations

### OpenAI

- enforced before realtime session creation
- recorded through:
  - `/api/ai/usage`
  - `/api/ai/runtime/end`

### Google Translate

- enforced before translation execution
- recorded after successful translation

### IONOS Email

- recorded after workspace test-email send

### Storage

- recorded on file upload using stored object size

## Admin API

Super-admin only routes:

- `GET /api/admin/cost-control/overview?period=monthly`
- `GET /api/admin/cost-control/workspaces/:workspaceId/summary?period=monthly`
- `GET /api/admin/cost-control/providers/:providerKey/summary?period=monthly`
- `GET /api/admin/cost-control/limits?workspaceId=&providerKey=`
- `POST /api/admin/cost-control/limits`
- `DELETE /api/admin/cost-control/limits/:id`
- `GET /api/admin/cost-control/alerts`
- `POST /api/admin/cost-control/alerts/:id/acknowledge`
- `GET /api/admin/cost-control/export.csv?period=monthly`

## Admin dashboard behavior

The `Cost Control` tab shows:

1. Platform overview
2. Provider breakdown
3. Workspace breakdown
4. Limits editor
5. Alerts list
6. CSV export

The dashboard uses the selected reporting period from the panel header.

## Smoke coverage

`npm run test:cost-control:smoke`

Covers:

- provider catalog seeding
- global and workspace limit behavior
- daily/monthly/yearly summary correctness
- soft alert creation
- hard limit blocking
- super-admin access requirement
- normal admin denial
- CSV export
