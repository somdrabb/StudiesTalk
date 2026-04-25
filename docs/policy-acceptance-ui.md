# Policy Acceptance UI

## Screen Intent

- Not a normal channel page
- Not a workspace subview
- A blocking pre-entry checkpoint

## Included Elements

- Header with:
  - school name
  - policy title
  - last updated date
  - version
- Summary cards
- Structured policy sections
- Acknowledgement checkbox
- Footer actions:
  - Accept and continue
  - Logout

## Theme Support

- Exact dark-mode selector:
  - `html[data-theme="dark"]`
- Theme toggle source:
  - `document.documentElement`
  - `data-theme="dark"` for dark mode
  - no `data-theme` attribute for light mode
- Theme-aware variables now drive the screen:
  - `--policy-shell-bg`
  - `--policy-card-bg`
  - `--policy-card-border`
  - `--policy-card-shadow`
  - `--policy-muted-text`
  - `--policy-subtle-text`
  - `--policy-chip-*`
  - `--policy-badge-*`
  - `--policy-primary-*`
  - `--policy-secondary-*`
  - `--policy-skeleton-bg`

## Responsive and Overflow Rules

- the policy panel scrolls inside `#policyGatePanel`
- the footer CTA remains easy to reach through a sticky footer treatment
- long emails, URLs, addresses, titles, and legal copy use wrapping rules so they stay inside cards
- summary cards collapse from five columns to two and then one as space narrows
- footer actions stack cleanly on small screens

## UX Hardening Applied

- hero spacing is reduced so legal content starts sooner
- summary cards and legal sections use the same theme-aware card system
- light mode is bright and clean; dark mode stays readable without separate hardcoded card palettes
- loading state now uses a cleaner skeleton treatment
- load failure now offers a retry CTA without throwing the user out of the checkpoint
- `Accept and continue` now shows a visible busy state while the acceptance write is in flight

## Remaining Optional Polish

- add section jump links if policy content grows substantially
- add explicit “last reviewed by school” metadata if legal/process needs expand
- add optional print/download affordance only if policy distribution requires it

## Implementation

- Markup shell:
  - `public/index.html`
- Rendering logic:
  - `public/app.js`
- Styling:
  - `public/styles.refactor.css`
