# Security Smoke

## What It Checks

`scripts/security-smoke.js` runs fully local against:
- a temp SQLite database in the OS temp directory
- a temp upload directory in the OS temp directory
- the local Node server only

Current smoke coverage:
- login still works for seeded users
- onboarding gate still blocks an incomplete school admin
- policy gate still blocks a completed-but-unaccepted school admin
- unsafe mutation without CSRF is rejected
- the same authenticated mutation with a valid CSRF token succeeds
- super admin remains exempt from onboarding/policy gates where expected
- dangerous upload (`.html`) is rejected
- forgot-password rate limiting still returns `429`
- logout succeeds and the session becomes unusable
- security events are written for CSRF rejection, rejected upload, and login rate limiting

## Local Safety

- No external services are required.
- Email is disabled during the smoke run.
- Temp DB and temp upload files are deleted at the end of the run.

## Commands

Run:

```sh
npm run test:security:smoke
```

Requested companion checks:

```sh
npm run test:onboarding:smoke
npm run test:policy:smoke
```
