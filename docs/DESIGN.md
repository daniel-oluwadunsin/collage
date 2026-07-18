# Collage Product Design System

Status: canonical Milestone 1 design specification  
Last normalized: 2026-07-18

This document is the implementation-facing source of truth for Collage’s Mini
App visual system. `docs/03_DESIGN.md` remains in the numbered reading order and
points here.

## 1. Product character

Collage is an operational-fintech product for Nigerian contribution groups. It
should feel calm, accountable, communal, and precise: a tool people can trust
while money is moving and while a provider outcome is still uncertain.

Collage has its own identity. It may share broad fintech qualities such as
clarity and warmth, but it must not copy Moniepoint screens, page composition,
illustrations, icon arrangements, trade dress, wording, motion, or proprietary
assets.

The interface is:

- compact and information-rich without feeling cramped;
- warm through controlled yellow accents, not decoration;
- authoritative through blue actions and explicit state language;
- based on borders, rhythm, and typography rather than nested cards;
- exact about Collage, group, cycle, amount, recipient, deadline, and status.

It is not glassmorphic, gradient-heavy, crypto-styled, animation-led, a generic
dashboard, or optimistic about unverified financial outcomes.

## 2. Brand and semantic tokens

The two fixed brand colors are:

- Collage Yellow: `#FFD85C` — community, attention, joining, progress;
- Collage Blue: `#0357EE` — trust, links, primary action, system authority.

Brand colors create hierarchy; neutral surfaces carry most content. Yellow
always uses dark foreground text. Success, warning, failure, and provider
pending remain separate semantic tokens and never rely on color alone.

```css
:root {
  color-scheme: light;
  --background: #f7f9fc;
  --foreground: #101828;
  --surface: #ffffff;
  --surface-subtle: #eef2f7;
  --surface-strong: #172033;
  --muted-foreground: #667085;
  --border: #dfe5ec;
  --primary: #0357ee;
  --primary-hover: #0248c7;
  --primary-foreground: #ffffff;
  --primary-soft: #eaf1ff;
  --brand-yellow: #ffd85c;
  --brand-yellow-soft: #fff7d6;
  --brand-yellow-foreground: #172033;
  --success: #15803d;
  --success-soft: #eaf8ef;
  --warning: #b45309;
  --warning-soft: #fff5df;
  --destructive: #c62828;
  --destructive-soft: #fff0f0;
  --provider-pending: #7c3aed;
  --provider-pending-soft: #f3efff;
  --focus: #0357ee;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --shadow-raised: 0 14px 36px rgb(16 24 40 / 0.10);
}

[data-theme="dark"] {
  color-scheme: dark;
  --background: #0b1120;
  --foreground: #f8fafc;
  --surface: #121b2d;
  --surface-subtle: #1a263b;
  --surface-strong: #f8fafc;
  --muted-foreground: #a4afc1;
  --border: #2b3950;
  --primary: #4f83ff;
  --primary-hover: #76a0ff;
  --primary-foreground: #ffffff;
  --primary-soft: #172a52;
  --brand-yellow: #ffd85c;
  --brand-yellow-soft: #382f16;
  --brand-yellow-foreground: #172033;
  --success: #4ade80;
  --success-soft: #12331f;
  --warning: #fbbf24;
  --warning-soft: #3a2d12;
  --destructive: #fb7185;
  --destructive-soft: #3d1820;
  --provider-pending: #c4b5fd;
  --provider-pending-soft: #292044;
  --focus: #76a0ff;
  --shadow-raised: 0 16px 40px rgb(0 0 0 / 0.36);
}
```

## 3. Theme resolution

Supported modes are `light`, `dark`, `system`, and `telegram`.

1. An explicit user choice wins and is persisted.
2. `telegram` reads the host theme and supported theme parameters.
3. `system` follows `prefers-color-scheme`.
4. If Telegram data is absent or invalid, fall back to system.

Telegram background, text, hint, link, and button values may be mapped only
when WCAG AA contrast is retained. Host values never replace the semantic
success, warning, provider-pending, or destructive palette. Theme styling is
applied before `ready()` to avoid a bright or unauthorized flash.

## 4. Telegram webview behavior

The shell uses `min-height: 100dvh`, host safe-area and content-safe-area
insets, 16px compact gutters, and a centered content width of at most 720px in
fullscreen or desktop.

Compact mode:

- critical context and primary state are visible without scrolling;
- one primary action is sticky above the safe area when appropriate;
- secondary details collapse behind labelled disclosure;
- touch targets are at least 48px.

Fullscreen/desktop mode:

- content remains a single readable operational column;
- summary information may use two columns, but forms remain narrow;
- keyboard focus order and hover states are fully supported;
- no dashboard grid is introduced simply because space is available.

Use Telegram’s back button when navigation has a safe previous step. Request
fullscreen only after a user gesture and only where the added space benefits a
form or detailed history. Haptics may confirm a local tap; they never represent
provider or server success.

## 5. Typography, spacing, and shape

- Primary type: Geist Sans or Inter with a system fallback.
- Numeric metadata: Geist Mono, used sparingly with tabular numerals.
- Body minimum: 16px; labels: 13–14px, medium weight.
- Page title: 24–32px; exceptional primary amounts: 32–44px.
- Spacing rhythm: 4, 8, 12, 16, 24, and 32px.
- Mobile gutter: 16px; wider gutter: 24px.
- Moderate radii; pills are reserved for compact statuses.
- Borders establish grouping before shadows.
- Shadows are reserved for sheets, dialogs, and sticky action surfaces.

## 6. Operational layout

Every financial or membership screen begins with a persistent context block:

```text
December Builders Collage
Builders Community
₦20,000 weekly · Cycle 3 of 10
Recipient: Amaka · Due Friday, 6:00 PM
```

Every confirmation repeats the action, Collage, Telegram group, exact amount,
frequency or cycle, masked source/destination, and what happens next. One
dominant action appears per screen. Definitions lists are preferred for
financial summaries. Avoid nested cards and never hide critical status beneath
motion.

## 7. Core components

Milestone 1 establishes reusable visual contracts for:

- `ThemeProvider`, `TelegramAppProvider`, `AppShell`;
- `CollageContextHeader`, `FinancialSummary`, `Money`, `MaskedValue`;
- `StatusBadge`, `CycleProgress`, `StepIndicator`;
- `AsyncButton`, `StickyActionBar`;
- `FullPageSkeleton`, `InlineQueryState`, `OfflineBanner`;
- `ProviderPendingState`, `ExpiredLaunchState`, `ErrorState`, `EmptyState`;
- `BankAccountCard`, `PaymentMethodCard`, `PositionPicker`;
- `ChargePreferenceFields`, `ConsentReview`.

Blue is the primary financial action. Yellow is for joining, communal progress,
and non-terminal attention. Red is reserved for destructive or terminal
failure. Buttons preserve their width while pending and show a specific verb.

## 8. Mandatory asynchronous and access states

No Mini App route is complete unless its relevant states are designed and
implemented.

### Boot and skeleton

During SDK initialization, theme application, Telegram authentication, and
launch-token resolution, show a branded boot surface. Then use structural
skeletons matching the context block, summary rows, or form. Never flash an
unauthorized screen while authentication is unresolved.

### Loading and submitting

Buttons disable repeated activation, preserve width, and use specific copy such
as “Creating authorization…”. Navigation that could duplicate an external
operation is blocked. A spinner is supplemental, not the only status.

### Provider pending

Provider pending is a durable financial state, not generic loading:

```text
We are confirming your payment with Monnify.
Do not pay again while this check is in progress.
```

Show the Collage, amount, cycle, safe support/reference code, last checked time,
and a recheck action. Polling is capped, stops on terminal status, never creates
a second payment, and avoids repeated screen-reader announcements.

### Error

Retryable errors explain what can be retried. Terminal errors explain the next
safe support or recovery step. Neither exposes raw provider payloads, stack
traces, credentials, nor private failure reasons.

### Offline

An offline banner remains visible without replacing already-loaded safe data.
Money-moving actions are disabled. Reconnection refreshes server state before
enabling them.

### Expired

Expired action links identify the intended action without revealing sensitive
details, prevent continuation, and provide a route back to the current pinned
Telegram status or a fresh launch.

### Unauthorized

Unauthorized and non-member states are distinct from not-found. They explain
which Telegram context is required and never leak whether another user’s
financial resource exists.

### Other required terminal/empty states

Include registration full, registration closed, already registered, already
paid, payout in progress, provider reversed, blocked by default, empty history,
and safe success confirmed by the server. Never optimistically display
registered, paid, authorized, or paid-out.

## 9. Forms and confirmations

Use React Hook Form and shared Zod contracts. Long registration is split into:

1. identity;
2. phone verification;
3. payout account;
4. position and charge preference;
5. rules and consent;
6. payment method;
7. server-confirmed completion.

Durable progress is server-side. Validate on blur and submit. Handle position
races by refreshing availability. Sensitive values are visibly labelled,
masked after submission, and never persisted in browser storage.

## 10. Motion, icons, and accessibility

Motion is limited to 150–250ms sheet, step, disclosure, and verified-state
transitions. Respect reduced motion. Never animate money movement or conceal a
state change.

Lucide icons are generally 18–22px and support visible labels. Status always
uses text and icon as well as color.

Accessibility requirements:

- WCAG AA contrast;
- semantic headings and definition lists;
- associated labels, helper text, and error descriptions;
- 44px minimum targets, 48px preferred;
- visible `focus-visible` rings;
- `aria-live` only for validation and terminal provider updates;
- accessible currency labels and tabular numerals;
- keyboard support in Telegram desktop;
- no autofocus that unnecessarily opens a mobile keyboard.

## 11. Milestone 1 boot-page acceptance

The design-system boot page must visibly demonstrate:

- fixed Yellow `#FFD85C` and Blue `#0357EE`;
- Collage-specific operational-fintech composition;
- light, dark, system, and Telegram modes;
- compact and fullscreen shell behavior;
- context, amount, cycle, recipient, and deadline;
- skeleton/loading, provider-pending, error, offline, expired, and unauthorized
  examples;
- reduced-motion and keyboard-visible focus behavior.

It is a component/state reference only. It must not call Monnify, Telegram, a
database, or claim that a business operation has completed.

