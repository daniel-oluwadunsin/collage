import { z } from "zod";

export const personalToolNames = [
  "get_my_payout_schedule",
  "get_my_payout_position",
  "get_my_current_payment_status",
  "get_my_next_charge_schedule",
  "get_my_outstanding_obligation",
  "get_my_remaining_contributions",
  "get_my_registration_status",
  "get_my_payment_method_status",
  "get_my_current_cycle_summary",
] as const;

export const groupToolNames = [
  "get_collage_status",
  "get_current_cycle_status",
  "get_collage_pot_balance",
  "get_next_payout_recipient",
  "get_previous_payout_recipient",
  "get_remaining_cycles",
  "get_collage_expected_end",
  "get_public_payout_order",
  "get_member_at_position",
  "list_recent_payouts",
  "list_current_pending_contributors",
  "explain_current_cycle_block",
] as const;

export const memberToolNames = [
  "get_member_payout_schedule",
  "get_member_payout_position",
  "get_member_public_payment_status",
  "get_member_public_payout_status",
  "get_recipient_after_member",
] as const;

export const actionToolNames = [
  "create_my_manual_payment_action",
  "create_update_payment_method_action",
  "create_update_payout_account_action",
  "create_registration_resume_action",
  "create_join_collage_action",
  "create_view_payment_method_action",
  "create_view_payout_account_action",
  "create_my_payout_recovery_action",
] as const;

export const ruleTopics = [
  "CONTRIBUTION_AMOUNT",
  "PAYMENT_SCHEDULE",
  "REMINDERS",
  "GRACE_PERIOD",
  "DEFAULT",
  "LEAVING_GROUP",
  "PAYOUT_ORDER",
  "PAYMENT_METHOD",
  "PAYOUT_ACCOUNT",
  "CYCLE_COMPLETION",
  "REGISTRATION",
] as const;

const emptyArguments = z.object({}).strict();
const referenceArguments = z
  .object({
    memberReference: z.string().regex(/^(?:MENTION_[1-9]\d*|REPLY_TARGET)$/u),
  })
  .strict();
const plainNameArguments = z
  .object({ memberQuery: z.string().trim().min(1).max(100) })
  .strict()
  .refine(
    ({ memberQuery }) =>
      !/^-?\d{5,}$/u.test(memberQuery) &&
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(memberQuery),
    "Raw identifiers are forbidden",
  );

const emptyCalls = [...personalToolNames, ...actionToolNames, ...groupToolNames]
  .filter((name) => name !== "get_member_at_position")
  .map((name) =>
    z.object({ name: z.literal(name), arguments: emptyArguments }).strict(),
  );
const referenceCalls = memberToolNames.map((name) =>
  z.object({ name: z.literal(name), arguments: referenceArguments }).strict(),
);
const findCalls = memberToolNames.map((name) =>
  z
    .object({
      name: z.literal(`find_${name}`),
      arguments: plainNameArguments,
    })
    .strict(),
);

const callSchemas = [
  ...emptyCalls,
  ...referenceCalls,
  ...findCalls,
  z
    .object({
      name: z.literal("get_member_at_position"),
      arguments: z
        .object({ position: z.number().int().min(1).max(1_000) })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("explain_collage_rule"),
      arguments: z.object({ topic: z.enum(ruleTopics) }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("request_clarification"),
      arguments: emptyArguments,
    })
    .strict(),
  z
    .object({
      name: z.literal("unsupported_question"),
      arguments: emptyArguments,
    })
    .strict(),
];

type EmptyToolName =
  | (typeof personalToolNames)[number]
  | (typeof actionToolNames)[number]
  | Exclude<(typeof groupToolNames)[number], "get_member_at_position">;
type MemberToolName = (typeof memberToolNames)[number];

export type AssistantToolCall =
  | {
      readonly name:
        EmptyToolName | "request_clarification" | "unsupported_question";
      readonly arguments: Readonly<Record<string, never>>;
    }
  | {
      readonly name: MemberToolName;
      readonly arguments: { readonly memberReference: string };
    }
  | {
      readonly name: `find_${MemberToolName}`;
      readonly arguments: { readonly memberQuery: string };
    }
  | {
      readonly name: "get_member_at_position";
      readonly arguments: { readonly position: number };
    }
  | {
      readonly name: "explain_collage_rule";
      readonly arguments: { readonly topic: (typeof ruleTopics)[number] };
    };

const unionMembers = callSchemas as unknown as readonly [
  z.ZodType,
  z.ZodType,
  ...z.ZodType[],
];

export const assistantToolCallSchema = z.union(
  unionMembers,
) as z.ZodType<AssistantToolCall>;

export type AssistantToolName = AssistantToolCall["name"];
