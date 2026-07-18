import { DomainInvariantError } from "./errors.js";

export const collageStates = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "STARTING",
  "ACTIVE",
  "BLOCKED",
  "COMPLETED",
  "SUSPENDED",
  "CANCELLED",
] as const;
export type CollageState = (typeof collageStates)[number];

export const memberStates = [
  "NOT_STARTED",
  "DETAILS_SUBMITTED",
  "IDENTITY_PENDING",
  "IDENTITY_FAILED",
  "PAYMENT_METHOD_REQUIRED",
  "PAYMENT_METHOD_AUTHORIZING",
  "REGISTERED",
  "AT_RISK",
  "DELINQUENT",
  "DEFAULTED",
  "CANCELLED_BEFORE_START",
] as const;
export type MemberState = (typeof memberStates)[number];

export const paymentMethodStates = [
  "AUTHORIZING",
  "ACTIVE",
  "FAILED",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
  "REPLACED",
] as const;
export type PaymentMethodState = (typeof paymentMethodStates)[number];

export const cycleStates = [
  "SCHEDULED",
  "COLLECTING",
  "OVERDUE",
  "BLOCKED_BY_DEFAULT",
  "READY_FOR_PAYOUT",
  "PAYOUT_PROCESSING",
  "COMPLETED",
] as const;
export type CycleState = (typeof cycleStates)[number];

export const contributionStates = [
  "SCHEDULED",
  "CHARGE_PENDING",
  "PAID",
  "FAILED_RETRYABLE",
  "MANUAL_PAYMENT_REQUIRED",
  "OVERDUE",
  "DEFAULTED",
  "REVERSED",
] as const;
export type ContributionState = (typeof contributionStates)[number];

export const payoutStates = [
  "READY",
  "PROCESSING",
  "PENDING_AUTHORIZATION",
  "IN_PROGRESS",
  "SUCCESSFUL",
  "FAILED",
  "REVERSED",
  "EXPIRED",
] as const;
export type PayoutState = (typeof payoutStates)[number];

type TransitionMap<State extends string> = Readonly<
  Record<State, readonly State[]>
>;

const collageTransitions: TransitionMap<CollageState> = {
  DRAFT: ["REGISTRATION_OPEN", "CANCELLED"],
  REGISTRATION_OPEN: ["STARTING", "SUSPENDED", "CANCELLED"],
  STARTING: ["ACTIVE", "BLOCKED", "SUSPENDED"],
  ACTIVE: ["BLOCKED", "COMPLETED", "SUSPENDED"],
  BLOCKED: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  COMPLETED: [],
  SUSPENDED: ["REGISTRATION_OPEN", "ACTIVE", "BLOCKED", "CANCELLED"],
  CANCELLED: [],
};

const memberTransitions: TransitionMap<MemberState> = {
  NOT_STARTED: ["DETAILS_SUBMITTED", "CANCELLED_BEFORE_START"],
  DETAILS_SUBMITTED: [
    "IDENTITY_PENDING",
    "PAYMENT_METHOD_REQUIRED",
    "CANCELLED_BEFORE_START",
  ],
  IDENTITY_PENDING: [
    "IDENTITY_FAILED",
    "PAYMENT_METHOD_REQUIRED",
    "CANCELLED_BEFORE_START",
  ],
  IDENTITY_FAILED: ["IDENTITY_PENDING", "CANCELLED_BEFORE_START"],
  PAYMENT_METHOD_REQUIRED: [
    "PAYMENT_METHOD_AUTHORIZING",
    "CANCELLED_BEFORE_START",
  ],
  PAYMENT_METHOD_AUTHORIZING: [
    "REGISTERED",
    "PAYMENT_METHOD_REQUIRED",
    "CANCELLED_BEFORE_START",
  ],
  REGISTERED: ["AT_RISK", "DELINQUENT", "DEFAULTED"],
  AT_RISK: ["REGISTERED", "DELINQUENT", "DEFAULTED"],
  DELINQUENT: ["REGISTERED", "DEFAULTED"],
  DEFAULTED: ["DELINQUENT", "REGISTERED"],
  CANCELLED_BEFORE_START: [],
};

const paymentMethodTransitions: TransitionMap<PaymentMethodState> = {
  AUTHORIZING: ["ACTIVE", "FAILED", "EXPIRED", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "CANCELLED", "REPLACED"],
  FAILED: [],
  EXPIRED: [],
  SUSPENDED: ["ACTIVE", "CANCELLED", "REPLACED"],
  CANCELLED: [],
  REPLACED: [],
};

const cycleTransitions: TransitionMap<CycleState> = {
  SCHEDULED: ["COLLECTING"],
  COLLECTING: ["OVERDUE", "READY_FOR_PAYOUT"],
  OVERDUE: ["COLLECTING", "BLOCKED_BY_DEFAULT", "READY_FOR_PAYOUT"],
  BLOCKED_BY_DEFAULT: ["COLLECTING", "READY_FOR_PAYOUT"],
  READY_FOR_PAYOUT: ["PAYOUT_PROCESSING"],
  PAYOUT_PROCESSING: ["READY_FOR_PAYOUT", "COMPLETED"],
  COMPLETED: [],
};

const contributionTransitions: TransitionMap<ContributionState> = {
  SCHEDULED: ["CHARGE_PENDING", "MANUAL_PAYMENT_REQUIRED", "OVERDUE"],
  CHARGE_PENDING: [
    "PAID",
    "FAILED_RETRYABLE",
    "MANUAL_PAYMENT_REQUIRED",
    "REVERSED",
  ],
  PAID: ["REVERSED"],
  FAILED_RETRYABLE: [
    "CHARGE_PENDING",
    "PAID",
    "MANUAL_PAYMENT_REQUIRED",
    "OVERDUE",
  ],
  MANUAL_PAYMENT_REQUIRED: ["CHARGE_PENDING", "PAID", "OVERDUE", "DEFAULTED"],
  OVERDUE: ["CHARGE_PENDING", "PAID", "DEFAULTED"],
  DEFAULTED: ["PAID"],
  REVERSED: ["CHARGE_PENDING", "MANUAL_PAYMENT_REQUIRED", "OVERDUE"],
};

const payoutTransitions: TransitionMap<PayoutState> = {
  READY: ["PROCESSING"],
  PROCESSING: [
    "PENDING_AUTHORIZATION",
    "IN_PROGRESS",
    "SUCCESSFUL",
    "FAILED",
    "EXPIRED",
  ],
  PENDING_AUTHORIZATION: ["IN_PROGRESS", "SUCCESSFUL", "FAILED", "EXPIRED"],
  IN_PROGRESS: ["SUCCESSFUL", "FAILED", "REVERSED", "EXPIRED"],
  SUCCESSFUL: ["REVERSED"],
  FAILED: ["PROCESSING"],
  REVERSED: ["PROCESSING"],
  EXPIRED: ["PROCESSING"],
};

const transition = <State extends string>(
  entity: string,
  map: TransitionMap<State>,
  from: State,
  to: State,
): State => {
  if (from === to) {
    return from;
  }
  if (!map[from].includes(to)) {
    throw new DomainInvariantError(
      "INVALID_STATE_TRANSITION",
      `${entity} cannot transition from ${from} to ${to}.`,
    );
  }
  return to;
};

export const transitionCollage = (
  from: CollageState,
  to: CollageState,
): CollageState => transition("Collage", collageTransitions, from, to);

export const transitionMember = (
  from: MemberState,
  to: MemberState,
): MemberState => transition("Member", memberTransitions, from, to);

export const transitionPaymentMethod = (
  from: PaymentMethodState,
  to: PaymentMethodState,
): PaymentMethodState =>
  transition("PaymentMethod", paymentMethodTransitions, from, to);

export const transitionCycle = (from: CycleState, to: CycleState): CycleState =>
  transition("Cycle", cycleTransitions, from, to);

export const transitionContribution = (
  from: ContributionState,
  to: ContributionState,
): ContributionState =>
  transition("Contribution", contributionTransitions, from, to);

export const transitionPayout = (
  from: PayoutState,
  to: PayoutState,
): PayoutState => transition("Payout", payoutTransitions, from, to);
