# Support Audit and Customer Trust

This document describes the StudiesTalk support audit layer for enterprise customers.

## Support mode behavior

- Support sessions are started by `super_admin` users only.
- Super admin MFA must be verified before support routes are available.
- A reason of at least 10 characters is required.
- Sessions default to 30 minutes and are read-only.
- Mutating API requests are blocked while a support session is active, except ending the session.
- Expired sessions are auto-ended when the next API request checks support context.

## Evidence files

Operational evidence is written under `storage/ops` by default, or `OPS_EVIDENCE_DIR` when configured:

- `support-sessions.jsonl`
- `support-access-events.jsonl`

Session evidence includes actor, role, workspace, reason, start/end/expiry timestamps, read-only mode, IP, and user agent.

Access evidence includes session id, actor, workspace, resource type, resource id, action, and timestamp.

## Customer visibility

School admins can call:

```text
GET /api/workspace/support-access-log
```

The response contains the last 30 days of support sessions and access events for their own workspace only.

## Admin audit export

Super admins can export support audit evidence:

```text
GET /api/admin/support/audit/export
GET /api/admin/support/audit/export?format=csv
```

Use this export for enterprise customer reviews, SOC2-style evidence collection, and incident review.

## Logged resource types

Support mode access logging covers:

- users
- messages
- DMs
- files
- billing
- AI conversations

Additional domain endpoints should call `logSupportAccessIfActive` when they return customer records during support mode.

## Limitations

- This is technical audit evidence, not a compliance certification.
- Support access remains tied to the existing tenant isolation and authentication model.
- The platform owner must define internal policies for support approvals, ticket references, and retention.
