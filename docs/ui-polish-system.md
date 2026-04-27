# UI Polish System

## Scope
This pass keeps backend behavior unchanged and focuses on safe UI normalization in:

- `public/styles.refactor.css`
- `public/css/homework.css`
- `public/app.js`

No API, auth/session, onboarding rule, policy rule, database, or core chat logic changes were made.

## Current frontend file split

Recent UI cleanup also split homework-channel-specific styles out of the main stylesheet:

- shared/global app surface styles remain in `public/styles.refactor.css`
- homework board/channel styles now live in `public/css/homework.css`
- `public/index.html` loads the homework stylesheet after the main stylesheet so homework overrides stay local to that surface

## Theme Variables Added
Late-stage `@layer overrides` tokens were added in `:root` and `html[data-theme="dark"]` for:

- `--ui-app-surface`
- `--ui-card-elevated`
- `--ui-card-subtle`
- `--ui-border`
- `--ui-border-strong`
- `--ui-text`
- `--ui-text-muted`
- `--ui-shadow`
- `--ui-shadow-soft`
- `--ui-radius-card`
- `--ui-radius-control`
- `--ui-btn-primary-*`
- `--ui-btn-secondary-*`
- `--ui-btn-danger-*`
- `--ui-input-*`
- `--ui-list-bg`
- `--ui-state-empty-*`
- `--ui-state-error-*`
- `--ui-state-loading-*`

These are intended to give admin/settings/mailbox/modal surfaces the same light/dark quality bar as the more polished onboarding and policy flows.

## Selectors Normalized
Primary surface normalization:

- `.admin-panel-shell`
- `.admin-panel`
- `.admin-section`
- `.admin-settings-card`
- `.admin-access-card`
- `.ses-contact-form-card`
- `.ses-template-sidebar`
- `.ses-template-editor-card`
- `.mailbox`
- `.mbx-detail-panel`
- `.modal-card`
- `.admin-modal-card`
- `.school-profile-shell`

Buttons normalized:

- `.admin-primary-btn`
- `.admin-secondary-btn`
- `.ses-btn`
- `.ses-btn-primary`
- `.ses-btn-secondary`
- `.ses-btn-ghost`
- `.ses-btn-danger`
- `.mailbox .btn-ghost`
- `.mailbox .btn-danger`
- `.detail-reply-send`
- `.detail-reply-cancel`
- `.detail-action-btn`

Input normalization was applied across admin/settings/profile/modal/email surfaces using shared grouped selectors instead of changing backend markup.

## Responsive And Overflow Rules
The final override layer adds safer defaults for:

- `min-width: 0`
- `max-width: 100%`
- `overflow-wrap: anywhere`
- admin table cells
- mailbox rows and detail metadata
- modal width and height clamping to viewport
- modal body internal scrolling
- mobile mailbox row reflow
- admin table collapse on smaller screens

The goal is to prevent laptop/tablet horizontal overflow without major DOM rewrites.

## Shared States
Shared state classes were added:

- `.ui-empty-state`
- `.ui-error-state`
- `.ui-loading-state`
- `.ui-skeleton`
- `.ui-state-actions`

`public/app.js` now uses the shared empty/error state helper only for low-risk plain-text renderers, including:

- admin empty lists
- attendance empty/error fallback
- directory empty state
- DM/member picker empty states
- mailbox empty list
- saved messages empty state

## Risky Areas Intentionally Not Touched
- backend API contracts
- onboarding/policy flow behavior
- auth/session logic
- database writes or schema
- complex chat/thread renderers
- major DOM restructuring in admin/mailbox/modals
- bespoke live/session modal layouts outside safe global normalization

## Notes
The polish layer is intentionally appended late in the stylesheet so it wins the cascade with minimal churn. Older duplicated rules still exist underneath, but the current system should now present as one cohesive StudiesTalk surface in both light and dark themes.
