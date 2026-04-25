# Super-Admin Privacy Boundary

## Default rule

`super_admin` can manage platform-level operations such as:

- school approval and workspace lifecycle
- platform settings
- billing and operational administration
- security overview and platform audit tooling

`super_admin` does **not** automatically receive read access to school-private content such as:

- channel messages and replies
- DMs and private staff/student threads
- managed school files
- homework submissions and comments
- live-session classroom content
- school mailbox attachments and private inbox content

## Current behavior

Private-content routes now deny super-admin by default and return:

```json
{
  "error": "Forbidden",
  "code": "tenant_forbidden"
}
```

Denied attempts log `security.super_admin_private_content_denied` without logging message/file contents.

## Future support-access design

This pass does not implement support-mode access. If future school support access is required, it should be explicit and time-bound:

1. Create a support session tied to a specific workspace.
2. Record operator identity, reason, and requested scope.
3. Require an expiry time.
4. Emit a durable audit trail for start, use, and end.
5. Keep support access off by default.

## Remaining gaps

- No support-session model exists yet.
- Some non-content platform admin routes still need a stricter separation between platform management and school-scoped operational data.
