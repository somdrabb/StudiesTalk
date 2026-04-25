# Onboarding Idempotency

## Routes Hardened For Safe Retry
- `POST /api/users`
- `POST /api/channels`
- `POST /api/live-sessions`
- `POST /api/homework/channels/:channelId/items`
- `POST /api/class-memberships` was already idempotent through `INSERT OR IGNORE`.

## Mechanism
- Optional request-level replay protection is supported through:
  - `x-idempotency-key`
  - `body.idempotencyKey`
  - `body.onboardingRequestKey`
- When a key is present, the server looks for an already-created matching object in the same workspace and returns it instead of creating another one.

## Matching Rules
- User creation: same workspace, same email, same role.
- Channel creation: same workspace, same name, same category.
- Live session creation: same workspace, same channel, same title/date/start/end, same creator.
- Homework creation: same workspace, same class channel, same title/due date, same creator.

## Limits
- This is shape-based replay protection, not a persistent generic idempotency ledger.
- Legitimate repeated creation with different payloads is still allowed.
- Future enhancement: persistent keyed idempotency records for broader multi-tab and crash-recovery guarantees.
