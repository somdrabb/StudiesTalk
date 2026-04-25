# Policy Acceptance Write Flow

## Accept

1. Client loads `GET /api/workspaces/:workspaceId/policy`
2. User checks the acknowledgement box
3. Client posts `POST /api/workspaces/:workspaceId/policy/accept`
4. Server resolves the current workspace version
5. Server rejects stale versions with `policy_version_mismatch`
6. Server upserts `policy_acceptances` for `(user_id, workspace_id, version)`
7. Server returns the updated `policyGate`
8. Client hydrates the workspace and continues to the main experience

## Logout

- The checkpoint logout button calls `POST /api/auth/logout`
- The SPA then reloads to the signed-out state

## Idempotency

- Same user/workspace/version accepts safely update `accepted_at`
- Duplicate acceptance does not create broken state because of the unique key
