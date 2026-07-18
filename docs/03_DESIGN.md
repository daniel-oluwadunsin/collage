# Collage Product Design System (reading-order entry)

The canonical, normalized design specification is
[`docs/DESIGN.md`](./DESIGN.md).

This numbered file remains intentionally so the mandatory documentation reading
order stays stable. The canonical document contains the binding tokens, theme
resolution rules, Telegram compact/fullscreen constraints, complete
asynchronous/access-state catalogue, accessibility rules, and Milestone 1
boot-page acceptance criteria.

<!--
Historical source retained below for traceability. The canonical specification
above supersedes it where the two differ.
-->

# Historical design source

## 1. Design direction

### Core principle: Calm financial confidence

Collage should feel like a mature Nigerian fintech product: clear, warm, operational, secure, and deliberate.

The visual language may take high-level inspiration from the clarity and friendliness of leading African fintech products, including Moniepoint, but it must not copy Moniepoint screens, layouts, illustrations, icon arrangements, trade dress, wording, or proprietary assets. Build a distinct Collage identity.

### Brand colors

- **Collage Yellow:** `#FFD85C`
- **Collage Blue:** `#0357EE`

Yellow communicates community, reminders, progress, and human warmth.

Blue communicates trust, financial actions, links, active states, and system authority.

Use neutral surfaces as the foundation. Brand colors create hierarchy, not visual noise.

### Emotional keywords

Trustworthy, communal, crisp, warm, accountable, modern, operational, human, stable, transparent.

### What this design is not

- not a generic shadcn dashboard;
- not a copied Moniepoint interface;
- not a gradient-heavy crypto product;
- not a neon “AI fintech” design;
- not glassmorphism;
- not oversized marketing typography inside transactional flows;
- not a stack of identical rounded cards;
- not animation-first;
- not vague about provider state;
- not optimistic about financial success.

## 2. Theme architecture

Support:

- light theme;
- dark theme;
- Telegram theme integration;
- system-theme fallback;
- explicit user theme toggle.

Use CSS variables compatible with Tailwind and shadcn/ui.

### 2.1 Light theme tokens

```css
:root {
  --background: 210 40% 98%;
  --foreground: 222 47% 11%;

  --surface: 0 0% 100%;
  --surface-subtle: 210 40% 96%;
  --surface-strong: 221 39% 11%;

  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;

  --primary: 220 98% 47%;          /* #0357EE */
  --primary-foreground: 0 0% 100%;
  --primary-soft: 219 100% 96%;

  --brand-yellow: 44 100% 68%;     /* #FFD85C */
  --brand-yellow-foreground: 222 47% 11%;
  --brand-yellow-soft: 45 100% 94%;

  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --accent: 45 100% 94%;
  --accent-foreground: 222 47% 11%;

  --success: 152 69% 31%;
  --success-soft: 146 76% 95%;
  --warning: 32 95% 44%;
  --warning-soft: 48 100% 94%;
  --destructive: 0 72% 51%;
  --destructive-soft: 0 86% 97%;

  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 220 98% 47%;

  --radius-sm: 0.625rem;
  --radius-md: 0.875rem;
  --radius-lg: 1.125rem;
  --radius-xl: 1.5rem;

  --shadow-sm: 0 1px 2px rgb(15 23 42 / 0.05);
  --shadow-md: 0 10px 30px rgb(15 23 42 / 0.08);
}
```

### 2.2 Dark theme tokens

```css
.dark {
  --background: 218 45% 7%;
  --foreground: 210 40% 98%;

  --surface: 218 36% 11%;
  --surface-subtle: 217 30% 15%;
  --surface-strong: 210 40% 98%;

  --card: 218 36% 11%;
  --card-foreground: 210 40% 98%;
  --popover: 218 36% 11%;
  --popover-foreground: 210 40% 98%;

  --primary: 218 96% 61%;
  --primary-foreground: 0 0% 100%;
  --primary-soft: 220 53% 18%;

  --brand-yellow: 44 100% 68%;
  --brand-yellow-foreground: 222 47% 11%;
  --brand-yellow-soft: 42 47% 17%;

  --secondary: 217 30% 15%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217 30% 15%;
  --muted-foreground: 215 20% 65%;
  --accent: 42 47% 17%;
  --accent-foreground: 44 100% 82%;

  --success: 151 55% 51%;
  --success-soft: 151 48% 14%;
  --warning: 42 96% 57%;
  --warning-soft: 39 47% 15%;
  --destructive: 0 84% 65%;
  --destructive-soft: 0 47% 16%;

  --border: 217 24% 22%;
  --input: 217 24% 22%;
  --ring: 218 96% 61%;

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.3);
  --shadow-md: 0 16px 38px rgb(0 0 0 / 0.35);
}
```

### 2.3 Telegram theme integration

- Read Telegram theme parameters where available.
- Apply Telegram background/text/hint/link/button values only when contrast remains accessible.
- Do not let host theme erase semantic success/warning/error distinctions.
- Call Telegram `ready()` only after critical boot styling is applied.
- Support safe-area and content-safe-area insets.
- Support compact and fullscreen modes.
- Use Telegram back button where appropriate.
- Use haptic feedback sparingly for confirmed local interactions; it is never proof of provider success.

## 3. Typography

Use a highly legible modern sans-serif.

Recommended:

- **Primary:** Geist Sans or Inter.
- **Numeric/metadata:** Geist Mono or JetBrains Mono, sparingly.

Rules:

- body minimum: 16px;
- labels: 13–14px, medium weight;
- Mini App page title: 24–32px;
- primary balances/amounts: 32–44px where justified;
- use tabular numerals for currency and dates;
- no ultra-light financial text;
- keep confirmation copy short;
- do not use editorial display serif in transaction flows.

## 4. Layout

### 4.1 Mini App shell

- mobile-first;
- `min-height: 100dvh`;
- Telegram safe-area padding;
- sticky context header where useful;
- sticky bottom action bar where useful;
- content width up to 720px in fullscreen/desktop;
- 16px mobile gutters, 24px larger gutters;
- 8/12/16/24/32px rhythm.

### 4.2 Persistent Collage context

Every action screen begins with a compact context block:

```text
December Builders Collage
Builders Community
₦20,000 weekly · Cycle 3 of 10
Recipient: Amaka · Due Friday, 6:00 PM
```

Use a restrained blue accent/label rather than a marketing hero.

### 4.3 Information density

- group related details;
- use definition lists for financial summaries;
- one dominant action per screen;
- advanced explanation may be expandable;
- do not place every line in a card;
- critical amount/status should be visible without scrolling on common phones.

## 5. Shape and elevation

- moderate radii, not pill-shaped everything;
- inputs/cards/buttons generally `rounded-xl` through tokens;
- pills reserved for statuses and compact filters;
- use borders before shadows;
- shadows mainly for sheets, dialogs, sticky actions;
- no glass blur on financial content.

## 6. Components

### 6.1 Primary financial button

- blue background;
- white text;
- minimum 48px height;
- full-width on mobile when appropriate;
- stable width in loading state;
- disabled reason displayed nearby;
- never two competing primary buttons.

### 6.2 Yellow community action

Use yellow for:

- joining;
- reminders;
- non-terminal attention;
- friendly progress callouts;
- selected community options.

Yellow requires dark text.

### 6.3 Destructive action

Use semantic red only for cancellation/removal/terminal destructive actions. Require confirmation and describe the consequence.

### 6.4 Inputs

- visible labels;
- helper and error text;
- correct mobile input mode;
- sensitive values masked after submission;
- clear focus ring;
- minimum 48px touch height;
- placeholder is never the only label;
- bank select supports search;
- resolved account name appears in a separate confirmation block.

### 6.5 Cards

Use a card for one coherent concept:

- Collage context;
- current cycle;
- payment method;
- payout account;
- registration progress.

Avoid card nesting and generic dashboard grids.

### 6.6 Status badges

- blue: active/in progress;
- yellow: attention/pending authorization;
- green: successful/registered/paid;
- red: failed/blocked/default;
- neutral: scheduled/closed.

Text and icon must communicate status in addition to color.

### 6.7 Progress

Registration/cycle progress shows:

- numeric count;
- visual indicator;
- exact remaining count;
- no 100% before server/provider confirmation.

## 7. Loading and asynchronous states

Proper loading states are mandatory.

### 7.1 Application boot

Show a branded boot surface while:

- Telegram SDK initializes;
- theme applies;
- `initData` is validated;
- launch token resolves.

Do not flash an unauthorized page before authentication resolves.

### 7.2 Page loading

Use structural skeletons matching final layout:

- context header skeleton;
- summary rows;
- form skeleton when remote data determines options.

Do not use one centered spinner for a complex page unless the delay is extremely short.

### 7.3 Button pending

When submitting:

- disable repeated activation;
- show a spinner and specific text such as “Creating authorization…”;
- preserve width;
- prevent navigation that could duplicate requests;
- expose cancellation only where safe.

### 7.4 Financial pending

Provider pending is not generic loading. Show a dedicated state:

> We are confirming your payment with Monnify.

Include:

- Collage;
- amount;
- cycle;
- safe support/reference code;
- refresh/recheck action;
- explicit instruction not to pay again.

### 7.5 Polling

Use TanStack Query:

- stop on terminal state;
- capped/exponential intervals;
- safe refetch on focus/reconnect;
- never create a new payment while polling;
- show last checked time;
- avoid repeated screen-reader announcements.

### 7.6 Empty, error, offline, and expired states

Every query surface includes:

- useful empty state;
- retryable error;
- terminal error;
- offline banner/state;
- expired-link state;
- unauthorized state.

Messages are human-readable and do not expose provider internals.

## 8. Forms

Use React Hook Form + Zod.

- split long registration into reviewable steps;
- persist durable progress server-side;
- display step progress;
- validate on blur and submit;
- map server errors to fields where possible;
- position picker reflects live availability;
- handle position races by refreshing and asking for another position;
- recurring-payment consent is explicit;
- final confirmation summarizes exact rules.

Recommended registration steps:

1. Identity.
2. Phone verification.
3. Payout account.
4. Position and charge preference.
5. Rules and consent.
6. Payment method.
7. Confirmation.

## 9. Motion

Use Framer Motion only for:

- sheet/dialog entrance;
- step transitions;
- verified status icon confirmation;
- expanding details;
- subtle progress changes.

Rules:

- 150–250ms;
- respect reduced motion;
- no bouncing money;
- no long route entrance sequences;
- no animation that hides a state change;
- provider success appears only after server confirmation.

## 10. Icons

Use Lucide React:

- generally 18–22px;
- 1.75–2 stroke width;
- icons support labels, not replace them;
- consistent mapping for paid, pending, warning, bank, card, calendar, group, receipt, and shield;
- emoji may appear sparingly in Telegram messages, not as primary Mini App controls.

## 11. Dark mode

Dark mode is first-class:

- preserve blue action prominence;
- yellow stays warm and legible;
- avoid pure-black large surfaces;
- maintain borders and hierarchy;
- skeletons must not flash brightly;
- test bank lists, dialogs, date pickers, toasts, and redirects;
- persist preference while respecting Telegram/system default.

## 12. Accessibility

- WCAG AA contrast minimum;
- minimum 44×44px targets, preferably 48px;
- visible `focus-visible` states;
- semantic headings;
- associated labels and descriptions;
- `aria-live` for validation and terminal provider updates;
- reduced-motion support;
- color-independent statuses;
- desktop Telegram keyboard navigation;
- avoid autofocus that unnecessarily opens mobile keyboard;
- currency values have accessible labels.

## 13. Financial confirmation pattern

Before mandate setup, card setup payment, manual payment, or payout-account update, show:

- action;
- Collage;
- Telegram group;
- amount;
- frequency/cycle;
- masked source/destination;
- what happens next;
- return/cancellation behavior.

Example:

```text
Authorize automatic contributions

December Builders Collage
Builders Community

Amount: ₦20,000
Schedule: Weekly
Preferred attempt: Thursday, 9:00 AM
Payment method: Direct debit
Payout position: 4

You will leave Collage briefly to authorize this mandate with Monnify.
```

## 14. Required reusable components

- `TelegramAppProvider`;
- `ThemeProvider`;
- `AppShell`;
- `CollageContextHeader`;
- `FinancialSummary`;
- `StatusBadge`;
- `Money`;
- `MaskedValue`;
- `AsyncButton`;
- `FullPageSkeleton`;
- `InlineQueryState`;
- `ProviderPendingState`;
- `ExpiredLaunchState`;
- `EmptyState`;
- `ErrorState`;
- `OfflineBanner`;
- `StepIndicator`;
- `BankAccountCard`;
- `PaymentMethodCard`;
- `CycleProgress`;
- `PositionPicker`;
- `ChargePreferenceFields`;
- `ConsentReview`;
- `StickyActionBar`.

## 15. Success criteria

The result should feel:

- intentionally designed rather than generated;
- consistent across routes;
- unmistakably Collage;
- trustworthy enough for money;
- readable in compact Telegram;
- complete in light and dark modes;
- resilient during slow provider operations;
- explicit about pending, successful, failed, reversed, or blocked states.

</design-system>
