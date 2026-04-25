# Onboarding School Profile Inventory

This inventory reflects the current StudiesTalk data already available to onboarding from existing workspace, profile, onboarding, email-settings, billing, and user sources.

## Already Available

- School / workspace name
  Source: `workspaces.name`, onboarding metrics `schoolName`
- Workspace slug / id
  Source: `workspaces.id`
- School code
  Source: `workspaces.school_code` when populated
- Registered school email
  Source: `workspaces.admin_email`
- School admin identity
  Source: first `school_admin` user in `users`, plus current authenticated admin in the SPA
- Admin joined date
  Source: `users.created_at`
- Signature / reply-to email
  Source: `workspace_email_settings.reply_to_email`, with workspace admin email fallback
- Sender identity readiness
  Source: `workspace_email_settings.brand_school_name`, `signature_html`, `subject_prefix`, `enabled`
- Phone
  Source: `workspace_profile.phone`
- Address fields
  Source: `workspace_profile.street`, `house_number`, `postal_code`, `city`, `state`, `country`
- Website
  Source: `workspace_profile.website`
- Opening hours summary
  Source: `workspace_profile.opening_hours_json`
- Opening hours day breakdown
  Source: `workspace_profile.opening_hours_json.details.days` / `days`
- Timezone
  Source: `workspace_settings_admin.settings_json` and `opening_hours_json`
- Local time
  Derived in the SPA from the stored timezone
- Company / registration details
  Source: `workspace_profile.registration_details`
- Workspace created / joined date
  Source: `workspaces.created_at`
- Communication readiness
  Source: announcements count plus workspace email settings readiness
- Billing readiness
  Source: `workspace_billing`
- Live class readiness
  Source: `live_sessions` count
- Staff count
  Source: teacher count in `users`
- Student count
  Source: student count in `users`
- Class / channel count
  Source: `channels`
- Homework readiness
  Source: `homework_items` + `tasks`
- Activation score / launch readiness
  Source: onboarding evidence + `workspace_activation_metrics`

## Partially Available

- School code display
  Stored in `workspaces.school_code`, but not guaranteed to be populated for every legacy workspace. The UI falls back to the workspace slug/id.
- School admin identity
  The repository can resolve a primary `school_admin`, but in multi-admin workspaces that may not always match the currently logged-in admin. The SPA overlays the current session identity when available.
- Signature email semantics
  The project stores `reply_to_email` and signature HTML, but does not separately model a distinct “sender mailbox” object. Onboarding treats reply-to + signature presence as sender readiness.
- Opening hours completeness
  Summary text and structured day rows are supported, but some workspaces may only have free-text hours.
- Billing contact details
  Billing readiness is reliable, but invoice/legal metadata is intentionally minimal today.
- Communication readiness
  The system can detect announcements and sender/email configuration, but not richer campaign, domain-authentication, or deliverability state.

## Missing / Future Support

- Dedicated legal company fields
  Missing structured fields for company name, VAT / tax number, registration court, chamber, managing director, and legal representative metadata.
- Structured sender identity model
  Missing a separate verified sender profile with mailbox verification / deliverability state.
- Dedicated branch / campus profile fields
  Missing multi-campus or branch-specific onboarding identity beyond one workspace profile.
- Fully structured opening-hours exceptions
  Missing holidays, vacation closures, and temporary exception windows.
- Billing legal entity metadata
  Missing billing address, finance contact phone, VAT number, purchase-order references, and invoicing rules.
- Rich communication readiness
  Missing explicit domain verification, DKIM/SPF state, and announcement audience coverage metrics.
