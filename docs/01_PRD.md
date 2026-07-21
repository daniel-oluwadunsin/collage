# Collage Product Requirements Document

## 1. Product summary

**Collage** is a Telegram-native operating system for Ajo/group contributions.

A Telegram group can add and tag Collage Bot, configure contribution rules, register contributors through a Telegram Mini App, authorize reusable payment methods, automatically collect contributions, remind only members whose collection needs attention, track each cycle, and pay the scheduled recipient through Monnify.

The platform removes the need for a group treasurer to personally collect and hold funds. It does not eliminate credit/default risk, provide insurance, or guarantee that a bank debit will always succeed. Production launch requires legal, compliance, KYC/AML, safeguarding, consumer-protection, privacy, and payment-partner review.

## 2. Product goals

1. Let a Telegram group create and operate a structured Ajo without spreadsheets or a human collector.
2. Make contribution rules explicit, reviewable, versioned, and locked after activation.
3. Require identity details, a verified payout account, and an active recurring payment method before a member counts as registered.
4. Automate member-specific collection attempts according to each member's permitted preferred charge period.
5. Keep the group informed without flooding it with successful automatic-charge messages.
6. Prevent duplicate registration, duplicate position assignment, duplicate charges, duplicate payouts, and race-condition corruption.
7. Maintain a transparent Collage-level pot ledger even if multiple Collages share one Monnify wallet.
8. Preserve a contributor's financial obligations if they leave the Telegram group.
9. Make every Mini App screen clearly identify the Collage, group, cycle, amount, recipient, and deadline involved.
10. Deliver a demo-ready MVP with no central admin application.

## 3. Non-goals for the first release

- WhatsApp integration.
- A central operations/admin dashboard.
- Multiple currencies; NGN only.
- Lending, credit underwriting, or platform-funded default coverage.
- Insurance or an unlimited protection reserve.
- Automated legal debt collection.
- Group voting and replacement-member marketplaces.
- Cash payments.
- Multiple simultaneously open/active Collages in one Telegram chat. Historical Collages may coexist, but only one may be in registration, active, or blocked state per chat in the MVP.
- AI making financial decisions. Any later natural-language rule parser must produce structured rules for explicit human review; money movement remains deterministic.

## 4. Actors

### 4.1 Telegram group administrator / Collage creator

A current group administrator who:

- adds or tags the bot;
- creates the Collage;
- configures and confirms its rules;
- opens registration;
- sees status, overdue, and blocked information;
- can request reminders or reconciliation;
- cannot manually mark a member paid;
- cannot redirect another member's payout;
- cannot modify locked financial rules after start.

### 4.2 Contributor

A Telegram user who:

- supplies their legal identity and contact details;
- selects an available payout position;
- supplies and validates a payout bank account;
- selects a preferred charge period;
- authorizes a card or direct-debit mandate;
- pays automatically or manually when required;
- can safely replace payout and payment methods;
- remains obligated after leaving the Telegram group.

### 4.3 Scheduled recipient

The contributor assigned to receive the cycle's pot according to payout position.

### 4.4 Collage platform

The API, bot, worker, Mini App, PostgreSQL database, Redis/BullMQ infrastructure, ledger, and Monnify integration.

## 5. Terminology

- **Collage:** one Ajo arrangement associated with one Telegram chat.
- **Cycle:** one collection-and-payout round.
- **Position:** the cycle number in which a member receives the pot.
- **Expected pot:** contribution amount multiplied by fully registered participants, adjusted only by explicitly modeled fees or credits.
- **Payout account:** bank account that receives the member's pot.
- **Payment method:** reusable card token or activated direct-debit mandate used to collect contributions.
- **Preferred charge period:** the member's chosen first-attempt time inside the group-defined cycle window.
- **Pot balance:** the Collage's internal ledger balance, never the whole Monnify wallet balance.
- **Strict cycle:** no payout or next cycle until every required contribution is confirmed and the current payout succeeds.

## 6. Telegram entry points

### 6.1 Bot added to a group

When added, the bot:

1. stores or updates the Telegram chat;
2. checks its current permissions;
3. explains required permissions, especially the ability to pin messages;
4. checks whether the group has a current Collage;
5. posts either a creation prompt or the current status.

### 6.2 Bot tagged or `/collage` used

The bot resolves the Telegram `chat_id` and asks the backend for the correct status card.

#### No current Collage

The bot posts:

> **Meet Collage Bot**
>
> Collage helps this group create and run an Ajo, register contributors, automate collections, send payment reminders, track cycles, and process scheduled payouts.
>
> This group does not currently have an open or active Collage.

Buttons:

- Create a Collage
- How Collage works

Only a verified current Telegram group administrator can create one.

#### Registration open

Show:

- Collage name;
- Telegram group name;
- date created;
- contribution amount;
- formatted contribution frequency;
- registered contributors versus registration limit;
- available slots;
- available payout positions;
- planned start date or automatic start condition;
- registration status.

Buttons:

- Join Collage
- View rules
- View available positions

#### Active or blocked

Show, where applicable:

- Collage name;
- group name;
- date created;
- Collage pot ledger balance;
- formatted frequency;
- start date;
- expected end date;
- current cycle and total cycles;
- current cycle deadline;
- next recipient;
- expected payout;
- confirmed amount in the current cycle;
- number paid and number outstanding;
- cycles remaining;
- active, overdue, blocked, or payout-processing status.

Buttons:

- Pay contribution
- Update payout account
- Update payment method
- View history
- View rules

The bot should maintain one live pinned status message and edit it as state changes instead of continuously pinning new messages.

## 7. Collage creation

Creation occurs inside the Mini App and is restricted to a current Telegram group administrator.

Creating a Collage does not automatically register the creator with incomplete
financial details. Immediately after registration opens, the creator is offered
the same complete, resumable opt-in flow as every other member and may occupy
one of the configured participant slots.

### 7.1 Required fields

- Collage name.
- Description.
- Currency: NGN.
- Contribution amount.
- Registration limit / participant count.
- Contribution frequency: daily, weekly, monthly, or yearly.
- Frequency interval: every `N` days, weeks, months, or years.
- Automatic first-cycle start immediately after every participant slot has
  completed registration and payment authorization.
- Cycle payment deadline or deadline offset.
- Grace period.
- Reminder frequency, interval, time, and timezone.
- Payout timing:
  - immediately after all contributions are confirmed and funds are available; or
  - at the configured cycle time after all contributions are confirmed.
- Card setup payment/deposit policy.
- Position mode: member-selected for MVP; creator-assigned may be modeled but is optional.
- Explicit strict-cycle/default rule acceptance.

### 7.2 Rule validation

Reject:

- fewer than two participants;
- non-positive amounts;
- cycle deadlines before cycle start;
- reminder cadence outside supported limits;
- impossible schedule definitions;
- grace periods that cause undocumented overlap;
- participant count that does not match payout positions;
- a second open/active Collage in the same chat;
- intervals that cannot be represented safely by the scheduler.

### 7.3 Rule versioning and locking

Before start:

- creator can edit rules;
- material financial changes after members submit details require members to reconfirm;
- payment authorizations may need replacement if the amount, end date, or mandate contract changes;
- every rule version is stored with a deterministic hash and audit record.

After start, lock:

- amount;
- participant limit;
- contribution frequency and interval;
- payout order;
- first-cycle anchor;
- cycle count;
- strict completion rule.

After start, allow controlled edits to:

- reminder cadence;
- non-financial description;
- a member's own payout account;
- a member's own payment method;
- a member's preferred charge period if still inside the cycle window.

## 8. Registration and opt-in

Registration has two mandatory stages. A member does not count toward the registration limit until both are complete.

### 8.1 Stage A: identity, payout, and schedule details

Collect:

- full legal name;
- NIN;
- phone number;
- payout bank;
- payout account number;
- resolved official account name;
- selected available payout position;
- preferred automatic charge period;
- explicit recurring-payment consent;
- acceptance of the exact Collage rule version;
- acknowledgement that leaving Telegram does not cancel obligations.

NIN, phone number, and account number are sensitive.
Encrypt at rest, return only masked representations, and never post them in a
group. Phone possession and OTP verification are not registration gates; the
phone number itself remains required for direct-debit provider compatibility.

### 8.2 Preferred charge period

The Collage defines the cycle. The contributor chooses a permitted first-attempt point within it.

#### Daily Collage

Select time of day.

#### Weekly Collage

Select day of week and time of day.

#### Monthly Collage

Select week of month — first, second, third, fourth, or last — plus weekday and time. The weekday may default from the Collage start anchor but must remain explicit in stored data.

#### Yearly Collage

Select month of year, day of month, and time. The day may default from the start anchor but must be shown before confirmation.

All schedules use the Collage timezone. The resulting attempt must fall after cycle opening and before its deadline. Invalid calendar dates must follow an explicit documented normalization rule rather than silent guessing.

### 8.3 Stage B: payment authorization

After Stage A, show:

> **Complete registration for [Collage name]**
>
> Your details for **[Collage name]** in **[Telegram group]** have been saved. You are not fully registered yet.
>
> Authorize a payment method for automatic contributions of **[amount and frequency]**.

Options:

- Authorize card.
- Set up bank direct debit.

### 8.4 Resume behavior

When a user taps Join Collage again, the backend decides the route:

- no registration: show Stage A;
- details submitted: show payment-method requirement;
- card/mandate authorization pending: show Continue Authorization and Choose Another Method;
- recurring payment skipped: complete registration and explain that each cycle
  requires a verified hosted-checkout payment;
- fully registered: show summary and management actions;
- Collage full/registration closed: show unavailable state;
- already registered: never create another membership.

Financial-detail actions are driven by current server state:

- no verified payout account: show **Add payout account**;
- verified payout account exists: show **Update payout account**;
- no active payment method: show **Add payment method**;
- authorization is pending: show **Continue payment setup**;
- active payment method exists: show **Replace payment method**.

The backend rejects an add request when an active method exists, rejects a
replacement when none exists, and permits at most one authorizing method per
member.

Every screen repeats Collage name, group, amount/frequency, and relevant cycle or position.

### 8.5 Card setup

Card tokenization requires a successful first card payment. Support a configurable setup policy:

- small commitment deposit credited toward the first cycle;
- first contribution paid in advance; or
- explicit sandbox simulation for development/demo where the provider cannot return a real token.

After server-side verification confirms success and reusable-card capability:

- store the production token encrypted on the server;
- never expose it to the Mini App;
- mark the payment method active;
- complete registration exactly once.

### 8.6 Direct-debit setup

Create a mandate and return the provider authorization URL to the individual Mini App session.

Registration remains `PAYMENT_METHOD_AUTHORIZING` while the mandate is pending authorization or activation. Only an activated mandate completes registration. Expired, failed, suspended, or cancelled mandates do not.

### 8.7 Registration completion notification

When payment authorization becomes active, or a member explicitly completes
manual-payment registration, the backend emits a notification exactly once:

> ✅ **@Member has joined [Collage name]**
>
> Position: **4**
> Registered contributors: **6 of 10**
> Remaining slots: **4**

Never show NIN, phone, account number, provider references, token details, or payment failure reason.

### 8.8 Registration concurrency

Database constraints and transactions must guarantee:

- one membership per Telegram user per Collage;
- one member per payout position;
- participant count cannot exceed the limit;
- position reservations expire after a configured authorization window if payment setup is not completed;
- completing registration is idempotent;
- concurrent completion cannot start the Collage twice.

## 9. Automatic start

When the fully registered count reaches the registration limit:

1. acquire a Collage-level database lock;
2. verify every position is filled exactly once;
3. verify every member accepted the current rule version;
4. verify every member either has an active recurring payment method or has
   explicitly selected manual hosted-checkout payments;
5. freeze rules and order;
6. create all cycle records;
7. assign each cycle recipient by payout position;
8. calculate expected dates and amounts;
9. open Cycle 1;
10. schedule member charge jobs;
11. update the pinned message;
12. post a start notification.

This transition must happen exactly once even when the last slot is completed
concurrently by provider webhooks and manual registrations. The resulting
group message includes a Pay now button.

## 10. Collection flow

### 10.1 Automatic attempt

At the member's calculated preferred charge time:

1. load and lock the cycle contribution;
2. verify Collage/cycle states;
3. exit if already paid;
4. requery if an unresolved provider attempt exists;
5. select the current active payment method;
6. create a unique provider reference;
7. initiate token charge or mandate debit;
8. store the attempt and normalized status;
9. verify asynchronously through webhook and/or status query;
10. notify the group only after a final failure is confirmed.

If a registered member has no active card token or direct-debit mandate, the
worker does not create a fake provider attempt. It marks that contribution as
manual-payment-required. One group reminder is built from current database
state, safely mentions all members who owe and have no unresolved provider
operation, and includes one **Pay now** button.

The button opens the Mini App for the current Collage. For an authorized owing
member, the Mini App requests a server-created Monnify hosted checkout and
redirects to the returned checkout URL. Redirect return is pending-only;
payment is credited exclusively after a verified provider webhook or
server-side status reconciliation matches reference, amount, and currency.

### 10.2 Verified success

When status, currency, amount, member, Collage, and cycle all match:

- mark the cycle contribution paid once;
- write balanced ledger entries;
- update cycle totals;
- emit a payment-confirmed event;
- privately acknowledge the member where allowed;
- update the pinned status;
- evaluate whether the cycle is ready for payout.

Automatic success should not flood the group. A manually initiated payment may receive a concise group acknowledgement.

### 10.3 Confirmed failure

Post:

> ⚠️ **Payment attention required**
>
> @Member, Collage could not complete your **₦X** contribution for **[Collage name] — Cycle N**.
>
> Complete payment before **[deadline]**.

Button:

- Complete payment

Do not disclose “insufficient funds,” account restriction, or any private provider reason in the group.

### 10.4 Retry strategy

- Retry only according to normalized provider status and documented limits.
- A network timeout is unknown/pending, not failed.
- Requery the original reference before another provider call.
- Store every attempt separately beneath one deterministic cycle obligation.
- Respect direct-debit daily attempt limits.
- Use manual checkout as fallback.
- A verified manual payment fulfills the same obligation and cancels unnecessary retries.

### 10.5 Manual payment

The group button opens a Mini App direct link with an opaque, expiring action token.

The screen displays:

- Collage and group;
- cycle number and recipient;
- expected amount;
- deadline;
- current member status.

Before creating a payment URL, backend verifies:

- signed Telegram Mini App identity;
- launch token action, Collage, chat, and expiry;
- active membership;
- current cycle;
- unpaid obligation;
- absence of an unresolved attempt that may still settle.

The return redirect never marks payment successful. Provider verification/webhook does.

## 11. Reminder behavior

If no reminder schedule is configured, default to once daily at a configured group time.

At reminder time:

1. fetch unpaid members;
2. omit members whose provider attempt is still unresolved;
3. send one group message;
4. mention all owing members in that message;
5. attach one Complete Payment button;
6. update the pinned status;
7. send nothing when everyone is paid.

## 12. Strict cycle, defaulters, and blocked state

### 12.1 Completion rule

A cycle transitions:

`COLLECTING -> READY_FOR_PAYOUT -> PAYOUT_PROCESSING -> COMPLETED`

Only when:

- every required member contribution is verified paid;
- the ledger and expected amount reconcile;
- the payout succeeds.

The next cycle does not open before current cycle completion.

### 12.2 Deadlock protection

Each Collage has:

- cycle deadline;
- grace period;
- maximum automatic attempts;
- manual-payment window.

After grace expires with an unpaid obligation:

- cycle becomes `BLOCKED_BY_DEFAULT`;
- payout is not initiated;
- next cycle is not opened;
- the group gets a factual notice;
- the contributor remains obligated;
- group admin may request retry or reconciliation but cannot mark paid.

The MVP does not promise platform-funded coverage.

### 12.3 Member leaves the Telegram group

Telegram group membership and Collage membership are separate.

When a registered member leaves:

- mark their Telegram chat membership as left;
- keep Collage membership and payment authorization active;
- keep future obligations;
- calculate outstanding obligation;
- flag the member at risk;
- notify the group without sensitive data;
- continue authorized scheduled attempts;
- privately message only if Telegram permits.

If the member has received an early payout, include the outstanding future obligation amount in the factual group notification.

## 13. Payout flow

When all contributions are confirmed:

1. acquire a cycle/payout lock;
2. reconcile cycle contributions and ledger;
3. verify recipient and payout account;
4. rerun name enquiry if account data changed or is stale;
5. ensure there is no unresolved payout attempt;
6. create an immutable payout and unique transfer reference;
7. post “payout processing”;
8. initiate Monnify single transfer;
9. handle pending/MFA states according to environment configuration;
10. wait for definite success, failure, reversal, or expiry;
11. write ledger changes according to the final economic event;
12. notify the group;
13. complete the cycle or expose a safe retry path.

### 13.1 Successful payout

> 🎉 **Payout completed**
>
> @Recipient has received **₦X** for **[Collage name] — Cycle N**.
>
> Next recipient: **@NextMember**

### 13.2 Failed payout

> ❌ **Payout needs attention**
>
> @Recipient, the payout for **[Collage name] — Cycle N** could not be completed.
>
> The cycle remains open and the funds remain accounted for in the Collage pot.

Button:

- Review payout account and retry

The recipient may validate a new account, choose whether to save it for future payouts, and request retry only after the original payout is definitely failed, reversed, or expired. Pending and in-progress transfers are requeried, never duplicated.

## 14. Updating financial details

### 14.1 Payout account

- validate bank/account and display resolved name;
- require explicit confirmation;
- encrypt account number;
- preserve previous version for audit;
- apply only to future attempts;
- never mutate a completed payout.

### 14.2 Payment method

Do not deactivate the old method when replacement starts.

- old method stays active;
- new method is authorizing;
- only after the new one activates does old become replaced;
- if new setup expires/fails, old remains active;
- block unsafe replacement during an unresolved current-cycle charge.

## 15. Mini App UX requirements

Every screen has a persistent context header showing:

- Collage name;
- Telegram group;
- amount/frequency;
- cycle and recipient when active;
- user's position when registered.

Every financial confirmation repeats the amount, action, Collage, and cycle.

Required UI states:

- Telegram SDK boot;
- authentication and launch-token resolution;
- structural loading skeletons;
- empty;
- form validation/submission;
- provider redirect creation;
- authorization/payment/payout pending;
- success confirmed by server;
- retryable error;
- terminal error;
- offline/network issue;
- expired launch link;
- unauthorized/non-member;
- registration full;
- already paid;
- payout in progress.

Never use optimistic UI to claim registration, payment authorization, contribution payment, or payout success.

## 16. Notifications catalogue

The bot sends or edits messages for:

- installation and missing permissions;
- create Collage;
- registration opened;
- member registration completed;
- Collage started;
- status refresh;
- failed charge;
- manual payment confirmed;
- reminder for all owing members;
- registered member left;
- overdue/blocked cycle;
- payout processing, success, failure, or reversal;
- payment method invalid/expiring, preferably private;
- Collage completed.

All messages identify the Collage. Active-cycle messages identify the cycle.

## 17. Financial ledger

The provider wallet may contain funds for several Collages. Therefore:

- never display provider wallet balance as group pot;
- maintain an append-only balanced double-entry ledger;
- use integer minor units, never JavaScript floating-point math;
- make ledger entries immutable;
- use compensating entries for corrections/reversals;
- link every economic event to domain entity, provider reference, and audit record;
- reconcile cycle expected and collected amounts before payout.

Suggested account families:

- provider cash/clearing asset;
- Collage pot liability;
- payment clearing;
- payout clearing;
- fee expense;
- optional member receivable/outstanding obligation.

## 18. Privacy and data

- Encrypt NIN, phone, account number, card token, and sensitive mandate values.
- Store deterministic keyed hashes only where duplicate lookup is required.
- Mask all sensitive values in client DTOs.
- Redact request/response/log paths.
- Do not send sensitive data to analytics or error monitoring.
- Use explicit data-retention/deletion policy.
- Sandbox identity verification must be visibly labeled as mocked.
- OTP is behind a provider interface implemented by SMSGate. Development may
  use the Android Local Server or public cloud; production requires a private
  HTTPS SMSGate server.

## 19. Auditability

Audit:

- rule creation, change, reconfirmation, and lock;
- registration stages and verification results;
- payout-position assignment;
- payment-method activation/replacement;
- bank-account update;
- every charge and payout attempt/status;
- manual-payment initialization;
- Telegram member-left event;
- blocked/default state;
- reconciliation correction.

Audit records are append-only and include actor, action, entity, safe metadata, timestamp, correlation ID, and source.

## 20. Acceptance summary

The MVP is acceptable when a reviewer can demonstrate:

1. bot addition/tagging;
2. Mini App Collage creation by a group admin;
3. pinned registration status;
4. multi-step member registration;
5. card or direct-debit authorization;
6. exactly-once registration announcement;
7. exactly-once automatic start when all slots are fully registered;
8. member-specific scheduled charges;
9. successful auto collection without group spam;
10. confirmed failure with member mention and manual-pay button;
11. duplicate attempts do not duplicate the obligation;
12. strict cycle waits for everyone;
13. payout is initiated once;
14. success completes the cycle and opens the next;
15. failure provides safe account update and retry;
16. leaving the group preserves obligations;
17. ledger reconciles every financial event;
18. all apps start through documented Docker Compose commands.
