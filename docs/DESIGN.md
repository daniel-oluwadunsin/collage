# Collage Product Design System

Status: canonical implementation specification  
Last normalized: 2026-07-18

This document is the visual and interaction source of truth for the Collage
Telegram Mini App. `docs/03_DESIGN.md` remains in the mandatory reading order
and points here.

## 1. Direction: accountable neo-brutalism

Collage uses a controlled neo-brutalist language: bold, physical, communal,
and unmistakable without becoming careless about money. Interfaces resemble
well-made contribution ledgers, stamped notices, and pinned group updates.
Structure is visible through hard borders, flat color blocks, offset shadows,
strong typography, and direct mechanical interactions.

The product must still feel safe during registration, collection, provider
verification, reconciliation, and payout. Visual energy never weakens the
financial rules:

- provider pending is never styled as success;
- redirects never claim a payment completed;
- critical Collage, group, cycle, amount, recipient, and deadline context stays
  visible;
- user-controlled text never breaks or obscures operational content;
- dark and light themes remain first-class;
- compact Telegram webviews remain readable and touch-friendly.

## 2. Binding visual rules

1. No gradients. This includes decorative gradients, progress gradients,
   gradient text, and gradient-generated dot/grid patterns.
2. No blur, glass, translucent panels, or soft elevation.
3. Use flat fills and solid borders. If a region has meaning, its boundary is
   visible.
4. Shadows are hard offset blocks with zero blur.
5. Default corners are square. Fully round shapes are reserved for small status
   badges or truly circular indicators.
6. Motion is short, mechanical, and subordinate to state clarity.
7. The fixed Collage colors remain unchanged.

## 3. Brand and semantic colors

The immutable brand colors are:

- Collage Yellow: `#FFD85C` — community, joining, shared progress, attention;
- Collage Blue: `#0357EE` — trust, primary action, links, system authority.

Yellow always uses dark text. Blue actions use white text. Financial states
also use explicit labels and icons; color alone is never the message.

```css
:root {
  color-scheme: light;
  --background: #fffdf5;
  --foreground: #0b0f19;
  --surface: #ffffff;
  --surface-subtle: #fff4bd;
  --muted-foreground: #344054;
  --border: #0b0f19;
  --primary: #0357ee;
  --primary-hover: #0048cc;
  --primary-foreground: #ffffff;
  --primary-soft: #dce8ff;
  --brand-yellow: #ffd85c;
  --brand-yellow-soft: #fff1a6;
  --brand-yellow-foreground: #0b0f19;
  --success: #15803d;
  --success-soft: #eaf8ef;
  --warning: #b45309;
  --warning-soft: #fff5df;
  --destructive: #c62828;
  --destructive-soft: #fff0f0;
  --provider-pending: #7c3aed;
  --provider-pending-soft: #f3efff;
  --hard-shadow-sm: 4px 4px 0 #0b0f19;
  --hard-shadow-md: 7px 7px 0 #0b0f19;
  --hard-shadow-lg: 9px 9px 0 #0b0f19;
}

[data-theme="dark"] {
  color-scheme: dark;
  --background: #0b0f19;
  --foreground: #f8fafc;
  --surface: #131b2b;
  --surface-subtle: #1b2940;
  --muted-foreground: #a4afc1;
  --border: #f8fafc;
  --primary: #4f83ff;
  --primary-hover: #76a0ff;
  --primary-soft: #172a52;
  --brand-yellow: #ffd85c;
  --brand-yellow-soft: #382f16;
  --hard-shadow-sm: 4px 4px 0 #0357ee;
  --hard-shadow-md: 7px 7px 0 #0357ee;
  --hard-shadow-lg: 9px 9px 0 #0357ee;
}
```

Provider pending remains violet so it cannot be confused with blue active,
yellow attention, green success, or red failure.

## 4. Typography

Primary family: **Space Grotesk Variable**, bundled with the Mini App so the
interface does not depend on a runtime font request. Fallbacks are `Arial
Black` and `sans-serif`.

- headings: 800–900, tight tracking, compact line height;
- body: 520–650, minimum 16px in forms and transactional copy;
- labels/buttons: 750–900, often uppercase with controlled tracking;
- amounts and dates: tabular numerals;
- page title: 28–38px in compact/fullscreen responsive range;
- primary amount: 32–44px when it is the screen's principal fact;
- avoid ultra-light weights and outlined display text in transactional flows.

Uppercase is used for short operational labels, not long paragraphs. Long
legal, consent, provider, and recovery copy remains sentence case.

## 5. Borders, shadows, and shape

- primary containers: 3px solid border;
- inputs and primary buttons: 3px solid border;
- secondary separators: 2px solid border;
- hard shadow small: `4px 4px 0`;
- hard shadow medium: `7px 7px 0`;
- no shadow blur or alpha haze;
- square corners by default;
- round only compact status pills and genuine circular activity marks.

Dark mode uses a blue hard shadow so depth remains visible against the dark
canvas while preserving white structural borders.

## 6. Layout and Telegram constraints

The shell is mobile-first, `min-height: 100dvh`, safe-area aware, and uses 16px
compact gutters. Content remains a single operational column, capped at 720px
in fullscreen/desktop.

Compact mode:

- context and principal state appear before optional detail;
- touch targets are at least 48px;
- forms stack to one column;
- shadows stay inside the usable viewport;
- sticky actions sit above Telegram content-safe-area insets.

Fullscreen/desktop:

- the operational column stays centered;
- summary facts may use two columns;
- forms remain narrow and readable;
- the layout does not turn into a generic dashboard grid.

Every financial/member screen begins with the persistent context panel:

```text
December Builders Collage
Builders Community
₦20,000 weekly · Cycle 3 of 10
Recipient: Amaka · Due Friday, 6:00 PM
```

## 7. Component language

### Buttons

- blue: primary financial action;
- yellow: joining, communal progress, non-terminal attention;
- white/surface: secondary or back action;
- red: destructive or terminal recovery action only;
- uppercase bold label, 52px preferred height;
- hard shadow at rest;
- active press translates by the shadow offset and removes the shadow;
- disabled controls remove the shadow and state the reason nearby.

### Inputs

- visible label and helper/error text;
- 3px border, square corners, 54px preferred height;
- yellow-soft focus fill plus hard shadow;
- correct mobile input mode;
- sensitive values masked after server submission;
- placeholders never replace labels.

### Panels and summaries

- cards represent one coherent concept only;
- use 3px borders and hard shadows for context, confirmation, provider pending,
  and terminal state panels;
- definition lists carry financial summaries;
- avoid nested cards;
- use a thick colored left rule when a state needs an additional signal.

### Tabs and selections

Tabs are bordered blocks. The active tab uses a flat blue fill and hard shadow.
Selected payment methods or position choices use flat yellow with a visible
border. No underline-only navigation in primary operational flows.

### Statuses

- blue: active/collecting;
- yellow: attention/authorization required;
- green: registered/paid/successful;
- red: failed/blocked/defaulted;
- violet: provider pending/unknown;
- neutral: scheduled/closed.

Every badge includes text; important states include an icon and explanatory
copy.

## 8. Asynchronous and financial states

All applicable routes implement:

- Telegram SDK/theme boot;
- authentication and launch-token resolution;
- structural skeleton;
- empty;
- form validation and submission;
- provider redirect creation;
- provider pending/unknown;
- server-confirmed success;
- retryable and terminal error;
- offline;
- expired action;
- unauthorized/non-member;
- registration full/closed/already registered;
- already paid;
- payout processing, failed, reversed, and blocked-by-default.

Provider pending is a durable financial panel:

```text
We are confirming your payment with Monnify.
Do not pay again while this check is in progress.
```

It includes Collage, amount, cycle, safe support reference, last checked time,
and a recheck action. Polling is capped, stops on a terminal state, and never
creates a second payment.

Skeletons use flat alternating opacity and solid borders. They never use a
shimmer gradient.

## 9. Motion

Motion is limited to 100–220ms mechanical press, step, disclosure, and verified
state transitions. Cards may lift by 1–2px on hover in desktop contexts.
Provider pending may use a simple bordered pulse. No bouncing money, long route
entrances, or animation that hides a state transition.

`prefers-reduced-motion` disables non-essential movement.

## 10. Accessibility

- WCAG AA contrast minimum;
- 44px minimum target, 48px preferred;
- visible 3px focus outline with offset;
- semantic headings and definition lists;
- associated labels/descriptions;
- color-independent statuses;
- keyboard operation in Telegram desktop;
- no unnecessary autofocus on mobile;
- `aria-live` limited to validation and terminal provider changes;
- long names and financial context must wrap without horizontal overflow.

## 11. Required reusable components

- `TelegramAppProvider`, `ThemeProvider`, `AppShell`;
- `CollageContextHeader`, `FinancialSummary`, `Money`, `MaskedValue`;
- `StatusBadge`, `CycleProgress`, `StepIndicator`;
- `AsyncButton`, `StickyActionBar`;
- `FullPageSkeleton`, `InlineQueryState`, `OfflineBanner`;
- `ProviderPendingState`, `ExpiredLaunchState`, `ErrorState`, `EmptyState`;
- `BankAccountCard`, `PaymentMethodCard`, `PositionPicker`;
- `ChargePreferenceFields`, `ConsentReview`.

## 12. Documented deviations from the supplied style brief

The supplied neo-brutalist reference is intentionally adapted for a fintech
Mini App:

- its red/violet/yellow marketing palette is replaced by the fixed Collage
  Yellow `#FFD85C` and Collage Blue `#0357EE` plus explicit semantic states;
- all gradient-generated textures are prohibited by product direction;
- extreme rotations, overlapping controls, marquee text, and 96–128px display
  type are excluded from transactional screens because they reduce Telegram
  compact-mode legibility and financial clarity;
- controlled asymmetry is allowed in branding and small decorative marks, not
  in amount, account, consent, provider, or payout facts;
- light and dark themes are retained even though the reference proposed one
  light palette.

The resulting system should feel bold and physical, but still precise enough
to withstand a payment dispute review.
