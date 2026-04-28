# StudiesTalk Legal Pages

This project now includes production-oriented legal page templates for a Germany/EU school SaaS deployment:

- `/privacy`
- `/terms`
- `/impressum`

## Files

- `public/legal/privacy.html`
- `public/legal/terms.html`
- `public/legal/impressum.html`
- `public/legal/legal.css`
- `public/legal/cookie-consent.js`

## Required placeholders before public launch

Fill these items before public or commercial release:

- Controller name and full legal address
- Privacy and legal contact email
- Phone number if used in Impressum
- VAT / Umsatzsteuer-ID if applicable
- Hosting provider
- Video provider
- AI provider
- Email provider
- Optional SMS provider
- Object storage provider
- Supervisory authority details if you want to name a primary authority
- Recording retention policy
- Security log retention period
- Backup retention period
- Availability / SLA wording
- Governing law / venue wording
- Liability and warranty wording reviewed by counsel

## Cookie notice behavior

The cookie banner:

- stores the choice in `localStorage`
- distinguishes between `necessary` and `all`
- does not block necessary authentication cookies
- links to `/privacy`
- does not introduce analytics or third-party tracking

## Verification

Run:

```bash
node --check public/legal/cookie-consent.js
node --check server.js
npm run preflight
npm run test:security:smoke
```
