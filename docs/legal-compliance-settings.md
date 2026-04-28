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

Cookie Policy and DPA can also be versioned and published from the same panel.

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

## Versioning model

- `platform_legal_settings` stores the platform-level published settings state
- `platform_legal_versions` stores per-document drafts and published versions
- Only one active version per `document_type + locale` is published at a time
- Publishing a new version deactivates the previous active version for that document and locale

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

- Liability language
- SLA commitments
- DPA wording
- Cookie compliance wording
- Cross-border transfer wording
- Country-specific supervisory authority references
- Final commercial terms and venue/governing law wording
