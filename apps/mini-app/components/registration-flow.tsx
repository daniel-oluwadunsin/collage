"use client";
/* eslint-disable @typescript-eslint/no-misused-promises, react-hooks/incompatible-library */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Landmark,
  LockKeyhole,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError, createIdempotencyKey, json, putJson } from "../lib/api";
import {
  formatMoney,
  successfulAuthorizationStates,
  terminalAuthorizationStates,
} from "../lib/format";
import {
  authorizationSchema,
  banksSchema,
  positionsSchema,
  registrationSchema,
  resolvedAccountSchema,
  ruleSchema,
  paymentSetupSchema,
  type Collage,
  type Registration,
  type ResolvedAccount,
} from "../lib/schemas";
import { useApi, useTelegramBack } from "./providers";
import {
  AsyncButton,
  Button,
  ContextHeader,
  Field,
  Input,
  PageTransition,
  ProviderPendingState,
  Select,
  StatePage,
  StatusBadge,
  StepIndicator,
  StickyActionBar,
} from "./ui";

const steps = [
  "Identity",
  "Payout account",
  "Position & schedule",
  "Rules & consent",
  "Payment method",
  "Complete",
] as const;
const maxAutomaticProviderPolls = 150;

const identityFormSchema = z.object({
  legalName: z.string().trim().min(3, "Enter your full legal name."),
  nin: z.string().regex(/^\d{11}$/u, "NIN must contain exactly 11 digits."),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/u, "Use international format, for example +234…"),
});
type IdentityInput = z.infer<typeof identityFormSchema>;

const bankFormSchema = z.object({
  bankCode: z.string().min(2, "Choose a bank."),
  accountNumber: z
    .string()
    .regex(/^\d{10}$/u, "Enter a 10-digit account number."),
});
type BankInput = z.infer<typeof bankFormSchema>;

const preferenceSchema = z.object({
  payoutPosition: z.number().int().positive(),
  dayOfWeek: z.number().int().min(0).max(6),
  time: z.string().regex(/^\d{2}:\d{2}$/u),
  weekOfMonth: z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "LAST"]),
  month: z.number().int().min(1).max(12),
  dayOfMonth: z.number().int().min(1).max(31),
});
type PreferenceInput = z.infer<typeof preferenceSchema>;

const paymentFormSchema = z.object({
  method: z.enum(["card", "direct-debit"]),
  customerEmail: z.email("Enter a valid email."),
  bankCode: z.string(),
  accountNumber: z.string(),
  address: z.string(),
});
type PaymentInput = z.infer<typeof paymentFormSchema>;

const errorMessage = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "Collage could not save this step. Try again.";

const registrationStep = (registration: Registration): number => {
  if (!("id" in registration)) return 0;
  if (!registration.phoneCollected) return 0;
  if (registration.state === "DETAILS_SUBMITTED") return 1;
  if ((registration.bankAccounts?.length ?? 0) === 0) return 1;
  if (registration.payoutPosition === null) return 2;
  if (registration.acceptedRuleVersionId == null) return 3;
  if (
    registration.state === "PAYMENT_METHOD_REQUIRED" ||
    registration.state === "IDENTITY_PENDING"
  )
    return 4;
  if (registration.state === "PAYMENT_METHOD_AUTHORIZING") return 4;
  return 5;
};

export function RegistrationFlow({
  collage,
  initialRegistration,
}: {
  readonly collage: Collage;
  readonly initialRegistration: Registration;
}): JSX.Element {
  const { api } = useApi();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(() => registrationStep(initialRegistration));
  const [resolved, setResolved] = useState<ResolvedAccount | null>(null);
  const [bankDraft, setBankDraft] = useState<BankInput | null>(null);
  const [authorizationId, setAuthorizationId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : (window.sessionStorage.getItem("collage-authorization-id") ??
        ("paymentMethods" in initialRegistration
          ? (initialRegistration.paymentMethods?.find(
              (method) =>
                method.state === "AUTHORIZING" &&
                method.authorizationId != null,
            )?.authorizationId ?? null)
          : null)),
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<number>();
  const [error, setError] = useState<string>();
  const [manualMode, setManualMode] = useState(false);
  const [collageStarted, setCollageStarted] = useState(false);
  useTelegramBack(
    () => setStep((current) => Math.max(0, current - 1)),
    step > 0 && step < 5 && authorizationId === null,
  );

  const positions = useQuery({
    queryKey: ["positions", collage.id],
    queryFn: () =>
      api.request(`/collages/${collage.id}/positions`, positionsSchema),
    enabled: step === 2,
  });
  const rules = useQuery({
    queryKey: ["rules", collage.id],
    queryFn: () => api.request(`/collages/${collage.id}/rules`, ruleSchema),
    enabled: step === 3,
  });
  const banks = useQuery({
    queryKey: ["banks"],
    queryFn: () => api.request("/banks", banksSchema),
    enabled: step === 1 || step === 4,
  });
  const authorization = useQuery({
    queryKey: ["authorization", authorizationId],
    queryFn: async () => {
      if (authorizationId === null) throw new Error("Authorization is missing");
      const result = await api.request(
        `/payment-authorizations/${authorizationId}/verify`,
        authorizationSchema,
        { method: "POST" },
      );
      setLastCheckedAt(Date.now());
      return result;
    },
    enabled: authorizationId !== null,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state !== undefined && terminalAuthorizationStates.has(state))
        return false;
      if (query.state.dataUpdateCount >= maxAutomaticProviderPolls)
        return false;
      return 3_000;
    },
  });
  const completionRegistration = useQuery({
    queryKey: ["registration-completion", collage.id],
    queryFn: () =>
      api.request(
        `/collages/${collage.id}/me/registration`,
        registrationSchema,
      ),
    enabled: step === 5,
    refetchInterval: (query) =>
      query.state.data?.state === "REGISTERED" ||
      query.state.dataUpdateCount >= maxAutomaticProviderPolls
        ? false
        : 3_000,
  });

  useEffect(() => {
    if (
      authorization.data !== undefined &&
      successfulAuthorizationStates.has(authorization.data.state)
    ) {
      setStep(5);
      window.sessionStorage.removeItem("collage-authorization-id");
      void queryClient.invalidateQueries({
        queryKey: ["registration-completion", collage.id],
      });
    }
  }, [authorization.data, collage.id, queryClient]);

  const identity = useForm<IdentityInput>({
    resolver: zodResolver(identityFormSchema),
    defaultValues: { phone: "+234" },
    mode: "onBlur",
  });
  const bank = useForm<BankInput>({
    resolver: zodResolver(bankFormSchema),
    mode: "onBlur",
  });
  const preference = useForm<PreferenceInput>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: {
      payoutPosition: 1,
      dayOfWeek: 4,
      time: "09:00",
      weekOfMonth: "FIRST",
      month: 1,
      dayOfMonth: 15,
    },
    mode: "onBlur",
  });
  const payment = useForm<PaymentInput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      method: "card",
      customerEmail: "",
      bankCode: "",
      accountNumber: "",
      address: "",
    },
    mode: "onBlur",
  });
  const selectedMethod = payment.watch("method");

  useEffect(() => {
    if (
      authorization.data !== undefined &&
      ["FAILED_TERMINAL", "EXPIRED", "CANCELLED"].includes(
        authorization.data.state,
      )
    ) {
      window.sessionStorage.removeItem("collage-authorization-id");
      setAuthorizationId(null);
      setError(
        selectedMethod === "card"
          ? "Monnify confirmed the setup payment but did not provide a reusable card token. Sandbox does not issue real tokens; use direct debit for an operational sandbox registration, or enable card tokenization on the live Monnify contract."
          : "The payment authorization ended without activation. Choose a payment method and try again.",
      );
    }
  }, [authorization.data, selectedMethod]);

  const identityMutation = useMutation({
    mutationFn: (value: IdentityInput) =>
      api.request(
        `/collages/${collage.id}/registrations/details`,
        z.object({
          id: z.string(),
          state: z.string(),
          payoutPosition: z.number().nullable(),
        }),
        json({ stage: "IDENTITY", ...value }),
      ),
    onSuccess: () => setStep(1),
    onError: (cause) => setError(errorMessage(cause)),
  });
  const resolveBank = useMutation({
    mutationFn: (value: BankInput) =>
      api.request("/bank-accounts/resolve", resolvedAccountSchema, json(value)),
    onSuccess: (value, variables) => {
      setResolved(value);
      setBankDraft(variables);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const saveBank = useMutation({
    mutationFn: () => {
      if (resolved === null || bankDraft === null)
        throw new Error("Resolve the account first");
      return api.request(
        `/collages/${collage.id}/me/payout-account`,
        z.object({
          id: z.string(),
          bankCode: z.string(),
          bankName: z.string(),
          maskedAccountNumber: z.string(),
          state: z.string(),
        }),
        putJson({ ...bankDraft, resolutionToken: resolved.resolutionToken }),
      );
    },
    onSuccess: () => setStep(2),
    onError: (cause) => setError(errorMessage(cause)),
  });
  const savePreference = useMutation({
    mutationFn: (value: PreferenceInput) =>
      api.request(
        `/collages/${collage.id}/registrations/details`,
        z.object({
          id: z.string(),
          state: z.string(),
          payoutPosition: z.number(),
        }),
        json({
          stage: "PREFERENCES",
          payoutPosition: value.payoutPosition,
          preferredChargeRule: chargeRule(collage, value),
        }),
      ),
    onSuccess: () => setStep(3),
    onError: (cause) => {
      setError(errorMessage(cause));
      void positions.refetch();
    },
  });
  const consent = useMutation({
    mutationFn: () => {
      if (rules.data === undefined) throw new Error("Rules are missing");
      return api.request(
        `/collages/${collage.id}/registrations/confirm-rules`,
        z.object({ acceptedRuleVersionId: z.string() }),
        json({ ruleVersionId: rules.data.id, recurringConsent: true }),
      );
    },
    onSuccess: () => setStep(4),
    onError: (cause) => setError(errorMessage(cause)),
  });
  const setupPayment = useMutation({
    mutationFn: async (value: PaymentInput) => {
      const idempotencyKey = createIdempotencyKey();
      const path =
        value.method === "card"
          ? `/collages/${collage.id}/me/payment-methods/card/setup`
          : `/collages/${collage.id}/me/payment-methods/direct-debit/setup`;
      return api.request(
        path,
        paymentSetupSchema,
        json(
          value.method === "card"
            ? { customerEmail: value.customerEmail, idempotencyKey }
            : {
                customerEmail: value.customerEmail,
                idempotencyKey,
                bankCode: value.bankCode,
                accountNumber: value.accountNumber,
                address: value.address,
                startDate: new Date(
                  Date.now() + 24 * 60 * 60 * 1_000,
                ).toISOString(),
                endDate: new Date(
                  Date.now() + 370 * 24 * 60 * 60 * 1_000,
                ).toISOString(),
              },
        ),
      );
    },
    onSuccess: (result) => {
      setAuthorizationId(result.authorizationId);
      window.sessionStorage.setItem(
        "collage-authorization-id",
        result.authorizationId,
      );
      const redirect = result.checkoutUrl ?? result.authorizationUrl;
      if (redirect !== null && redirect !== undefined)
        window.location.assign(redirect);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const completeWithoutRecurringMethod = useMutation({
    mutationFn: (customerEmail: string) =>
      api.request(
        `/collages/${collage.id}/registrations/complete-manual`,
        z.object({
          collageStarted: z.boolean(),
          memberId: z.string(),
          state: z.literal("REGISTERED"),
        }),
        json({ customerEmail }),
      ),
    onSuccess: (result) => {
      setManualMode(true);
      setCollageStarted(result.collageStarted);
      setStep(5);
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["registration-completion", collage.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["registration", collage.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["collage", collage.id] }),
        queryClient.invalidateQueries({ queryKey: ["status", collage.id] }),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const availablePositions = useMemo(() => {
    if (positions.data === undefined) return [];
    const occupied = new Set(
      positions.data.positions.map((item) => item.payoutPosition),
    );
    return Array.from(
      { length: positions.data.participantLimit },
      (_, index) => index + 1,
    ).filter((position) => !occupied.has(position));
  }, [positions.data]);

  useEffect(() => {
    const firstAvailable = availablePositions[0];
    if (
      firstAvailable !== undefined &&
      !availablePositions.includes(preference.getValues("payoutPosition"))
    ) {
      preference.setValue("payoutPosition", firstAvailable, {
        shouldValidate: true,
      });
    }
  }, [availablePositions, preference]);

  if (
    authorizationId !== null &&
    (authorization.data === undefined ||
      !terminalAuthorizationStates.has(authorization.data.state))
  ) {
    return (
      <ProviderPendingState
        amountMinor={
          selectedMethod === "card"
            ? collage.cardSetupAmountMinor
            : collage.contributionAmountMinor
        }
        collage={collage}
        lastCheckedAt={lastCheckedAt}
        onRecheck={() => {
          void api.request(
            `/payment-authorizations/${authorizationId}/verify`,
            authorizationSchema,
            { method: "POST" },
          );
          void authorization.refetch();
        }}
        title={
          selectedMethod === "card"
            ? "Confirming your saved card"
            : "Waiting for mandate activation"
        }
      />
    );
  }

  return (
    <>
      <ContextHeader
        collage={collage}
        detail={
          step === 5
            ? completionRegistration.data?.state === "REGISTERED"
              ? "Registration confirmed by Collage"
              : "Final registration checks in progress"
            : "Registration is saved step by step"
        }
      />
      <StepIndicator current={step} labels={steps} />
      {error === undefined ? null : (
        <div className="inline-error" role="alert">
          {error}
          <button onClick={() => setError(undefined)} type="button">
            Dismiss
          </button>
        </div>
      )}
      <PageTransition stepKey={String(step)}>
        {step === 0 ? (
          <form
            className="flow"
            onSubmit={identity.handleSubmit((value) =>
              identityMutation.mutate(value),
            )}
          >
            <FlowHeading
              icon={LockKeyhole}
              title="Your details"
              copy="Use your legal details and contact number. They are encrypted and never shown in the Telegram group."
            />
            <Field
              error={identity.formState.errors.legalName?.message}
              label="Full legal name"
            >
              <Input autoComplete="name" {...identity.register("legalName")} />
            </Field>
            <Field
              error={identity.formState.errors.nin?.message}
              hint="11 digits · encrypted at rest"
              label="National Identification Number"
            >
              <Input
                autoComplete="off"
                inputMode="numeric"
                maxLength={11}
                type="password"
                {...identity.register("nin")}
              />
            </Field>
            <Field
              error={identity.formState.errors.phone?.message}
              hint="International format, for example +234… · no OTP required"
              label="Phone number"
            >
              <Input
                autoComplete="tel"
                inputMode="tel"
                {...identity.register("phone")}
              />
            </Field>
            <AsyncButton
              busy={identityMutation.isPending}
              busyLabel="Securing identity…"
              type="submit"
            >
              Continue securely
            </AsyncButton>
          </form>
        ) : null}

        {step === 1 ? (
          <form
            className="flow"
            onSubmit={bank.handleSubmit((value) => resolveBank.mutate(value))}
          >
            <FlowHeading
              icon={Landmark}
              title="Where should your payout go?"
              copy="We resolve the official account name before anything is saved."
            />
            <Field error={bank.formState.errors.bankCode?.message} label="Bank">
              <Select {...bank.register("bankCode")}>
                <option value="">Choose a bank</option>
                {banks.data?.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              error={bank.formState.errors.accountNumber?.message}
              label="Account number"
            >
              <Input
                autoComplete="off"
                inputMode="numeric"
                maxLength={10}
                {...bank.register("accountNumber")}
              />
            </Field>
            {resolved === null ? (
              <AsyncButton
                busy={resolveBank.isPending}
                busyLabel="Resolving account…"
                type="submit"
              >
                Check account name
              </AsyncButton>
            ) : (
              <div className="confirmation-block">
                <StatusBadge tone="success">
                  <CheckCircle2 aria-hidden="true" size={15} />
                  Account resolved
                </StatusBadge>
                <strong>{resolved.accountName}</strong>
                <span>{resolved.maskedAccountNumber}</span>
                <p>
                  Confirm this name belongs to you. Saving replaces only your
                  future payout destination.
                </p>
                <AsyncButton
                  busy={saveBank.isPending}
                  busyLabel="Encrypting account…"
                  onClick={() => saveBank.mutate()}
                  type="button"
                >
                  Confirm payout account
                </AsyncButton>
                <Button
                  onClick={() => setResolved(null)}
                  type="button"
                  variant="ghost"
                >
                  Use another account
                </Button>
              </div>
            )}
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="flow"
            onSubmit={preference.handleSubmit((value) =>
              savePreference.mutate(value),
            )}
          >
            <FlowHeading
              icon={CalendarClock}
              title="Choose your payout place and charge time"
              copy={`All times use ${collage.timezone}. Position selection is confirmed by the server.`}
            />
            <Field label="Payout position">
              <Select
                {...preference.register("payoutPosition", {
                  valueAsNumber: true,
                })}
              >
                {availablePositions.map((position) => (
                  <option key={position} value={position}>
                    Position {position}
                  </option>
                ))}
              </Select>
            </Field>
            <ChargePreferenceFields collage={collage} form={preference} />
            <AsyncButton
              busy={savePreference.isPending}
              busyLabel="Reserving position…"
              disabled={availablePositions.length === 0}
              type="submit"
            >
              Reserve position
            </AsyncButton>
          </form>
        ) : null}

        {step === 3 ? (
          <div className="flow">
            <FlowHeading
              icon={Users}
              title="Review the group rules"
              copy="Your consent is bound to this exact rules version. Financial rules lock when the Collage starts."
            />
            <div className="rules-list">
              <RuleLine text="Every member must pay before a payout can start." />
              <RuleLine text="The next cycle waits for confirmed payout success." />
              <RuleLine text="Leaving Telegram does not cancel contribution obligations." />
              <RuleLine text="Recurring collection follows your selected schedule." />
            </div>
            <label className="consent">
              <input id="consent" type="checkbox" />
              <span>
                I accept rules version {rules.data?.version ?? "…"} and
                authorize recurring contributions for this Collage.
              </span>
            </label>
            <AsyncButton
              busy={consent.isPending}
              busyLabel="Recording consent…"
              onClick={() => {
                const checkbox =
                  document.querySelector<HTMLInputElement>("#consent");
                if (checkbox?.checked === true) consent.mutate();
                else
                  setError("Accept the rules and recurring-payment consent.");
              }}
              type="button"
            >
              Accept and continue
            </AsyncButton>
          </div>
        ) : null}

        {step === 4 ? (
          <form
            className="flow"
            onSubmit={payment.handleSubmit((value) =>
              setupPayment.mutate(value),
            )}
          >
            <FlowHeading
              icon={CreditCard}
              title="Authorize automatic contributions"
              copy="Your registration is not complete until Collage verifies an active reusable method."
            />
            <div
              className="segmented"
              role="radiogroup"
              aria-label="Payment method"
            >
              <label>
                <input
                  type="radio"
                  value="card"
                  {...payment.register("method")}
                />
                <CreditCard aria-hidden="true" size={20} />
                <span>
                  <strong>Saved card</strong>
                  <small>Setup payment required</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  value="direct-debit"
                  {...payment.register("method")}
                />
                <Banknote aria-hidden="true" size={20} />
                <span>
                  <strong>Direct debit</strong>
                  <small>Bank mandate approval</small>
                </span>
              </label>
            </div>
            <Field
              error={payment.formState.errors.customerEmail?.message}
              label="Email for provider authorization"
            >
              <Input
                autoComplete="email"
                inputMode="email"
                type="email"
                {...payment.register("customerEmail")}
              />
            </Field>
            {selectedMethod === "direct-debit" ? (
              <>
                <Field label="Debit bank">
                  <Select {...payment.register("bankCode")}>
                    <option value="">Choose a bank</option>
                    {banks.data?.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Debit account number">
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    {...payment.register("accountNumber")}
                  />
                </Field>
                <Field label="Contact address">
                  <Input {...payment.register("address")} />
                </Field>
              </>
            ) : null}
            <div className="financial-confirmation">
              <strong>
                {selectedMethod === "card"
                  ? "Card setup payment"
                  : "Recurring mandate"}
              </strong>
              <dl>
                <div>
                  <dt>Collage</dt>
                  <dd>{collage.name}</dd>
                </div>
                <div>
                  <dt>Group</dt>
                  <dd>{collage.chat?.title ?? "Telegram group"}</dd>
                </div>
                <div>
                  <dt>Contribution</dt>
                  <dd>{`${formatMoney(collage.contributionAmountMinor)} ${collage.frequency.toLowerCase()}`}</dd>
                </div>
              </dl>
              <p>
                You will briefly leave Collage to authorize with Monnify. A
                redirect alone never completes registration.
              </p>
            </div>
            <AsyncButton
              busy={setupPayment.isPending}
              busyLabel="Creating authorization…"
              type="submit"
            >
              Continue to Monnify
            </AsyncButton>
            <Button
              disabled={completeWithoutRecurringMethod.isPending}
              onClick={() => {
                void payment.trigger("customerEmail").then((valid) => {
                  if (valid) {
                    completeWithoutRecurringMethod.mutate(
                      payment.getValues("customerEmail"),
                    );
                  }
                });
              }}
              type="button"
              variant="ghost"
            >
              {completeWithoutRecurringMethod.isPending
                ? "Completing opt-in…"
                : "Skip recurring payment setup"}
            </Button>
            <p className="field-hint">
              You’ll be tagged in the group each cycle and will pay through a
              secure Monnify checkout. Your payout account and obligations
              remain the same.
            </p>
          </form>
        ) : null}

        {step === 5 ? (
          <StatePage
            action={
              <Button onClick={() => window.location.reload()} type="button">
                View Collage status
              </Button>
            }
            description={
              completionRegistration.data?.state === "REGISTERED"
                ? manualMode
                  ? collageStarted
                    ? `Your payout position for ${collage.name} is confirmed. You filled the final position, so Collage is starting the first cycle now.`
                    : `Your payout position for ${collage.name} is confirmed. You chose manual checkout and will be reminded when each contribution is due.`
                  : `Your payout position and active payment method for ${collage.name} were confirmed from current server state.`
                : `The payment provider confirmed your authorization for ${collage.name}. Collage is still checking the remaining identity and registration evidence; you do not count toward the group yet.`
            }
            title={
              completionRegistration.data?.state === "REGISTERED"
                ? "Registration confirmed"
                : "Final checks pending"
            }
            variant={
              completionRegistration.data?.state === "REGISTERED"
                ? "success"
                : "pending"
            }
          />
        ) : null}
      </PageTransition>
      {step > 0 && step < 5 && authorizationId === null ? (
        <StickyActionBar>
          <Button
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            type="button"
            variant="ghost"
          >
            Back
          </Button>
          <span>Progress is saved after each verified server step.</span>
        </StickyActionBar>
      ) : null}
    </>
  );
}

function FlowHeading({
  icon: Icon,
  title,
  copy,
}: {
  readonly icon: typeof Users;
  readonly title: string;
  readonly copy: string;
}): JSX.Element {
  return (
    <div className="flow-heading">
      <Icon aria-hidden="true" size={22} />
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function RuleLine({ text }: { readonly text: string }): JSX.Element {
  return (
    <div>
      <CheckCircle2 aria-hidden="true" size={18} />
      <span>{text}</span>
    </div>
  );
}

function ChargePreferenceFields({
  collage,
  form,
}: {
  readonly collage: Collage;
  readonly form: ReturnType<typeof useForm<PreferenceInput>>;
}): JSX.Element {
  return (
    <>
      {collage.frequency === "WEEKLY" || collage.frequency === "MONTHLY" ? (
        <Field label="Day of week">
          <Select {...form.register("dayOfWeek", { valueAsNumber: true })}>
            {[
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ].map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {collage.frequency === "MONTHLY" ? (
        <Field label="Week of month">
          <Select {...form.register("weekOfMonth")}>
            {["FIRST", "SECOND", "THIRD", "FOURTH", "LAST"].map((week) => (
              <option key={week} value={week}>
                {week.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {collage.frequency === "YEARLY" ? (
        <>
          <Field label="Month">
            <Input
              max={12}
              min={1}
              type="number"
              {...form.register("month", { valueAsNumber: true })}
            />
          </Field>
          <Field
            hint="Invalid dates normalize to the last valid day."
            label="Day of month"
          >
            <Input
              max={31}
              min={1}
              type="number"
              {...form.register("dayOfMonth", { valueAsNumber: true })}
            />
          </Field>
        </>
      ) : null}
      <Field label="Preferred first-attempt time">
        <Input type="time" {...form.register("time")} />
      </Field>
    </>
  );
}

const chargeRule = (
  collage: Collage,
  value: PreferenceInput,
): Record<string, number | string> => {
  const [hour = 0, minute = 0] = value.time.split(":").map(Number);
  if (collage.frequency === "DAILY") return { kind: "DAILY", hour, minute };
  if (collage.frequency === "WEEKLY")
    return {
      kind: "WEEKLY",
      weekday: value.dayOfWeek === 0 ? 7 : value.dayOfWeek,
      hour,
      minute,
    };
  if (collage.frequency === "MONTHLY")
    return {
      kind: "MONTHLY",
      ordinal:
        value.weekOfMonth === "LAST"
          ? "last"
          : ["FIRST", "SECOND", "THIRD", "FOURTH"].indexOf(value.weekOfMonth) +
            1,
      weekday: value.dayOfWeek === 0 ? 7 : value.dayOfWeek,
      hour,
      minute,
    };
  return {
    kind: "YEARLY",
    month: value.month,
    day: value.dayOfMonth,
    hour,
    minute,
  };
};
