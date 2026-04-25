# Account Security Hardening

## Scope

This pass hardens registration identity matching and password storage without breaking existing login behavior for legacy users.

## Duplicate matching rules

Registration invite creation and invite completion now normalize and check existing users in the same workspace by:

- `email`: trimmed and lowercased
- `phone`: normalized to an E.164-like `+<country><national>` form where possible
- `date_of_birth`: normalized to `YYYY-MM-DD`

If a conflict is found, the API returns:

```json
{
  "error": "An account already exists for this user.",
  "code": "account_already_exists",
  "actions": ["login", "forgot_password"]
}
```

The response does not reveal which field matched.

## Password hashing

- New passwords use `argon2id` when the `argon2` package is available.
- If `argon2` is unavailable at runtime, password hashing falls back to the existing PBKDF2 format.
- Login verification supports:
  - `argon2id`
  - legacy `bcrypt`
  - legacy PBKDF2 `salt:hash`

This keeps existing users and old reset flows working while moving newly written passwords to a stronger default.

## Password policy

New password writes reject:

- passwords shorter than 10 characters
- passwords that use fewer than 3 of: uppercase, lowercase, number, symbol
- a small denylist of common weak passwords
- fully repetitive passwords

Weak password rejections are logged as security events without storing the submitted password.

## Database constraints

### SQLite runtime

Startup now ensures lookup indexes for:

- `users(workspace_id, lower(email))`
- `users(workspace_id, phone)`
- `users(workspace_id, date_of_birth)`

SQLite unique indexes are created only when the current table data is already clean:

- unique workspace email on `lower(email)`
- unique workspace phone on `phone`

If legacy duplicates already exist, the app logs a warning and skips the unique index instead of failing startup.

### PostgreSQL direction

PostgreSQL schema already enforces unique workspace email by `lower(email::text)`.

Workspace phone uniqueness remains deferred until migrated phone data is normalized and duplicate-cleaned across imported records.

## Legacy duplicate cleanup

Before enabling stricter uniqueness everywhere, audit and merge existing duplicates by workspace:

- same lowercased email
- same normalized phone
- suspicious repeated DOB collisions that should be reviewed manually

Recommended cleanup order:

1. Export duplicate groups from SQLite or PostgreSQL by workspace.
2. Merge or deactivate obsolete user rows.
3. Normalize stored phone values into the canonical `phone` column.
4. Re-run startup and confirm the skipped unique-index warnings disappear.

## Security events

This pass adds or expands safe logging for:

- `security.duplicate_registration_attempt`
- `security.weak_password_rejected`
- `auth.password_reset_requested`
- `auth.password_reset_completed`

No passwords, reset tokens, or plaintext secrets are logged.
