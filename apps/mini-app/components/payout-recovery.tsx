"use client";
/* eslint-disable @typescript-eslint/no-misused-promises */

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Landmark, RefreshCw, ShieldAlert } from "lucide-react";
import { useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { json, putJson } from "../lib/api";
import { formatMoney } from "../lib/format";
import {
  banksSchema,
  resolvedAccountSchema,
  type Collage,
  type ResolvedAccount,
} from "../lib/schemas";
import { useApi } from "./providers";
import {
  AsyncButton,
  ContextHeader,
  Field,
  Input,
  Select,
  StatePage,
} from "./ui";

const payoutSchema = z.object({
  id: z.string(),
  state: z.string(),
  amountMinor: z.string().regex(/^\d+$/u),
  currency: z.literal("NGN"),
  bankAccount: z.object({
    bankName: z.string(),
    maskedAccountNumber: z.string(),
  }),
  attempts: z.array(z.object({ id: z.string(), state: z.string() })),
});

const accountSchema = z.object({
  bankCode: z.string().min(2),
  accountNumber: z.string().regex(/^\d{10}$/u),
});
type AccountInput = z.infer<typeof accountSchema>;

export function PayoutRecovery({
  collage,
  payoutId,
}: {
  readonly collage: Collage;
  readonly payoutId: string;
}): JSX.Element {
  const { api } = useApi();
  const [resolved, setResolved] = useState<ResolvedAccount | null>(null);
  const [draft, setDraft] = useState<AccountInput>();
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    mode: "onBlur",
  });
  const payout = useQuery({
    queryKey: ["payout", payoutId],
    queryFn: () =>
      api.request(`/collages/${collage.id}/payouts/${payoutId}`, payoutSchema),
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
  const update = useMutation({
    mutationFn: async () => {
      if (draft === undefined || resolved === null)
        throw new Error("Account resolution is missing");
      await api.request(
        `/collages/${collage.id}/payouts/${payoutId}/retry-account`,
        z.unknown(),
        putJson({ ...draft, resolutionToken: resolved.resolutionToken }),
      );
      return api.request(
        `/collages/${collage.id}/payouts/${payoutId}/retry`,
        z.object({ queued: z.literal(true), eventId: z.string() }),
        { method: "POST" },
      );
    },
  });
  if (update.isSuccess)
    return (
      <StatePage
        description="The verified account was attached to this failed payout and one safe retry was queued. Collage will poll the original retry until it reaches a terminal state."
        title="Payout retry queued"
        variant="pending"
      />
    );
  if (payout.data !== undefined && payout.data.state !== "FAILED")
    return (
      <StatePage
        description="This payout is pending, completed, or otherwise not eligible for a new transfer. Collage will not duplicate it."
        title="Payout cannot be retried"
        variant="unauthorized"
      />
    );
  return (
    <>
      <ContextHeader
        collage={collage}
        detail="Failed payout recovery · original transfer is terminal"
      />
      <section className="flow">
        <div className="flow-heading">
          <ShieldAlert aria-hidden="true" size={22} />
          <div>
            <h2>Recover this failed payout</h2>
            <p>
              Funds remain in the Collage pot. A retry is allowed only after the
              original transfer is definitely failed.
            </p>
          </div>
        </div>
        {payout.data === undefined ? (
          <div className="inline-loading">Checking payout eligibility…</div>
        ) : (
          <dl className="summary-list">
            <div>
              <dt>Collage / group</dt>
              <dd>
                {collage.name} · {collage.chat?.title ?? "Telegram group"}
              </dd>
            </div>
            <div>
              <dt>Amount / destination</dt>
              <dd>
                {formatMoney(payout.data.amountMinor)} ·{" "}
                {payout.data.bankAccount.bankName}{" "}
                {payout.data.bankAccount.maskedAccountNumber}
              </dd>
            </div>
            <div>
              <dt>Original status</dt>
              <dd>{payout.data.state}</dd>
            </div>
          </dl>
        )}
        <form
          className="flow"
          onSubmit={form.handleSubmit((value) => resolve.mutate(value))}
        >
          <Field label="Replacement bank">
            <Select {...form.register("bankCode")}>
              <option value="">Choose a bank</option>
              {banks.data?.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Replacement account number">
            <Input
              inputMode="numeric"
              maxLength={10}
              {...form.register("accountNumber")}
            />
          </Field>
          {resolved === null ? (
            <AsyncButton
              busy={resolve.isPending}
              busyLabel="Resolving destination…"
              type="submit"
            >
              <Landmark aria-hidden="true" size={18} />
              Resolve account
            </AsyncButton>
          ) : (
            <div className="confirmation-block">
              <strong>{resolved.accountName}</strong>
              <span>{resolved.maskedAccountNumber}</span>
              <p>
                This destination applies to the failed payout and future
                payouts. It never mutates a completed transfer.
              </p>
              <AsyncButton
                busy={update.isPending}
                busyLabel="Queuing safe retry…"
                onClick={() => update.mutate()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={18} />
                Update account and retry once
              </AsyncButton>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
