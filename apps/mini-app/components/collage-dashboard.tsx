"use client";
/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/restrict-template-expressions */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  History,
  Landmark,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useState, type JSX } from "react";
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
  type ResolvedAccount,
  type Status,
} from "../lib/schemas";
import { useApi } from "./providers";
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
}: {
  readonly status: Status;
  readonly action: string;
}): JSX.Element {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [operation, setOperation] = useState<
    "manual" | "payout-account" | "payment-method" | null
  >(
    action === "PAY_CONTRIBUTION"
      ? "manual"
      : action === "UPDATE_PAYOUT_ACCOUNT"
        ? "payout-account"
        : action === "REPLACE_PAYMENT_METHOD"
          ? "payment-method"
          : null,
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
        collage={status.collage}
        onClose={() => setOperation(null)}
      />
    );
  if (operation === "payment-method")
    return (
      <ReplacePaymentMethodFlow
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
        <Overview onManual={() => setOperation("manual")} status={status} />
      ) : null}
      {tab === "history" ? <CollageHistory collage={status.collage} /> : null}
      {tab === "settings" ? (
        <section className="operation-list">
          <h2>Your financial details</h2>
          <button onClick={() => setOperation("payout-account")} type="button">
            <Landmark aria-hidden="true" />
            <span>
              <strong>Update payout account</strong>
              <small>Validate a new future payout destination</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
          <button onClick={() => setOperation("payment-method")} type="button">
            <CreditCard aria-hidden="true" />
            <span>
              <strong>Replace payment method</strong>
              <small>The current method remains active during setup</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        </section>
      ) : null}
    </>
  );
}

function Overview({
  status,
  onManual,
}: {
  readonly status: Status;
  readonly onManual: () => void;
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
  const [attemptId, setAttemptId] = useState<string | null>(() =>
    window.sessionStorage.getItem("collage-manual-attempt-id"),
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number>();
  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    mode: "onBlur",
  });
  const setup = useMutation({
    mutationFn: (value: EmailInput) =>
      api.request(
        `/collages/${collage.id}/cycles/current/payments/manual`,
        manualSetupSchema,
        json({ ...value, idempotencyKey: createIdempotencyKey() }),
      ),
    onSuccess: (result) => {
      setAttemptId(result.attemptId);
      window.sessionStorage.setItem(
        "collage-manual-attempt-id",
        result.attemptId,
      );
      if (result.checkoutUrl !== null)
        window.location.assign(result.checkoutUrl);
    },
  });
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
  return (
    <>
      <ContextHeader
        collage={collage}
        cycle={cycle.number}
        detail={`Recipient: payout position ${cycle.number} · Due ${formatDate(cycle.deadlineAt)}`}
      />
      <form
        className="flow"
        onSubmit={form.handleSubmit((value) => setup.mutate(value))}
      >
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
        <Field
          error={form.formState.errors.customerEmail?.message}
          label="Receipt email"
        >
          <Input type="email" {...form.register("customerEmail")} />
        </Field>
        {setup.error instanceof ApiError &&
        setup.error.code === "NO_PAYABLE_CONTRIBUTION" ? (
          <div className="attention-note">
            This contribution is already paid or no longer payable. Refresh the
            current status before taking another action.
          </div>
        ) : null}
        <AsyncButton
          busy={setup.isPending}
          busyLabel="Checking obligation…"
          type="submit"
        >
          Continue to secure checkout
        </AsyncButton>
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </form>
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
}: {
  readonly collage: Collage;
  readonly onClose: () => void;
}): JSX.Element {
  const { api } = useApi();
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
  });
  if (save.isSuccess)
    return (
      <StatePage
        action={<Button onClick={onClose}>Return to Collage</Button>}
        description={`${save.data.bankName} ${save.data.maskedAccountNumber} is now the verified destination for future payout attempts. Completed payouts were not changed.`}
        title="Payout account updated"
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
            <h2>Update payout destination</h2>
            <p>
              Resolve and confirm the official account name before replacement.
            </p>
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
              Confirm new payout account
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
}: {
  readonly collage: Collage;
  readonly onClose: () => void;
}): JSX.Element {
  const { api } = useApi();
  const [pending, setPending] = useState(false);
  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    mode: "onBlur",
  });
  const replace = useMutation({
    mutationFn: (value: EmailInput) =>
      api.request(
        `/collages/${collage.id}/me/payment-methods/replace/card`,
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
        description="The new card is authorizing. Your current payment method remains active until Collage verifies and activates the replacement."
        title="Replacement pending"
        variant="pending"
      />
    );
  return (
    <>
      <ContextHeader
        collage={collage}
        detail="Current method remains active during replacement"
      />
      <form
        className="flow"
        onSubmit={form.handleSubmit((value) => replace.mutate(value))}
      >
        <div className="flow-heading">
          <CreditCard aria-hidden="true" size={22} />
          <div>
            <h2>Replace saved payment method</h2>
            <p>
              A pending or failed setup never deactivates your existing method.
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
            value="Existing method remains active"
          />
        </dl>
        <AsyncButton
          busy={replace.isPending}
          busyLabel="Creating replacement…"
          type="submit"
        >
          Authorize replacement card
        </AsyncButton>
        <Button onClick={onClose} type="button" variant="ghost">
          Cancel
        </Button>
      </form>
    </>
  );
}

const registeredCount = (status: Status): number =>
  status.memberCounts
    .filter(({ state }) =>
      ["REGISTERED", "AT_RISK", "DELINQUENT", "DEFAULTED"].includes(state),
    )
    .reduce((sum, item) => sum + item._count, 0);

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
