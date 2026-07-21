import { DomainInvariantError } from "./errors.js";
import {
  addMoney,
  asMoneyMinor,
  multiplyMoney,
  type MoneyMinor,
} from "./money.js";
import type {
  CollageState,
  ContributionState,
  MemberState,
  PaymentMethodState,
  PayoutState,
} from "./states.js";

export interface RegistrationReadiness {
  readonly acceptedCurrentRuleVersion: boolean;
  readonly activePaymentMethod: boolean;
  readonly identityVerified: boolean;
  readonly payoutAccountVerified: boolean;
  readonly positionAssigned: boolean;
}

export const canCompleteRegistration = (
  readiness: RegistrationReadiness,
): boolean => Object.values(readiness).every(Boolean);

export interface StartReadiness {
  readonly collageState: CollageState;
  readonly participantLimit: number;
  readonly registeredMemberCount: number;
  readonly uniqueFilledPositions: number;
}

export const canStartCollage = (readiness: StartReadiness): boolean =>
  readiness.collageState === "REGISTRATION_OPEN" &&
  readiness.participantLimit >= 2 &&
  readiness.registeredMemberCount === readiness.participantLimit &&
  readiness.uniqueFilledPositions === readiness.participantLimit;

export interface PayoutReadiness {
  readonly contributionStates: readonly ContributionState[];
  readonly cycleExpectedAmount: MoneyMinor;
  readonly ledgerPotBalance: MoneyMinor;
  readonly payoutAccountVerified: boolean;
  readonly unresolvedPayoutAttempt: boolean;
}

export const canInitiatePayout = (readiness: PayoutReadiness): boolean =>
  readiness.contributionStates.length >= 2 &&
  readiness.contributionStates.every((state) => state === "PAID") &&
  readiness.ledgerPotBalance === readiness.cycleExpectedAmount &&
  readiness.payoutAccountVerified &&
  !readiness.unresolvedPayoutAttempt;

export const canRetryPayout = (
  state: PayoutState,
  hasUnresolvedAttempt: boolean,
): boolean =>
  !hasUnresolvedAttempt &&
  (state === "FAILED" || state === "REVERSED" || state === "EXPIRED");

export interface PaymentMethodReplacement {
  readonly currentState: PaymentMethodState;
  readonly replacementState: PaymentMethodState;
  readonly unresolvedCharge: boolean;
}

export type PaymentMethodReplacementDecision =
  | { readonly allowed: false; readonly reason: string }
  | {
      readonly allowed: true;
      readonly deactivateCurrent: boolean;
      readonly nextCurrentState: PaymentMethodState;
    };

export const evaluatePaymentMethodReplacement = (
  input: PaymentMethodReplacement,
): PaymentMethodReplacementDecision => {
  if (input.unresolvedCharge) {
    return {
      allowed: false,
      reason: "An unresolved charge must be reconciled before replacement.",
    };
  }
  if (input.currentState !== "ACTIVE") {
    return {
      allowed: false,
      reason: "Only an active payment method can be replaced.",
    };
  }
  if (input.replacementState === "AUTHORIZING") {
    return {
      allowed: true,
      deactivateCurrent: false,
      nextCurrentState: "ACTIVE",
    };
  }
  if (input.replacementState === "ACTIVE") {
    return {
      allowed: true,
      deactivateCurrent: true,
      nextCurrentState: "REPLACED",
    };
  }
  return {
    allowed: false,
    reason: "Replacement must be authorizing or active.",
  };
};

export const memberStateAfterLeavingTelegram = (
  state: MemberState,
): MemberState => {
  if (state === "REGISTERED") {
    return "AT_RISK";
  }
  return state;
};

export interface OutstandingObligationInput {
  readonly contributionAmount: MoneyMinor;
  readonly totalCycles: number;
  readonly confirmedContributions: number;
  readonly credits: readonly MoneyMinor[];
}

export const calculateOutstandingObligation = (
  input: OutstandingObligationInput,
): MoneyMinor => {
  if (
    !Number.isSafeInteger(input.totalCycles) ||
    !Number.isSafeInteger(input.confirmedContributions) ||
    input.confirmedContributions < 0 ||
    input.confirmedContributions > input.totalCycles
  ) {
    throw new DomainInvariantError(
      "OUTSTANDING_OBLIGATION_INVALID",
      "Contribution counts are inconsistent.",
    );
  }
  const gross = multiplyMoney(
    input.contributionAmount,
    input.totalCycles - input.confirmedContributions,
  );
  const credits = input.credits.reduce(
    (total, credit) => addMoney(total, credit),
    asMoneyMinor(0n),
  );
  return credits >= gross ? asMoneyMinor(0n) : asMoneyMinor(gross - credits);
};
