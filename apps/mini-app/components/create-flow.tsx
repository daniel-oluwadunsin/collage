"use client";
/* eslint-disable @typescript-eslint/no-misused-promises */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Coins, Settings2, Users } from "lucide-react";
import { useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { json } from "../lib/api";
import { collageSchema } from "../lib/schemas";
import { useApi } from "./providers";
import { useTelegram } from "./providers";
import {
  AsyncButton,
  Field,
  Input,
  PageTransition,
  Select,
  StatePage,
  StepIndicator,
} from "./ui";

const createSteps = ["Basics", "Schedule", "Safety rules", "Review"] as const;

const schema = z.object({
  telegramChatId: z.string().regex(/^-?\d+$/u),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1_000),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/u),
  participantLimit: z.number().int().min(2).max(100),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  frequencyInterval: z.number().int().min(1).max(365),
  firstCycleStartAt: z.string().min(1),
  deadlineHours: z.number().int().min(1),
  graceHours: z.number().int().min(0),
  timezone: z.string().min(1),
  payoutTiming: z.enum(["IMMEDIATE_WHEN_READY", "SCHEDULED_WHEN_READY"]),
  cardSetupPolicy: z.enum([
    "COMMITMENT_DEPOSIT",
    "FIRST_CONTRIBUTION",
    "SANDBOX_SIMULATION",
  ]),
  cardSetupAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/u),
  strictCycle: z.literal(true, {
    error: "Strict cycle acknowledgement is required.",
  }),
});
type FormValue = z.infer<typeof schema>;

const toMinor = (value: string): string => {
  const [major = "0", fraction = ""] = value.split(".");
  return (BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
};

export function CreateCollageFlow({
  telegramChatId,
}: {
  readonly telegramChatId?: string;
}): JSX.Element {
  const { api } = useApi();
  const telegram = useTelegram();
  const [step, setStep] = useState(0);
  const [createdName, setCreatedName] = useState<string>();
  const form = useForm<FormValue>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      telegramChatId: telegramChatId ?? "",
      name: "",
      description: "",
      amount: "1000",
      participantLimit: 3,
      frequency: "WEEKLY",
      frequencyInterval: 1,
      firstCycleStartAt: "",
      deadlineHours: 72,
      graceHours: 24,
      timezone: "Africa/Lagos",
      payoutTiming: "IMMEDIATE_WHEN_READY",
      cardSetupPolicy: "COMMITMENT_DEPOSIT",
      cardSetupAmount: "100",
      strictCycle: true,
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: FormValue) => {
      const created = await api.request(
        "/collages",
        collageSchema,
        json({
          telegramChatId: value.telegramChatId,
          name: value.name,
          description: value.description,
          currency: "NGN",
          contributionAmountMinor: toMinor(value.amount),
          participantLimit: value.participantLimit,
          frequency: value.frequency,
          frequencyInterval: value.frequencyInterval,
          firstCycleStartAt: new Date(value.firstCycleStartAt).toISOString(),
          cycleDeadlineOffsetMinutes: value.deadlineHours * 60,
          gracePeriodMinutes: value.graceHours * 60,
          timezone: value.timezone,
          payoutTiming: value.payoutTiming,
          cardSetupPolicy: value.cardSetupPolicy,
          cardSetupAmountMinor: toMinor(value.cardSetupAmount),
          rules: {
            strictCycle: true,
            leavingDoesNotCancelObligations: true,
            membersCannotBeMarkedPaidByAdmin: true,
          },
        }),
      );
      await api.request(
        `/collages/${created.id}/open-registration`,
        z.unknown(),
        { method: "POST" },
      );
      return created;
    },
    onSuccess: (created) => setCreatedName(created.name),
  });

  if (createdName !== undefined)
    return (
      <StatePage
        description={`${createdName} is open for registration. The bot can now update the group’s pinned Collage status.`}
        title="Registration is open"
        variant="success"
      />
    );

  return (
    <section className="create-flow">
      <p className="eyebrow">Group administrator</p>
      <h1>Create a Collage</h1>
      <p className="page-copy">
        Configure the full contribution contract. Financial rules lock when the
        Collage starts.
      </p>
      <button
        className="fullscreen-action"
        onClick={telegram.requestFullscreen}
        type="button"
      >
        Use fullscreen for this form
      </button>
      <StepIndicator current={step} labels={createSteps} />
      <form onSubmit={form.handleSubmit((value) => mutation.mutate(value))}>
        <PageTransition stepKey={String(step)}>
          {step === 0 ? (
            <div className="flow">
              <FlowLabel icon={Users} text="Group and contribution" />
              <Field
                error={form.formState.errors.telegramChatId?.message}
                hint="Bound from the opaque launch token in production."
                label="Telegram chat ID"
              >
                <Input
                  {...form.register("telegramChatId")}
                  readOnly={telegramChatId !== undefined}
                />
              </Field>
              <Field
                error={form.formState.errors.name?.message}
                label="Collage name"
              >
                <Input {...form.register("name")} />
              </Field>
              <Field label="Description">
                <Input {...form.register("description")} />
              </Field>
              <div className="form-grid">
                <Field
                  error={form.formState.errors.amount?.message}
                  label="Contribution amount (NGN)"
                >
                  <Input inputMode="decimal" {...form.register("amount")} />
                </Field>
                <Field label="Participants">
                  <Input
                    type="number"
                    {...form.register("participantLimit", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
              </div>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="flow">
              <FlowLabel icon={CalendarDays} text="Cycle timing" />
              <div className="form-grid">
                <Field label="Frequency">
                  <Select {...form.register("frequency")}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </Select>
                </Field>
                <Field label="Every">
                  <Input
                    min={1}
                    type="number"
                    {...form.register("frequencyInterval", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
              </div>
              <Field label="First cycle starts">
                <Input
                  type="datetime-local"
                  {...form.register("firstCycleStartAt")}
                />
              </Field>
              <div className="form-grid">
                <Field label="Payment deadline (hours)">
                  <Input
                    min={1}
                    type="number"
                    {...form.register("deadlineHours", { valueAsNumber: true })}
                  />
                </Field>
                <Field label="Grace period (hours)">
                  <Input
                    min={0}
                    type="number"
                    {...form.register("graceHours", { valueAsNumber: true })}
                  />
                </Field>
              </div>
              <Field label="Timezone">
                <Input {...form.register("timezone")} />
              </Field>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="flow">
              <FlowLabel icon={Settings2} text="Provider and payout rules" />
              <Field label="Payout timing">
                <Select {...form.register("payoutTiming")}>
                  <option value="IMMEDIATE_WHEN_READY">
                    Immediately when every contribution is confirmed
                  </option>
                  <option value="SCHEDULED_WHEN_READY">
                    At scheduled time, once ready
                  </option>
                </Select>
              </Field>
              <Field label="Card setup policy">
                <Select {...form.register("cardSetupPolicy")}>
                  <option value="COMMITMENT_DEPOSIT">Commitment deposit</option>
                  <option value="FIRST_CONTRIBUTION">
                    First contribution in advance
                  </option>
                  <option value="SANDBOX_SIMULATION">
                    Sandbox simulation only
                  </option>
                </Select>
              </Field>
              <Field label="Card setup amount (NGN)">
                <Input
                  inputMode="decimal"
                  {...form.register("cardSetupAmount")}
                />
              </Field>
              <label className="consent">
                <input type="checkbox" {...form.register("strictCycle")} />
                <span>
                  I accept strict-cycle operation: no payout before every member
                  pays, and no next cycle before verified payout success.
                </span>
              </label>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="flow">
              <FlowLabel
                icon={Coins}
                text="Review before opening registration"
              />
              <dl className="summary-list">
                <Summary
                  term="Collage"
                  value={form.getValues("name") || "Unnamed"}
                />
                <Summary
                  term="Group"
                  value={form.getValues("telegramChatId")}
                />
                <Summary
                  term="Contribution"
                  value={`₦${form.getValues("amount")} · ${form.getValues("frequency").toLowerCase()}`}
                />
                <Summary
                  term="Members / cycles"
                  value={String(form.getValues("participantLimit"))}
                />
                <Summary
                  term="Payout"
                  value="Only after all paid and ledger reconciles"
                />
              </dl>
              {mutation.error === null ? null : (
                <div className="inline-error" role="alert">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : "Creation failed."}
                </div>
              )}
              <AsyncButton
                busy={mutation.isPending}
                busyLabel="Creating Collage…"
                type="submit"
              >
                Create and open registration
              </AsyncButton>
            </div>
          ) : null}
        </PageTransition>
        {step < 3 ? (
          <div className="flow-navigation">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} type="button">
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={async () => {
                const fields =
                  step === 0
                    ? ([
                        "telegramChatId",
                        "name",
                        "amount",
                        "participantLimit",
                      ] as const)
                    : step === 1
                      ? (["firstCycleStartAt", "frequencyInterval"] as const)
                      : (["strictCycle", "cardSetupAmount"] as const);
                if (await form.trigger(fields)) setStep(step + 1);
              }}
              type="button"
            >
              Continue
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function FlowLabel({
  icon: Icon,
  text,
}: {
  readonly icon: typeof Users;
  readonly text: string;
}): JSX.Element {
  return (
    <div className="flow-label">
      <Icon aria-hidden="true" size={20} />
      <h2>{text}</h2>
    </div>
  );
}

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
