# Onboarding UX Hardening

## Scope

The onboarding wizard remains inside the existing SPA shell.

Updated frontend files:

- [public/index.html](/Users/jannatuladny/cat-6.1/public/index.html)
- [public/styles.refactor.css](/Users/jannatuladny/cat-6.1/public/styles.refactor.css)
- [public/app.js](/Users/jannatuladny/cat-6.1/public/app.js)

## Hardening Applied

### Theme alignment

- onboarding surfaces now read theme variables instead of hardcoded dark cards
- light and dark mode both use `html[data-theme="dark"]`
- main variables used:
  - `--onboarding-shell-bg`
  - `--onboarding-card-bg`
  - `--onboarding-card-border`
  - `--onboarding-copy`
  - `--onboarding-warning-*`
  - `--onboarding-progress-*`
  - `--dashboard-checklist-*`

### First-login clarity

- the onboarding hero now shows visible workspace context
- forced-onboarding notice explains why dashboard access is restricted
- blocked navigation attempts reopen onboarding with a readable message
- guided mode now keeps the current step visually dominant and demotes the heavier checklist chrome

### Progress resilience

- sidebar step selection persists current step to the server
- Back and “jump to required” navigation also persist current step
- current step reloads correctly after refresh/login

### Incomplete-state guidance

- the current step can show server-derived blockers
- activation checklist summary now names missing required areas
- action failures are surfaced inside the onboarding panel, not only as transient toasts
- onboarding load failure now keeps the shell intact and exposes a retry action
- busy actions now show visible pending labels for resume, defer, activate, and continue flows

### Responsive and overflow safety

- onboarding cards now avoid forced tall empty states
- dashboard and guided layouts use safer `minmax(0, 1fr)` grids
- long school names, emails, URLs, and addresses now wrap inside cards instead of escaping them
- button groups can wrap on small screens without horizontal overflow
- guided summary cards stay compact and collapse more predictably on laptops and phones

### Completion screen

- stronger ready-to-launch headline
- concise summary of configured workspace areas
- explicit `Open workspace` and `View setup checklist` next actions

### Billing step

- billing step now shows honest readiness details
- inline contact fields update server-backed billing profile data
- no fake payment-editor UX was introduced

### Mobile

- onboarding form rows collapse to one column
- footer actions stay full-width on smaller screens
- notice and alert cards remain readable on narrow layouts
- guided mode uses reduced spacing and avoids oversized hero treatment on smaller screens

### Motion

- current-step content now uses a subtle fade/slide transition
- reduced-motion users keep the same flow without animation noise

## Intentionally Deferred

- no standalone mobile-native wizard was introduced
- no multi-tab live sync channel was added
- no full billing console was exposed to school admins because the current architecture still centers invoice/payment administration in super-admin flows
- no backend onboarding rules or activation contracts were changed

## Remaining Optional Polish

- add richer skeleton illustrations instead of neutral content bars
- add per-step iconography or domain-color accents if stronger scannability is needed
- add a more explicit “recommended next action” explainer for resumed dashboard mode
