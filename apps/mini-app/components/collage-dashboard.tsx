"use client";
/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/restrict-template-expressions */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  History,
  Landmark,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError, createIdempotencyKey, json, putJson } from "../lib/api";
import { formatDate, formatMoney, terminalPaymentStates } from "../lib/format";
import {
  banksSchema,
  historySchema,
  manualSetupSchema,
  paymentAttemptSchema,
  paymentSetupSchema,
  resolvedAccountSchema,
  type Collage,
  type Registration,
  type ResolvedAccount,
  type Status,
} from "../lib/schemas";
import { useApi } from "./providers";
import { RegistrationFlow } from "./registration-flow";
import {
  AsyncButton,
  Button,
  ContextHeader,
  Field,
  Input,
  Money,
  ProviderPendingState,
  Select,
  StatePage,
  StatusBadge,
} from "./ui";

const maxAutomaticProviderPolls = 150;

type DashboardTab = "history" | "overview" | "settings";

export function CollageDashboard({
  status,
  action,
  registration,
}: {
  readonly status: Status;
  readonly action: string;
  readonly registration: Registration;
}): JSX.Element {
  const hasMember = "id" in registration;
  const hasPayoutAccount =
    hasMember &&
    (registration.bankAccounts ?? []).some(
      (account) => account.state === "VERIFIED",
    );
  const hasActivePaymentMethod =
    hasMember &&
    (registration.paymentMethods ?? []).some(
      (method) => method.state === "ACTIVE",
    );
  const hasPendingPaymentMethod =
    hasMember &&
    (registration.paymentMethods ?? []).some(
      (method) => method.state === "AUTHORIZING",
    );
  const readyForPaymentMethod =
    hasMember &&
    registration.payoutPosition !== null &&
    registration.acceptedRuleVersionId != null &&
    registration.recurringConsentAt != null &&
    hasPayoutAccount;
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [operation, setOperation] = useState<
    "manual" | "payout-account" | "payment-method" | "registration" | null
  >(
    action === "JOIN_COLLAGE"
      ? "registration"
      : action === "PAY_CONTRIBUTION"
        ? "manual"
        : action === "UPDATE_PAYOUT_ACCOUNT"
          ? "payout-account"
          : action === "REPLACE_PAYMENT_METHOD"
            ? "payment-method"
            : null,
  );
  if (operation === "registration")
    return (
      <RegistrationFlow
        collage={status.collage}
        initialRegistration={registration}
      />
    );
  if (operation === "manual")
    return (
      <ManualPaymentFlow
        collage={status.collage}
        cycle={status.currentCycle}
        onClose={() => setOperation(null)}
      />
    );
  if (operation === "payout-account")
    return (
      <UpdatePayoutAccountFlow
        existing={hasPayoutAccount}
        collage={status.collage}
        onClose={() => setOperation(null)}
      />
    );
  if (operation === "payment-method")
    return (
      <ReplacePaymentMethodFlow
        replace={hasActivePaymentMethod}
        collage={status.collage}
        onClose={() => setOperation(null)}
      />
    );

  return (
    <>
      <ContextHeader
        collage={status.collage}
        cycle={status.currentCycle?.number}
        detail={
          status.currentCycle === null
            ? `${registeredCount(status)} of ${status.collage.participantLimit} registered`
            : `Recipient: payout position ${status.currentCycle.number} · Due ${formatDate(status.currentCycle.deadlineAt)}`
        }
      />
      <nav className="tabs" aria-label="Collage sections">
        {(["overview", "history", "settings"] as const).map((value) => (
          <button
            aria-current={tab === value ? "page" : undefined}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <Overview
          onJoin={() => setOperation("registration")}
          onManual={() => setOperation("manual")}
          registration={registration}
          status={status}
        />
      ) : null}
      {tab === "history" ? <CollageHistory collage={status.collage} /> : null}
      {tab === "settings" ? (
        <section className="operation-list">
          <h2>Your financial details</h2>
          {!hasMember ||
          (!readyForPaymentMethod &&
            !hasActivePaymentMethod &&
            !hasPendingPaymentMethod) ? (
            <button onClick={() => setOperation("registration")} type="button">
              <Users aria-hidden="true" />
              <span>
                <strong>
                  {hasMember ? "Continue your opt-in" : "Opt in as a member"}
                </strong>
                <small>Complete your required member details securely</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setOperation("payout-account")}
                type="button"
              >
                <Landmark aria-hidden="true" />
                <span>
                  <strong>
                    {hasPayoutAccount
                      ? "Update payout account"
                      : "Add payout account"}
                  </strong>
                  <small>
                    {hasPayoutAccount
                      ? "Validate a new future payout destination"
                      : "Add and validate your payout destination"}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
              <button
                onClick={() =>
                  setOperation(
                    hasPendingPaymentMethod ? "registration" : "payment-method",
                  )
                }
                type="button"
              >
                <CreditCard aria-hidden="true" />
                <span>
                  <strong>
                    {hasActivePaymentMethod
                      ? "Replace payment method"
                      : hasPendingPaymentMethod
                        ? "Continue payment setup"
                        : "Add payment method"}
                  </strong>
                  <small>
                    {hasActivePaymentMethod
                      ? "The current method remains active during setup"
                      : hasPendingPaymentMethod
                        ? "Finish the pending provider authorization"
                        : "Authorize a method for automatic contributions"}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

function Overview({
  status,
  onManual,
  onJoin,
  registration,
}: {
  readonly status: Status;
  readonly onManual: () => void;
  readonly onJoin: () => void;
  readonly registration: Registration;
}): JSX.Element {
  const cycle = status.currentCycle;
  if (cycle === null) {
    return (
      <section className="overview">
        <div className="registration-meter">
          <div>
            <p className="eyebrow">Registration progress</p>
            <strong>
              {registeredCount(status)} / {status.collage.participantLimit}
            </strong>
          </div>
          <Users aria-hidden="true" size={25} />
        </div>
        <div
          aria-label={`${registeredCount(status)} of ${status.collage.participantLimit} members registered`}
          aria-valuemax={status.collage.participantLimit}
          aria-valuemin={0}
          aria-valuenow={registeredCount(status)}
          className="progress"
          role="progressbar"
        >
          <span
            style={{
              width: `${String(
                Math.min(
                  100,
                  (registeredCount(status) / status.collage.participantLimit) *
                    100,
                ),
              )}%`,
            }}
          />
        </div>
        <p className="page-copy">
          {status.collage.participantLimit - registeredCount(status)} places
          remain. The Collage starts only after every position and payment
          method is confirmed.
        </p>
        {registration.state === "REGISTERED" ? null : (
          <Button onClick={onJoin} type="button">
            {"id" in registration
              ? "Continue your opt-in"
              : "Opt in as a member"}
          </Button>
        )}
      </section>
    );
  }
  const confirmedMinor = BigInt(cycle.confirmedAmountMinor);
  const expectedMinor = BigInt(cycle.expectedAmountMinor);
  const boundedConfirmed =
    confirmedMinor > expectedMinor ? expectedMinor : confirmedMinor;
  const paidPercent =
    expectedMinor === 0n
      ? 0
      : Number((boundedConfirmed * 10_000n) / expectedMinor) / 100;
  const blocked = cycle.state === "BLOCKED_BY_DEFAULT";
  return (
    <section className="overview">
      <div className="cycle-head">
        <div>
          <p className="eyebrow">Current cycle amount</p>
          <Money
            label="Contribution amount"
            minor={cycle.amountPerMemberMinor}
          />
        </div>
        <StatusBadge tone={blocked ? "danger" : "active"}>
          {blocked ? <ShieldAlert aria-hidden="true" size={15} /> : null}
          {cycle.state.replaceAll("_", " ").toLowerCase()}
        </StatusBadge>
      </div>
      <dl className="financial-grid">
        <div>
          <dt>Confirmed pot</dt>
          <dd>{formatMoney(cycle.confirmedAmountMinor)}</dd>
        </div>
        <div>
          <dt>Expected pot</dt>
          <dd>{formatMoney(cycle.expectedAmountMinor)}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd>Position {cycle.number}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{formatDate(cycle.deadlineAt)}</dd>
        </div>
      </dl>
      <div
        aria-label={`${Math.round(paidPercent)} percent of pot confirmed`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(paidPercent)}
        className="progress"
        role="progressbar"
      >
        <span style={{ width: `${String(paidPercent)}%` }} />
      </div>
      {blocked ? (
        <div className="attention-note">
          This strict cycle is blocked by an outstanding contribution. No payout
          or next cycle can begin.
        </div>
      ) : null}
      <Button onClick={onManual} type="button">
        <Banknote aria-hidden="true" size={19} />
        Review my contribution
      </Button>
    </section>
  );
}

function CollageHistory({
  collage,
}: {
  readonly collage: Collage;
}): JSX.Element {
  const { api } = useApi();
  const history = useQuery({
    queryKey: ["history", collage.id],
    queryFn: () =>
      api.request(`/collages/${collage.id}/history`, historySchema),
  });
  if (history.isLoading)
    return <div className="inline-loading">Loading cycle history…</div>;
  if (history.isError)
    return (
      <StatePage
        action={
          <Button onClick={() => void history.refetch()} type="button">
            Retry history
          </Button>
        }
        description="Previously loaded Collage status remains safe to view."
        title="History is unavailable"
        variant="error"
      />
    );
  if (history.data?.length === 0)
    return (
      <div className="empty-panel">
        <History aria-hidden="true" />
        <h2>No completed cycles yet</h2>
        <p>Cycle outcomes will appear only after server-confirmed payout.</p>
      </div>
    );
  return (
    <section className="history-list">
      <h2>Cycle history</h2>
      {history.data?.map((cycle) => (
        <article key={cycle.id}>
          <span className="history-list__number">{cycle.number}</span>
          <div>
            <strong>Cycle {cycle.number}</strong>
            <p>
              {formatDate(cycle.opensAt)} ·{" "}
              {formatMoney(cycle.expectedAmountMinor)}
            </p>
          </div>
          <StatusBadge
            tone={cycle.state === "COMPLETED" ? "success" : "attention"}
          >
            {cycle.state.toLowerCase()}
          </StatusBadge>
        </article>
      ))}
    </section>
  );
}

const emailSchema = z.object({ customerEmail: z.email() });
type EmailInput = z.infer<typeof emailSchema>;

function ManualPaymentFlow({
  collage,
  cycle,
  onClose,
}: {
  readonly collage: Collage;
  readonly cycle: Status["currentCycle"];
  readonly onClose: () => void;
}): JSX.Element {
  const { api } = useApi();
  const attemptStorageKey = `collage-manual-attempt:${collage.id}:${String(cycle?.number ?? "none")}`;
  const [attemptId, setAttemptId] = useState<string | null>(() =>
    window.sessionStorage.getItem(attemptStorageKey),
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number>();
  const setup = useMutation({
    mutationFn: () =>
      api.request(
        `/collages/${collage.id}/cycles/current/payments/manual`,
        manualSetupSchema,
        json({}),
      ),
    onSuccess: (result) => {
      setAttemptId(result.attemptId);
      window.sessionStorage.setItem(attemptStorageKey, result.attemptId);
      if (result.checkoutUrl !== null)
        window.location.assign(result.checkoutUrl);
    },
  });
  const startCheckout = setup.mutate;
  useEffect(() => {
    if (
      cycle !== null &&
      attemptId === null &&
      !setup.isPending &&
      !setup.isError
    ) {
      startCheckout();
    }
  }, [attemptId, cycle, setup.isError, setup.isPending, startCheckout]);
  const attempt = useQuery({
    queryKey: ["payment-attempt", attemptId],
    queryFn: async () => {
      if (attemptId === null) throw new Error("Attempt is missing");
      const result = await api.request(
        `/payment-attempts/${attemptId}`,
        paymentAttemptSchema,
      );
      setLastCheckedAt(Date.now());
      return result;
    },
    enabled: attemptId !== null,
    refetchInterval: (query) =>
      (query.state.data !== undefined &&
        terminalPaymentStates.has(query.state.data.state)) ||
      query.state.dataUpdateCount >= maxAutomaticProviderPolls
        ? false
        : 4_000,
  });
  if (cycle === null)
    return (
      <StatePage
        action={<Button onClick={onClose}>Back to Collage</Button>}
        description="There is no open cycle contribution for this Collage."
        title="Nothing is due"
        variant="success"
      />
    );
  if (attempt.data?.state === "SUCCEEDED")
    return (
      <>
        <ContextHeader
          collage={collage}
          cycle={cycle.number}
          detail={`Recipient: payout position ${cycle.number}`}
        />
        <StatePage
          action={<Button onClick={onClose}>View current cycle</Button>}
          description={`${formatMoney(attempt.data.amountMinor)} was confirmed by the server for ${collage.name}, Cycle ${cycle.number}.`}
          title="Contribution confirmed"
          variant="success"
        />
      </>
    );
  if (
    attempt.data !== undefined &&
    terminalPaymentStates.has(attempt.data.state)
  )
    return (
      <StatePage
        action={
          <Button
            onClick={() => {
              window.sessionStorage.removeItem(attemptStorageKey);
              setAttemptId(null);
              setup.reset();
            }}
            type="button"
          >
            Start a new checkout
          </Button>
        }
        description="The previous checkout reached a final unsuccessful state. Collage did not record a payment."
        title="Checkout was not completed"
        variant="error"
      />
    );
  if (attempt.isError)
    return (
      <StatePage
        action={
          <Button onClick={() => void attempt.refetch()} type="button">
            Check again
          </Button>
        }
        description={
          attempt.error instanceof ApiError
            ? attempt.error.message
            : "Collage could not load the payment attempt. No payment was recorded."
        }
        title="Payment status unavailable"
        variant="error"
      />
    );
  if (attemptId !== null)
    return (
      <ProviderPendingState
        amountMinor={cycle.amountPerMemberMinor}
        collage={collage}
        cycle={cycle.number}
        lastCheckedAt={lastCheckedAt}
        onRecheck={() => {
          void api.request(
            `/payment-attempts/${attemptId}/recheck`,
            z.object({ queued: z.boolean(), eventId: z.string() }),
            { method: "POST" },
          );
          void attempt.refetch();
        }}
      />
    );
  if (setup.isError)
    return (
      <StatePage
        action={
          <Button onClick={() => setup.reset()} type="button">
            Try checkout again
          </Button>
        }
        description={
          setup.error instanceof ApiError
            ? setup.error.message
            : "Collage could not prepare a secure checkout. No payment was recorded."
        }
        title="Checkout could not be prepared"
        variant="error"
      />
    );
  return (
    <>
      <ContextHeader
        collage={collage}
        cycle={cycle.number}
        detail={`Recipient: payout position ${cycle.number} · Due ${formatDate(cycle.deadlineAt)}`}
      />
      <div className="flow">
        <div className="flow-heading">
          <Banknote aria-hidden="true" size={22} />
          <div>
            <h2>Complete this contribution manually</h2>
            <p>
              Collage first confirms there is no unresolved attempt that could
              still settle.
            </p>
          </div>
        </div>
        <dl className="summary-list">
          <Summary term="Collage" value={collage.name} />
          <Summary
            term="Group"
            value={collage.chat?.title ?? "Telegram group"}
          />
          <Summary
            term="Cycle / recipient"
            value={`${cycle.number} / position ${cycle.number}`}
          />
          <Summary
            term="Amount"
            value={formatMoney(cycle.amountPerMemberMinor)}
          />
          <Summary term="Source" value="Your provider checkout method" />
        </dl>
        <ProviderPendingState
          amountMinor={cycle.amountPerMemberMinor}
          collage={collage}
          cycle={cycle.number}
          onRecheck={startCheckout}
          title="Preparing your secure checkout"
        />
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </>
  );
}

const accountSchema = z.object({
  bankCode: z.string().min(2),
  accountNumber: z.string().regex(/^\d{10}$/u),
});
type AccountInput = z.infer<typeof accountSchema>;

function UpdatePayoutAccountFlow({
  collage,
  onClose,
  existing,
}: {
  readonly collage: Collage;
  readonly onClose: () => void;
  readonly existing: boolean;
}): JSX.Element {
  const { api } = useApi();
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<ResolvedAccount | null>(null);
  const [draft, setDraft] = useState<AccountInput>();
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    mode: "onBlur",
  });
  const banks = useQuery({
    queryKey: ["banks"],
    queryFn: () => api.request("/banks", banksSchema),
  });
  const resolve = useMutation({
    mutationFn: (value: AccountInput) =>
      api.request("/bank-accounts/resolve", resolvedAccountSchema, json(value)),
    onSuccess: (result, value) => {
      setResolved(result);
      setDraft(value);
    },
  });
  const save = useMutation({
    mutationFn: () => {
      if (draft === undefined || resolved === null)
        throw new Error("Account confirmation is missing");
      return api.request(
        `/collages/${collage.id}/me/payout-account`,
        z
          .object({
            bankName: z.string(),
            maskedAccountNumber: z.string(),
            state: z.string(),
          })
          .loose(),
        putJson({ ...draft, resolutionToken: resolved.resolutionToken }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["registration", collage.id],
      }),
  });
  if (save.isSuccess)
    return (
      <StatePage
        action={<Button onClick={onClose}>Return to Collage</Button>}
        description={`${save.data.bankName} ${save.data.maskedAccountNumber} is now the verified destination for future payout attempts. Completed payouts were not changed.`}
        title={existing ? "Payout account updated" : "Payout account added"}
        variant="success"
      />
    );
  return (
    <>
      <ContextHeader
        collage={collage}
        detail="Future payouts only · completed payouts never change"
      />
      <form
        className="flow"
        onSubmit={form.handleSubmit((value) => resolve.mutate(value))}
      >
        <div className="flow-heading">
          <Landmark aria-hidden="true" size={22} />
          <div>
            <h2>
              {existing
                ? "Update payout destination"
                : "Add payout destination"}
            </h2>
            <p>Resolve and confirm the official account name before saving.</p>
          </div>
        </div>
        <Field label="Bank">
          <Select {...form.register("bankCode")}>
            <option value="">Choose a bank</option>
            {banks.data?.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Account number">
          <Input
            inputMode="numeric"
            maxLength={10}
            {...form.register("accountNumber")}
          />
        </Field>
        {resolved === null ? (
          <AsyncButton
            busy={resolve.isPending}
            busyLabel="Resolving account…"
            type="submit"
          >
            Resolve account
          </AsyncButton>
        ) : (
          <div className="confirmation-block">
            <strong>{resolved.accountName}</strong>
            <span>{resolved.maskedAccountNumber}</span>
            <p>
              Destination: future payouts for {collage.name} in{" "}
              {collage.chat?.title ?? "this Telegram group"}.
            </p>
            <AsyncButton
              busy={save.isPending}
              busyLabel="Saving replacement…"
              onClick={() => save.mutate()}
              type="button"
            >
              {existing ? "Confirm new payout account" : "Add payout account"}
            </AsyncButton>
          </div>
        )}
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </form>
    </>
  );
}

function ReplacePaymentMethodFlow({
  collage,
  onClose,
  replace: isReplacement,
}: {
  readonly collage: Collage;
  readonly onClose: () => void;
  readonly replace: boolean;
}): JSX.Element {
  const { api } = useApi();
  const [pending, setPending] = useState(false);
  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    mode: "onBlur",
  });
  const setup = useMutation({
    mutationFn: (value: EmailInput) =>
      api.request(
        isReplacement
          ? `/collages/${collage.id}/me/payment-methods/replace/card`
          : `/collages/${collage.id}/me/payment-methods/card/setup`,
        paymentSetupSchema,
        json({ ...value, idempotencyKey: createIdempotencyKey() }),
      ),
    onSuccess: (result) => {
      window.sessionStorage.setItem(
        "collage-authorization-id",
        result.authorizationId,
      );
      setPending(true);
      if (result.checkoutUrl !== null && result.checkoutUrl !== undefined)
        window.location.assign(result.checkoutUrl);
    },
  });
  if (pending)
    return (
      <StatePage
        description={
          isReplacement
            ? "The new card is authorizing. Your current payment method remains active until Collage verifies and activates the replacement."
            : "Your card is authorizing. Collage will add it only after the provider payment is verified."
        }
        title={isReplacement ? "Replacement pending" : "Setup pending"}
        variant="pending"
      />
    );
  return (
    <>
      <ContextHeader
        collage={collage}
        detail={
          isReplacement
            ? "Current method remains active during replacement"
            : "No payment method is active yet"
        }
      />
      <form
        className="flow"
        onSubmit={form.handleSubmit((value) => setup.mutate(value))}
      >
        <div className="flow-heading">
          <CreditCard aria-hidden="true" size={22} />
          <div>
            <h2>
              {isReplacement
                ? "Replace saved payment method"
                : "Add payment method"}
            </h2>
            <p>
              {isReplacement
                ? "A pending or failed setup never deactivates your existing method."
                : "The method becomes active only after server-side provider verification."}
            </p>
          </div>
        </div>
        <Field label="Provider email">
          <Input type="email" {...form.register("customerEmail")} />
        </Field>
        <dl className="summary-list">
          <Summary term="Collage" value={collage.name} />
          <Summary
            term="Group"
            value={collage.chat?.title ?? "Telegram group"}
          />
          <Summary
            term="Authorized amount"
            value={formatMoney(collage.contributionAmountMinor)}
          />
          <Summary
            term="Current source"
            value={
              isReplacement ? "Existing method remains active" : "None yet"
            }
          />
        </dl>
        <AsyncButton
          busy={setup.isPending}
          busyLabel={
            isReplacement ? "Creating replacement…" : "Creating setup…"
          }
          type="submit"
        >
          {isReplacement ? "Authorize replacement card" : "Authorize card"}
        </AsyncButton>
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </form>
    </>
  );
}

const registeredCount = (status: Status): number =>
  status.registeredMemberCount;

function Summary({
  term,
  value,
}: {
  readonly term: string;
  readonly value: string;
}): JSX.Element {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}
