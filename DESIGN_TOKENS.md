# WorkNest Design Tokens (Aurora)

## Brand
- Primary: `#6D5BFF` (Aurora Purple)
- Secondary: `#3B82F6` (Calm Blue)
- Accent: `#A78BFA` (Lavender)
- Gradient: `linear-gradient(135deg, #6D5BFF, #3B82F6)`

Usage rules:
- Use brand color for active states, primary CTAs, mentions.
- Do not use brand everywhere. Most UI should be neutral.

## Typography (Slack-comfortable)
- Base: 15px (`--fs-2`)
- Small: 13px (`--fs-1`)
- Meta: 12px (`--fs-0`)
- Title: 16px (`--fs-3`)
- Line height: 1.55 (`--lh`)

Rules:
- Message body uses base (15px)
- Sidebar items use 14px
- Meta (timestamps, helper) uses 12px

## Spacing (8pt system)
- 4, 8, 12, 16, 20, 24

Rules:
- Sidebar item padding: 8x10
- Message row padding: 10x12
- Composer padding: 12
- Panel padding: 12–16

## Radii
- Small: 10px
- Medium: 14px
- Large: 18px

Rules:
- Pills: 999px
- Cards: 16–18px
- Buttons: 12–16px

## Surfaces (Light)
- App: `--bg-app`
- Rail: `--bg-rail`
- Sidebar: `--bg-sidebar`
- Chat: `--bg-chat`
- Surface: `--bg-surface`
- Surface 2: `--bg-surface-2`

Rules:
- Chat canvas should not be pure white.
- Cards always use `--bg-surface`.

## Surfaces (Dark)
- App: `#0A0F1F`
- Rail/Sidebar: `#0B1328`
- Surface: `#0F1B36`

Rules:
- Avoid pure black.
- Use surface layering to separate panels.

## Text & Icons
Light:
- Primary text: `#0B1220`
- Message text ink: `#1F2937`
- Icon default: ~65% opacity (muted)

Dark:
- Primary text: `#EEF1FF`
- Message text: ~90% opacity
- Icon default: ~62% opacity (muted)

Rules:
- Icons should always be softer than text.
- On hover, icons can rise to ~85%.

## Motion
- Duration: 110–170ms
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`
- Hover lift: max 1px

Rules:
- Never animate layout or large shifts.
- Prefer background + shadow changes.
- Respect `prefers-reduced-motion`.
