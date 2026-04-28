# StudiesTalk Legal / Compliance Settings

These templates are operational/legal-product templates and must be reviewed by a qualified legal professional before commercial launch.

## What Super Admin must fill before launch

Complete these fields in the `Legal / Compliance` admin tab before publishing:

- Company name
- Operator name
- Full legal address
- Legal email
- Phone and VAT data where applicable
- Responsible person
- Supervisory authority
- Provider list: hosting, video, AI, email, SMS, storage, analytics
- Retention windows for recordings, security logs, backups, and learning data
- Liability, SLA, GDPR DPA, AI notice, recording notice, and cookie notice text

## Required documents before publish

Publishing legal settings is blocked until these are available and published:

- Privacy Policy
- Terms
- Impressum
- Data Processing Agreement (DPA)
- Cookie Policy

The Trust / Security page is generated from published legal settings and does not have its own version record.

## How to publish legal pages

1. Open `/admin`
2. Go to `Legal / Compliance`
3. Save the platform legal settings draft
4. Save each legal document version
5. Publish the required document versions
6. Publish legal settings

Public pages then read from:

- `/api/public/legal-settings`
- `/api/public/legal/privacy`
- `/api/public/legal/terms`
- `/api/public/legal/impressum`
- `/api/public/legal/dpa`

Static public pages:

- `/privacy`
- `/terms`
- `/impressum`
- `/dpa`
- `/trust`

## Versioning model

- `platform_legal_settings` stores the platform-level published settings state
- `platform_legal_versions` stores per-document drafts and published versions
- Only one active version per `document_type + locale` is published at a time
- Publishing a new version deactivates the previous active version for that document and locale
- Supported legal documents are `privacy`, `terms`, `impressum`, `cookies`, and `dpa`

## DPA publishing instructions

1. Open `/admin`
2. Go to `Legal / Compliance`
3. Complete processor fields and GDPR DPA text blocks
4. Save the `DPA` document card with locale, version, title, and body
5. Publish the DPA document
6. Publish legal settings after all required documents are active

The DPA page should explain controller/processor roles, data categories, purposes, sub-processors, TOMs, incident notification placeholder language, deletion/return handling, and SCC/international transfer placeholders.

## Cookie consent behavior

- Local storage key: `studiestalk_cookie_consent_v1`
- Stored value shape:
  - `version`
  - `necessary`
  - `analytics`
  - `acceptedAt`
  - `updatedAt`
- Necessary cookies are always enabled
- Analytics stays disabled by default unless the user opts in
- `window.StudiesTalkCookieConsent.open()` opens the management modal
- No external analytics or trackers are added by this template

## Trust page purpose

- `/trust` is a public security overview generated from published legal settings
- It is meant for customer diligence and launch readiness communication
- It must not claim ISO, SOC 2, TÜV, or any certification unless actually held

## User acceptance tracking

Acceptance is stored in `legal_acceptances` with:

- `user_id`
- `workspace_id`
- `document_type`
- `version`
- `accepted_at`
- `ip_address`
- `user_agent`

Runtime endpoints:

- `GET /api/legal/required-acceptance`
- `POST /api/legal/:documentType/accept`

## Still requires lawyer review

- DPA text and annex wording
- Liability language
- SLA commitments
- Cookie compliance wording
- Cross-border transfer wording
- Country-specific supervisory authority references
- Final commercial terms and venue/governing law wording

## Launch checklist

- Fill real Impressum/controller details
- Publish Privacy, Terms, Impressum, DPA, and Cookie Policy
- Configure all real providers/processors
- Rotate secrets and confirm backup handling
- Verify retention values and recording controls
- Review international transfer language and processor contracts
- Complete lawyer review before commercial launch
