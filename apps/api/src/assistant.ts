import {
  sanitizeAssistantMessage,
  toolBaseName,
  type AssistantContextResolver,
  type AssistantToolCall,
  type AssistantToolExecutor,
  type AssistantToolResult,
  type ResolvedAssistantContext,
} from "@collage/assistant";
import type { AssistantQueryRequest } from "@collage/contracts";
import type { PrismaClient } from "@collage/database";
import { formatMoneyDisplay } from "@collage/domain";
import { buildTelegramMiniAppLink } from "@collage/telegram";
import {
  decryptString,
  type EncryptionKeyring,
  type LaunchTokenService,
} from "@collage/security";

const currentCollageStates = [
  "REGISTRATION_OPEN",
  "STARTING",
  "ACTIVE",
  "BLOCKED",
  "COMPLETED",
] as const;
const registeredStates = new Set([
  "REGISTERED",
  "AT_RISK",
  "DELINQUENT",
  "DEFAULTED",
]);

const displayName = (identity: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string => {
  const name = [identity.firstName, identity.lastName]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ");
  return (
    name ||
    (identity.username === null ? "Contributor" : `@${identity.username}`)
  );
};

const date = (value: Date | null | undefined, timezone: string): string =>
  value === null || value === undefined
    ? "Not scheduled"
    : new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(value);

export class PrismaAssistantContextResolver implements AssistantContextResolver {
  constructor(private readonly client: PrismaClient) {}

  async resolve(
    request: AssistantQueryRequest,
    requestId: string,
  ): Promise<ResolvedAssistantContext> {
    const sanitized = sanitizeAssistantMessage(request);
    const chat = await this.client.telegramChat.findUnique({
      where: { telegramChatId: request.telegramChatId },
      include: {
        collages: {
          where: { state: { in: [...currentCollageStates] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const collage = chat?.collages[0];
    const identity =
      request.sentAnonymously || request.actorTelegramUserId === undefined
        ? null
        : await this.client.telegramIdentity.findUnique({
            where: { telegramUserId: request.actorTelegramUserId },
          });
    const [chatMembership, collageMember] =
      identity === null || chat === null || collage === undefined
        ? [null, null]
        : await Promise.all([
            this.client.telegramChatMembership.findUnique({
              where: {
                chatId_userId: { chatId: chat.id, userId: identity.userId },
              },
            }),
            this.client.collageMember.findUnique({
              where: {
                collageId_userId: {
                  collageId: collage.id,
                  userId: identity.userId,
                },
              },
            }),
          ]);
    const membershipIsFresh =
      chatMembership?.state === "ACTIVE" &&
      chatMembership.lastSeenAt.getTime() >= Date.now() - 5 * 60_000;
    const role = !membershipIsFresh
      ? "OUTSIDER"
      : chatMembership.role === "CREATOR" ||
          chatMembership.role === "ADMINISTRATOR"
        ? "ADMIN"
        : "MEMBER";
    return {
      requestId,
      request,
      sanitizedText: sanitized.text,
      targetReferences: sanitized.references,
      actor:
        identity === null
          ? null
          : {
              publicId: identity.userId,
              userId: identity.userId,
              memberId: collageMember?.id ?? null,
              role,
              registered:
                collageMember !== null &&
                registeredStates.has(collageMember.state),
            },
      collage:
        chat === null || collage === undefined
          ? null
          : {
              publicId: `${request.telegramChatId}:${collage.createdAt.getTime().toString(36)}`,
              id: collage.id,
              chatId: chat.id,
              name: collage.name,
              state: collage.state,
            },
    };
  }
}

interface ExecutorOptions {
  readonly client: PrismaClient;
  readonly encryption: EncryptionKeyring;
  readonly launchTokens: LaunchTokenService;
  readonly botUsername: string;
  readonly miniAppShortName: string;
}

type MemberRecord = Awaited<
  ReturnType<PrismaAssistantToolExecutor["members"]>
>[number];
interface DisplayMemberRecord {
  readonly user: {
    readonly telegramIdentities: readonly {
      readonly firstName: string | null;
      readonly lastName: string | null;
      readonly username: string | null;
    }[];
  };
}

export class PrismaAssistantToolExecutor implements AssistantToolExecutor {
  constructor(private readonly options: ExecutorOptions) {}

  private members(collageId: string) {
    return this.options.client.collageMember.findMany({
      where: { collageId },
      orderBy: { payoutPosition: "asc" },
      select: {
        id: true,
        legalNameEncrypted: true,
        outstandingObligationMinor: true,
        payoutPosition: true,
        registeredAt: true,
        state: true,
        telegramUserId: true,
        user: { include: { telegramIdentities: { take: 1 } } },
        paymentMethods: {
          where: { state: { in: ["ACTIVE", "AUTHORIZING"] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, state: true, type: true },
        },
      },
    });
  }

  private memberName(member: DisplayMemberRecord): string {
    const identity = member.user.telegramIdentities[0];
    return identity === undefined ? "Contributor" : displayName(identity);
  }

  private async resolveMember(
    call: AssistantToolCall,
    context: ResolvedAssistantContext,
  ): Promise<MemberRecord | AssistantToolResult | null> {
    if (context.collage === null) return null;
    const members = await this.members(context.collage.id);
    if ("memberReference" in call.arguments) {
      const memberReference = call.arguments.memberReference;
      const source =
        memberReference === "REPLY_TARGET"
          ? context.request.replyTarget
          : context.request.mentions.find(
              ({ reference }) => reference === memberReference,
            );
      if (source === undefined) return null;
      if (source.telegramUserId !== undefined) {
        return (
          members.find(
            ({ telegramUserId }) => telegramUserId === source.telegramUserId,
          ) ?? null
        );
      }
      const username = source.username
        ?.replace(/^@/u, "")
        .toLocaleLowerCase("en-NG");
      if (username === undefined) return null;
      return (
        members.find((member) =>
          member.user.telegramIdentities.some(
            (identity) =>
              identity.username?.toLocaleLowerCase("en-NG") === username,
          ),
        ) ?? null
      );
    }
    if ("memberQuery" in call.arguments) {
      const query = call.arguments.memberQuery
        .normalize("NFKC")
        .trim()
        .replace(/^@/u, "")
        .toLocaleLowerCase("en-NG");
      const ranked = members.flatMap((member) => {
        const identity = member.user.telegramIdentities[0];
        const normalize = (value: string) =>
          value
            .normalize("NFKC")
            .trim()
            .replace(/^@/u, "")
            .toLocaleLowerCase("en-NG");
        const username =
          identity?.username === null || identity?.username === undefined
            ? undefined
            : normalize(identity.username);
        const publicName =
          identity === undefined ? undefined : normalize(displayName(identity));
        const legalName =
          member.legalNameEncrypted === null
            ? undefined
            : normalize(
                decryptString(
                  member.legalNameEncrypted,
                  this.options.encryption,
                  `member:${member.id}:legal-name`,
                ),
              );
        const score =
          username === query
            ? 50
            : publicName === query
              ? 40
              : legalName === query
                ? 30
                : [username, publicName, legalName].some(
                      (value) => value?.includes(query) === true,
                    )
                  ? 10
                  : 0;
        return score === 0 ? [] : [{ member, score }];
      });
      const best = Math.max(0, ...ranked.map(({ score }) => score));
      const matches = ranked
        .filter(({ score }) => score === best)
        .map(({ member }) => member);
      if (matches.length > 1)
        return {
          kind: "AMBIGUOUS_MEMBER",
          query: call.arguments.memberQuery,
          matches: matches.map((member) => ({
            displayName: this.memberName(member),
            position: member.payoutPosition,
          })),
        };
      return (
        matches[0] ?? {
          kind: "MEMBER_NOT_FOUND",
          query: call.arguments.memberQuery,
        }
      );
    }
    if (call.name.startsWith("get_my_") || call.name.startsWith("create_"))
      return members.find(({ id }) => id === context.actor?.memberId) ?? null;
    return null;
  }

  private async collageSnapshot(context: ResolvedAssistantContext) {
    if (context.collage === null) throw new Error("No Collage");
    return this.options.client.collage.findUniqueOrThrow({
      where: { id: context.collage.id },
      include: {
        cycles: {
          orderBy: { number: "asc" },
          include: {
            contributions: {
              include: {
                member: {
                  select: {
                    user: {
                      select: {
                        telegramIdentities: {
                          take: 1,
                          select: {
                            firstName: true,
                            lastName: true,
                            username: true,
                          },
                        },
                      },
                    },
                  },
                },
                paymentAttempts: {
                  where: { state: { in: ["CREATED", "PENDING", "UNKNOWN"] } },
                  select: { id: true },
                },
              },
            },
            payout: true,
            recipient: {
              select: {
                user: {
                  select: {
                    telegramIdentities: {
                      take: 1,
                      select: {
                        firstName: true,
                        lastName: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async potBalance(collageId: string): Promise<bigint> {
    const rows = await this.options.client.$queryRaw<
      readonly { readonly balance: bigint }[]
    >`
      SELECT COALESCE(sum(CASE WHEN le."side" = 'CREDIT' THEN le."amountMinor" ELSE -le."amountMinor" END), 0)::bigint AS "balance"
      FROM "ledger_entries" le JOIN "ledger_accounts" la ON la."id" = le."accountId"
      WHERE la."collageId" = ${collageId}::uuid AND la."code" = 'COLLAGE_POT'
    `;
    return rows[0]?.balance ?? 0n;
  }

  async execute(
    call: AssistantToolCall,
    context: ResolvedAssistantContext,
  ): Promise<AssistantToolResult> {
    if (context.collage === null)
      return { kind: "MESSAGE", message: "No active Collage was found." };
    const collage = await this.collageSnapshot(context);
    const current =
      collage.cycles.find((cycle) => cycle.state !== "COMPLETED") ??
      collage.cycles.at(-1);
    const members = await this.members(collage.id);
    const target = await this.resolveMember(call, context);
    if (target !== null && "kind" in target) return target;
    const member = target;
    const baseName = toolBaseName(call);
    const money = (value: bigint) =>
      formatMoneyDisplay(collage.currency, value);
    const memberTool =
      "memberReference" in call.arguments || "memberQuery" in call.arguments;
    if (memberTool && member === null) return { kind: "MEMBER_NOT_FOUND" };
    const memberLabel =
      member === null ? "Contributor" : this.memberName(member);
    const contribution =
      member === null || current === undefined
        ? undefined
        : current.contributions.find(({ memberId }) => memberId === member.id);
    const memberCycle =
      member?.payoutPosition === null || member?.payoutPosition === undefined
        ? undefined
        : collage.cycles.find(({ number }) => number === member.payoutPosition);

    if (
      baseName === "get_my_payout_schedule" ||
      baseName === "get_member_payout_schedule"
    )
      return {
        kind: "FACTS",
        title: `${collage.name} payout schedule`,
        facts: [
          { label: "Contributor", value: memberLabel },
          {
            label: "Position",
            value: member?.payoutPosition?.toString() ?? "Not assigned",
          },
          {
            label: "Expected date",
            value: date(
              memberCycle?.payoutScheduledAt ?? memberCycle?.deadlineAt,
              collage.timezone,
            ),
          },
          {
            label: "Payout amount",
            value:
              memberCycle === undefined
                ? "Not available"
                : money(memberCycle.expectedAmountMinor),
          },
        ],
      };
    if (
      baseName === "get_my_payout_position" ||
      baseName === "get_member_payout_position"
    ) {
      const payoutPosition = member?.payoutPosition;
      const previous =
        payoutPosition === null || payoutPosition === undefined
          ? undefined
          : members.find(
              ({ payoutPosition: candidatePosition }) =>
                candidatePosition === payoutPosition - 1,
            );
      return {
        kind: "FACTS",
        title: `${collage.name} payout position`,
        facts: [
          { label: "Contributor", value: memberLabel },
          {
            label: "Position",
            value: member?.payoutPosition?.toString() ?? "Not assigned",
          },
          { label: "Total positions", value: String(collage.participantLimit) },
          ...(baseName === "get_my_payout_position"
            ? [
                {
                  label: "Immediately before you",
                  value:
                    previous === undefined
                      ? "No contributor"
                      : this.memberName(previous),
                },
              ]
            : []),
        ],
      };
    }
    if (
      baseName === "get_my_current_payment_status" ||
      baseName === "get_member_public_payment_status"
    )
      return {
        kind: "FACTS",
        title: `${collage.name} contribution`,
        status: contribution?.state ?? "NOT_SCHEDULED",
        facts: [
          { label: "Contributor", value: memberLabel },
          {
            label: "Cycle",
            value:
              current === undefined ? "Not started" : String(current.number),
          },
          {
            label: "Amount",
            value:
              contribution === undefined
                ? "Not available"
                : money(contribution.amountMinor),
          },
          {
            label: "Deadline",
            value: date(current?.deadlineAt, collage.timezone),
          },
        ],
      };
    if (baseName === "get_member_public_payout_status")
      return {
        kind: "FACTS",
        title: `${collage.name} payout`,
        status: memberCycle?.payout?.state ?? "NOT_STARTED",
        facts: [
          { label: "Contributor", value: memberLabel },
          {
            label: "Position",
            value: member?.payoutPosition?.toString() ?? "Not assigned",
          },
        ],
      };
    if (baseName === "get_my_next_charge_schedule")
      return {
        kind: "FACTS",
        title: `${collage.name} next charge`,
        status: contribution?.state ?? "NOT_SCHEDULED",
        facts: [
          {
            label: "Amount",
            value:
              contribution === undefined
                ? "Not available"
                : money(contribution.amountMinor),
          },
          {
            label: "Scheduled attempt",
            value: date(contribution?.chargeAt, collage.timezone),
          },
          {
            label: "Deadline",
            value: date(current?.deadlineAt, collage.timezone),
          },
        ],
      };
    if (baseName === "get_my_outstanding_obligation")
      return {
        kind: "FACTS",
        title: `${collage.name} outstanding obligation`,
        facts: [
          {
            label: "Verified outstanding amount",
            value: money(member?.outstandingObligationMinor ?? 0n),
          },
          {
            label: "Current contribution",
            value:
              contribution === undefined
                ? "Not available"
                : money(contribution.amountMinor),
          },
          {
            label: "Current status",
            value: contribution?.state ?? "NOT_SCHEDULED",
          },
        ],
      };
    if (baseName === "get_my_remaining_contributions") {
      const remaining =
        member === null
          ? 0
          : collage.cycles.filter((cycle) =>
              cycle.contributions.some(
                ({ memberId, state }) =>
                  memberId === member.id && state !== "PAID",
              ),
            ).length;
      return {
        kind: "FACTS",
        title: `${collage.name} remaining contributions`,
        facts: [
          { label: "Remaining", value: String(remaining) },
          { label: "Total cycles", value: String(collage.participantLimit) },
        ],
      };
    }
    if (baseName === "get_my_registration_status")
      return {
        kind: "FACTS",
        title: `${collage.name} registration`,
        status: member?.state ?? "NOT_STARTED",
        facts: [
          {
            label: "Position",
            value: member?.payoutPosition?.toString() ?? "Not assigned",
          },
          {
            label: "Registered at",
            value: date(member?.registeredAt, collage.timezone),
          },
        ],
      };
    if (baseName === "get_my_payment_method_status")
      return {
        kind: "FACTS",
        title: `${collage.name} payment method`,
        status: member?.paymentMethods[0]?.state ?? "NOT_CONNECTED",
        facts: [
          {
            label: "Method",
            value:
              member?.paymentMethods[0]?.type.replaceAll("_", " ") ?? "None",
          },
        ],
        note: "Payment credentials and account details are never shown in a group.",
      };
    if (baseName === "get_my_current_cycle_summary")
      return this.cycleSummary(collage, current, money);
    if (baseName === "get_collage_status")
      return {
        kind: "FACTS",
        title: collage.name,
        status: collage.state,
        facts: [
          {
            label: "Contribution",
            value: money(collage.contributionAmountMinor),
          },
          {
            label: "Members",
            value: `${String(members.filter(({ state }) => registeredStates.has(state)).length)} of ${String(collage.participantLimit)}`,
          },
          {
            label: "Frequency",
            value:
              `${collage.frequencyInterval === 1 ? "" : `Every ${String(collage.frequencyInterval)} `}${collage.frequency.toLowerCase()}`.trim(),
          },
        ],
      };
    if (baseName === "get_current_cycle_status")
      return this.cycleSummary(collage, current, money);
    if (baseName === "get_collage_pot_balance")
      return {
        kind: "FACTS",
        title: `${collage.name} pot`,
        facts: [
          {
            label: "Ledger balance",
            value: money(await this.potBalance(collage.id)),
          },
          {
            label: "Current cycle",
            value: current?.number.toString() ?? "Not started",
          },
        ],
        note: "This is the Collage internal ledger balance, not the full provider wallet.",
      };
    if (baseName === "get_next_payout_recipient")
      return {
        kind: "FACTS",
        title: `${collage.name} next recipient`,
        facts: [
          {
            label: "Contributor",
            value:
              current === undefined
                ? "Not scheduled"
                : this.memberName(current.recipient),
          },
          {
            label: "Cycle",
            value: current?.number.toString() ?? "Not started",
          },
          {
            label: "Expected payout",
            value:
              current === undefined
                ? "Not available"
                : money(current.expectedAmountMinor),
          },
        ],
      };
    if (baseName === "get_previous_payout_recipient") {
      const prior = [...collage.cycles]
        .reverse()
        .find(({ state }) => state === "COMPLETED");
      return {
        kind: "FACTS",
        title: `${collage.name} previous recipient`,
        facts: [
          {
            label: "Contributor",
            value:
              prior === undefined
                ? "No completed payout"
                : this.memberName(prior.recipient),
          },
          { label: "Cycle", value: prior?.number.toString() ?? "None" },
        ],
      };
    }
    if (baseName === "get_remaining_cycles")
      return {
        kind: "FACTS",
        title: `${collage.name} remaining cycles`,
        facts: [
          {
            label: "Remaining",
            value: String(
              collage.cycles.filter(({ state }) => state !== "COMPLETED")
                .length,
            ),
          },
          { label: "Total", value: String(collage.participantLimit) },
        ],
      };
    if (baseName === "get_collage_expected_end")
      return {
        kind: "FACTS",
        title: `${collage.name} expected end`,
        facts: [
          {
            label: "Expected end",
            value: date(collage.cycles.at(-1)?.deadlineAt, collage.timezone),
          },
          { label: "Current state", value: collage.state },
        ],
      };
    if (baseName === "get_public_payout_order")
      return {
        kind: "FACTS",
        title: `${collage.name} payout order`,
        facts: members.map((item) => ({
          label: `Position ${String(item.payoutPosition ?? "—")}`,
          value: this.memberName(item),
        })),
      };
    if (baseName === "get_member_at_position" && "position" in call.arguments) {
      const position = call.arguments.position;
      const positioned = members.find(
        ({ payoutPosition }) => payoutPosition === position,
      );
      return {
        kind: "FACTS",
        title: `${collage.name} position ${String(position)}`,
        facts: [
          {
            label: "Contributor",
            value:
              positioned === undefined
                ? "Position is unfilled"
                : this.memberName(positioned),
          },
        ],
      };
    }
    if (baseName === "list_recent_payouts") {
      const payouts = collage.cycles
        .filter(({ payout }) => payout?.state === "SUCCESSFUL")
        .slice(-5);
      return {
        kind: "FACTS",
        title: `${collage.name} recent payouts`,
        facts:
          payouts.length === 0
            ? [{ label: "Payouts", value: "No completed payouts" }]
            : payouts.map((cycle) => ({
                label: `Cycle ${String(cycle.number)}`,
                value: `${this.memberName(cycle.recipient)} — ${money(cycle.expectedAmountMinor)}`,
              })),
      };
    }
    if (baseName === "list_current_pending_contributors") {
      const pending =
        current?.contributions.filter(({ state }) => state !== "PAID") ?? [];
      return {
        kind: "FACTS",
        title: `${collage.name} pending contributors`,
        facts:
          pending.length === 0
            ? [{ label: "Status", value: "Everyone has paid" }]
            : pending.map((item) => ({
                label: this.memberName(item.member),
                value: item.state.replaceAll("_", " "),
              })),
      };
    }
    if (baseName === "explain_current_cycle_block")
      return {
        kind: "FACTS",
        title: `${collage.name} cycle block`,
        status: current?.state ?? "NOT_STARTED",
        facts: [
          {
            label: "Outstanding contributors",
            value: String(
              current?.contributions.filter(({ state }) => state !== "PAID")
                .length ?? 0,
            ),
          },
          {
            label: "Confirmed",
            value:
              current === undefined
                ? "Not available"
                : money(current.confirmedAmountMinor),
          },
          {
            label: "Expected",
            value:
              current === undefined
                ? "Not available"
                : money(current.expectedAmountMinor),
          },
        ],
        note: "A strict cycle cannot pay out or advance until every required contribution is verified and the payout succeeds.",
      };
    if (baseName === "get_recipient_after_member") {
      const payoutPosition = member?.payoutPosition;
      const next =
        payoutPosition === null || payoutPosition === undefined
          ? undefined
          : members.find(
              ({ payoutPosition: candidatePosition }) =>
                candidatePosition === payoutPosition + 1,
            );
      return {
        kind: "FACTS",
        title: `${collage.name} payout order`,
        facts: [
          { label: "After", value: memberLabel },
          {
            label: "Next contributor",
            value:
              next === undefined ? "No later position" : this.memberName(next),
          },
        ],
      };
    }
    if (baseName === "explain_collage_rule" && "topic" in call.arguments)
      return this.ruleExplanation(collage, call.arguments.topic, money);
    if (call.name.startsWith("create_"))
      return this.action(call.name, context, collage, member, current);
    return {
      kind: "MESSAGE",
      message: "I could not map that question to a verified Collage fact.",
    };
  }

  private cycleSummary(
    collage: Awaited<
      ReturnType<PrismaAssistantToolExecutor["collageSnapshot"]>
    >,
    current:
      | Awaited<
          ReturnType<PrismaAssistantToolExecutor["collageSnapshot"]>
        >["cycles"][number]
      | undefined,
    money: (value: bigint) => string,
  ): AssistantToolResult {
    return {
      kind: "FACTS",
      title: `${collage.name} current cycle`,
      status: current?.state ?? "NOT_STARTED",
      facts: [
        {
          label: "Cycle",
          value:
            current === undefined
              ? "Not started"
              : `${String(current.number)} of ${String(collage.participantLimit)}`,
        },
        {
          label: "Confirmed",
          value:
            current === undefined
              ? "Not available"
              : money(current.confirmedAmountMinor),
        },
        {
          label: "Expected",
          value:
            current === undefined
              ? "Not available"
              : money(current.expectedAmountMinor),
        },
        {
          label: "Deadline",
          value: date(current?.deadlineAt, collage.timezone),
        },
      ],
    };
  }

  private ruleExplanation(
    collage: Awaited<
      ReturnType<PrismaAssistantToolExecutor["collageSnapshot"]>
    >,
    topic: string,
    money: (value: bigint) => string,
  ): AssistantToolResult {
    const defaults: Record<string, string> = {
      CONTRIBUTION_AMOUNT: `${money(collage.contributionAmountMinor)} per cycle.`,
      PAYMENT_SCHEDULE: `${collage.frequency.toLowerCase()} every ${String(collage.frequencyInterval)} interval(s), in ${collage.timezone}.`,
      GRACE_PERIOD: `${String(collage.gracePeriodMinutes)} minutes after the deadline.`,
      CYCLE_COMPLETION:
        "Every required contribution must be verified and the payout must succeed before the next cycle opens.",
      PAYOUT_ORDER:
        "The locked payout positions determine recipients after activation.",
      LEAVING_GROUP:
        "Leaving Telegram does not cancel an accepted Collage obligation.",
      PAYMENT_METHOD:
        "A contributor manages only their own method in the secure Mini App.",
      PAYOUT_ACCOUNT:
        "A contributor manages only their own verified payout account in the secure Mini App.",
      REGISTRATION:
        "Registration is complete only after required identity, payout account, rule consent, position, and payment setup checks pass.",
      DEFAULT:
        "An unpaid obligation after the grace period blocks the strict cycle; an administrator cannot mark it paid.",
      REMINDERS:
        "Reminders are generated from current verified unpaid obligations and omit unresolved provider attempts.",
    };
    return {
      kind: "MESSAGE",
      title: `${collage.name} rule v${String(collage.currentRuleVersion)}: ${topic.replaceAll("_", " ")}`,
      message:
        defaults[topic] ??
        "This rule is not configured in the locked Collage rule version.",
    };
  }

  private async action(
    name: string,
    context: ResolvedAssistantContext,
    collage: Awaited<
      ReturnType<PrismaAssistantToolExecutor["collageSnapshot"]>
    >,
    member: MemberRecord | null,
    current:
      | Awaited<
          ReturnType<PrismaAssistantToolExecutor["collageSnapshot"]>
        >["cycles"][number]
      | undefined,
  ): Promise<AssistantToolResult> {
    if (context.actor === null)
      return {
        kind: "MESSAGE",
        message: "A verified personal Telegram identity is required.",
      };
    const hasActivePaymentMethod =
      member?.paymentMethods.some(({ state }) => state === "ACTIVE") === true;
    const mapping: Record<
      string,
      { action: string; label: string; resourceId?: string }
    > = {
      create_my_manual_payment_action: {
        action: "PAY_CONTRIBUTION",
        label: "Complete payment",
        ...(current === undefined ? {} : { resourceId: current.id }),
      },
      create_update_payment_method_action: {
        action: hasActivePaymentMethod
          ? "REPLACE_PAYMENT_METHOD"
          : member !== null && registeredStates.has(member.state)
            ? "VIEW_COLLAGE"
            : "JOIN_COLLAGE",
        label: hasActivePaymentMethod
          ? "Replace payment method"
          : "Add payment method",
      },
      create_update_payout_account_action: {
        action: "UPDATE_PAYOUT_ACCOUNT",
        label: "Update payout account",
      },
      create_registration_resume_action: {
        action: "JOIN_COLLAGE",
        label: "Resume registration",
      },
      create_join_collage_action: {
        action: "JOIN_COLLAGE",
        label: "Join Collage",
      },
      create_view_payment_method_action: {
        action: "VIEW_COLLAGE",
        label: "Open payment settings",
      },
      create_view_payout_account_action: {
        action: "VIEW_COLLAGE",
        label: "Open payout settings",
      },
      create_my_payout_recovery_action: {
        action: "RETRY_PAYOUT",
        label: "Review payout",
        ...(current?.payout === null || current?.payout === undefined
          ? {}
          : { resourceId: current.payout.id }),
      },
    };
    const selected = mapping[name];
    if (selected === undefined) throw new Error("Unknown action");
    const currentContribution =
      current === undefined || member === null
        ? undefined
        : current.contributions.find(({ memberId }) => memberId === member.id);
    if (
      name === "create_my_manual_payment_action" &&
      (current === undefined ||
        member === null ||
        !["COLLECTING", "OVERDUE", "BLOCKED_BY_DEFAULT"].includes(
          current.state,
        ) ||
        currentContribution === undefined ||
        currentContribution.state === "PAID" ||
        currentContribution.paymentAttempts.length > 0)
    )
      return {
        kind: "MESSAGE",
        message:
          "There is no unpaid current-cycle contribution eligible for a new payment action. A provider operation that is still unresolved must be reconciled before another payment can start.",
      };
    if (
      (name === "create_join_collage_action" ||
        name === "create_registration_resume_action") &&
      collage.state !== "REGISTRATION_OPEN" &&
      member === null
    )
      return {
        kind: "MESSAGE",
        message: "Registration is not open for this Collage.",
      };
    const currentPayout = current?.payout;
    if (
      name === "create_my_payout_recovery_action" &&
      (current?.recipientMemberId !== member?.id ||
        currentPayout === null ||
        currentPayout === undefined ||
        !["FAILED", "REVERSED", "EXPIRED"].includes(currentPayout.state))
    )
      return {
        kind: "MESSAGE",
        message:
          "Payout recovery is available only to the current recipient after a definite retryable terminal outcome.",
      };
    const token = await this.options.launchTokens.issue(
      {
        action: selected.action,
        userId: context.actor.userId,
        chatId: collage.chatId,
        collageId: collage.id,
        ...(selected.resourceId === undefined
          ? {}
          : { resourceId: selected.resourceId }),
      },
      new Date(Date.now() + 10 * 60_000),
      true,
    );
    await this.options.client.auditLog.create({
      data: {
        actorType: "USER",
        actorId: context.actor.userId,
        action: "assistant.action-link.generated",
        entityType: "collage",
        entityId: collage.id,
        correlationId: context.requestId,
        source: "assistant",
        safeMetadata: { action: selected.action },
      },
    });
    return {
      kind: "MESSAGE",
      title: collage.name,
      message:
        "For your privacy and security, continue this action inside the Collage Mini App. The link expires in 10 minutes and is bound to your Telegram account and this Collage.",
      buttons: [
        {
          label: selected.label,
          url: buildTelegramMiniAppLink({
            botUsername: this.options.botUsername,
            shortName: this.options.miniAppShortName,
            startAppToken: token,
            mode: "compact",
          }),
        },
      ],
    };
  }
}
