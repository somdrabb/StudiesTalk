# Tenant Isolation Security

## What is protected

This pass hardens school/workspace isolation for:

- channel lists and channel messages
- message edits, deletes, replies, and reactions
- managed file download, registry access, pin/delete/replace
- homework boards, items, submissions, reviews, and comments
- live session reads, joins, attendance, and slide state
- DMs and DM reactions/replies
- school inbox attachment access

Content access now resolves the owning resource from the database and compares that resource workspace to the authenticated user workspace. Routes no longer rely on a client-provided `workspaceId` alone.

## Shared rules

- Cross-workspace content access returns:

```json
{
  "error": "Forbidden",
  "code": "tenant_forbidden"
}
```

- Super-admin is not treated as an automatic private-content reader.
- File/content denial logs avoid message bodies, file contents, and other school-private payloads.

## Security events

This pass logs safe events for:

- `security.cross_workspace_access_attempt`
- `security.forbidden_channel_access`
- `security.forbidden_file_access`
- `security.super_admin_private_content_denied`

## Remaining risks

- DM workspace is still inferred from participants because the schema does not yet store `dms.workspace_id`.
- Some legacy analytics/search routes still need the same shared tenant assertions.
- Header-driven legacy helper paths should be reduced further in favor of token-derived identity only.
