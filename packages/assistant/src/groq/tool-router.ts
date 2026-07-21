import type { AssistantToolCall } from "../schemas/tool-call.js";
import {
  actionToolNames,
  groupToolNames,
  memberToolNames,
  personalToolNames,
  ruleTopics,
} from "../schemas/tool-call.js";

export type AssistantToolFamily =
  "PERSONAL" | "MEMBER" | "GROUP" | "RULES" | "ACTION" | "UNKNOWN";

const matches = (text: string, pattern: RegExp): boolean => pattern.test(text);

export const routeToolFamily = (text: string): AssistantToolFamily => {
  if (
    matches(
      text,
      /\b(?:pay now|let me pay|join|register|resume|update|replace|change|view|show|which).*(?:payment|card|mandate|bank|account|registration|collage)|\b(?:retry|recover).*(?:payout)|\blet me pay\b/iu,
    )
  )
    return "ACTION";
  if (
    matches(
      text,
      /\b(?:rule|late|leave|reminder|grace|default|change.*position|cycle complete|registration work)/iu,
    )
  )
    return "RULES";
  if (
    matches(
      text,
      /\b(?:who|which\s+(?:contributors?|members?)).*(?:not paid|hasn't paid|owing|outstanding)/iu,
    )
  )
    return "GROUP";
  if (
    matches(
      text,
      /<MENTION_\d+>|<REPLY_TARGET>|\b(?:when will|has|did|after|before)\s+@?[\p{L}][\p{L}' -]{1,80}\b/iu,
    ) &&
    !matches(text, /\b(?:i|me|my|mine)\b/iu)
  )
    return "MEMBER";
  if (matches(text, /\b(?:i|me|my|mine|myself|i'm|im)\b/iu)) return "PERSONAL";
  if (
    matches(
      text,
      /\b(?:collage|cycles?|pot|collected|paid|owing|outstanding|next|last|finish|order|position|status|update|blocked)\b/iu,
    )
  )
    return "GROUP";
  return "UNKNOWN";
};

type JsonSchema = Readonly<Record<string, unknown>>;
export interface GroqToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonSchema;
  };
}

const noArguments = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;
const refArguments = {
  type: "object",
  properties: {
    memberReference: {
      type: "string",
      pattern: "^(MENTION_[1-9][0-9]*|REPLY_TARGET)$",
    },
  },
  required: ["memberReference"],
  additionalProperties: false,
} as const;
const nameArguments = {
  type: "object",
  properties: { memberQuery: { type: "string", minLength: 1, maxLength: 100 } },
  required: ["memberQuery"],
  additionalProperties: false,
} as const;
const define = (
  name: string,
  parameters: JsonSchema = noArguments,
): GroqToolDefinition => ({
  type: "function",
  function: { name, description: name.replaceAll("_", " "), parameters },
});

const toolSignals: Readonly<Record<string, readonly string[]>> = {
  get_my_payout_schedule: ["collect", "receive", "payout", "when"],
  get_my_payout_position: ["number", "position", "before me"],
  get_my_current_payment_status: [
    "paid",
    "payment go through",
    "payment status",
  ],
  get_my_next_charge_schedule: ["charge", "debit", "next payment"],
  get_my_outstanding_obligation: [
    "owe",
    "owing",
    "outstanding",
    "how much left",
  ],
  get_my_remaining_contributions: [
    "contributions left",
    "remaining contributions",
  ],
  get_my_registration_status: ["registered", "registration status"],
  get_my_payment_method_status: ["mandate", "card", "payment method"],
  get_my_current_cycle_summary: ["my cycle", "cycle summary"],
  get_collage_status: ["collage status", "group status", "give us an update"],
  get_current_cycle_status: ["cycle", "current cycle"],
  get_collage_pot_balance: ["pot", "collected", "balance"],
  get_next_payout_recipient: [
    "collecting next",
    "next recipient",
    "who is next",
  ],
  get_previous_payout_recipient: [
    "collected last",
    "previous recipient",
    "who was last",
  ],
  get_remaining_cycles: ["cycles left", "remaining cycles"],
  get_collage_expected_end: [
    "finish",
    "expected end",
    "when will the collage end",
  ],
  get_public_payout_order: ["payout order", "show the order"],
  get_member_at_position: ["position", "number"],
  list_recent_payouts: ["recent payouts", "payout history"],
  list_current_pending_contributors: [
    "not paid",
    "hasn't paid",
    "owing",
    "pending contributors",
  ],
  explain_current_cycle_block: [
    "why",
    "blocked",
    "not completed",
    "not complete",
  ],
  get_member_payout_schedule: ["collect", "receive", "payout", "when"],
  get_member_payout_position: ["position", "number"],
  get_member_public_payment_status: ["paid", "payment status", "owing"],
  get_member_public_payout_status: ["payout status", "been paid"],
  get_recipient_after_member: ["after", "comes after"],
  create_my_manual_payment_action: [
    "let me pay",
    "pay now",
    "complete payment",
  ],
  create_update_payment_method_action: [
    "update payment method",
    "replace card",
    "change card",
    "change mandate",
  ],
  create_update_payout_account_action: [
    "update payout account",
    "change bank",
    "change account",
  ],
  create_registration_resume_action: [
    "resume registration",
    "continue registration",
  ],
  create_join_collage_action: ["join", "register"],
  create_view_payment_method_action: [
    "which card",
    "view card",
    "show my card",
    "payment method details",
  ],
  create_view_payout_account_action: [
    "which bank",
    "view account",
    "show my account",
    "payout account details",
  ],
  create_my_payout_recovery_action: [
    "recover payout",
    "retry payout",
    "payout failed",
  ],
};

const select = (names: readonly string[], text: string): readonly string[] => {
  const words = text.toLocaleLowerCase("en-NG");
  const scored = names.map((name) => ({
    name,
    score:
      (toolSignals[name] ?? []).filter((signal) => words.includes(signal))
        .length *
        10 +
      name.split("_").filter((word) => word.length > 3 && words.includes(word))
        .length,
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ name }) => name);
};

export const toolsForFamily = (
  family: AssistantToolFamily,
  text: string,
  hasTrustedTarget: boolean,
): readonly GroqToolDefinition[] => {
  let tools: readonly GroqToolDefinition[];
  if (family === "PERSONAL")
    tools = select(personalToolNames, text).map((name) => define(name));
  else if (family === "GROUP")
    tools = select(groupToolNames, text).map((name) =>
      name === "get_member_at_position"
        ? define(name, {
            type: "object",
            properties: {
              position: { type: "integer", minimum: 1, maximum: 1000 },
            },
            required: ["position"],
            additionalProperties: false,
          })
        : define(name),
    );
  else if (family === "ACTION")
    tools = select(actionToolNames, text).map((name) => define(name));
  else if (family === "RULES")
    tools = [
      define("explain_collage_rule", {
        type: "object",
        properties: { topic: { type: "string", enum: ruleTopics } },
        required: ["topic"],
        additionalProperties: false,
      }),
    ];
  else if (family === "MEMBER") {
    tools = select(memberToolNames, text).flatMap((name) => [
      define(
        hasTrustedTarget ? name : `find_${name}`,
        hasTrustedTarget ? refArguments : nameArguments,
      ),
    ]);
  } else tools = [];
  return [
    ...tools,
    define("request_clarification"),
    define("unsupported_question"),
  ].slice(0, 7);
};

export const unsafeAssistantRequest = (text: string): boolean => {
  if (
    /\b(?:run|execute|show|give|reveal|dump)\b.{0,40}\b(?:sql|system prompt|database)\b/iu.test(
      text,
    ) ||
    /\b(?:show|give|reveal|dump|what(?:'s| is))\b.{0,40}\b(?:nin|phone(?: number)?)\b/iu.test(
      text,
    ) ||
    /\b(?:mark|set)\b.{0,80}\bpaid\b|\bpay\s+\p{L}+\s+now\b|\bmove\b.{0,80}\bposition\b|\bignore\s+(?:the\s+)?rules\b/iu.test(
      text,
    )
  )
    return true;
  const asksForFinancialCredential =
    /\b(?:account number|card token|mandate code|bank account)\b/iu.test(text);
  return asksForFinancialCredential && !/\b(?:i|me|my|mine)\b/iu.test(text);
};

export const toolBaseName = (call: AssistantToolCall): string =>
  call.name.replace(/^find_/u, "");
