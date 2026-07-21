import type { AssistantQueryResponse } from "@collage/contracts";
import { escapeTelegramHtml } from "@collage/telegram";

import type { AssistantToolResult } from "../tools/result.js";

const bold = (value: string): string => `<b>${escapeTelegramHtml(value)}</b>`;

export const formatToolResult = (
  result: AssistantToolResult,
  replyToMessageId: number,
  messageThreadId?: number,
): AssistantQueryResponse => {
  let text: string;
  if (result.kind === "AMBIGUOUS_MEMBER") {
    const people = result.matches
      .map(
        (person, index) =>
          `${String(index + 1)}. ${escapeTelegramHtml(person.displayName)}${person.position === null ? "" : ` — position ${String(person.position)}`}`,
      )
      .join("\n");
    text = `${bold(`I found more than one contributor matching ${result.query}:`)}\n\n${people}\n\nPlease mention the person directly or reply to one of their messages.`;
  } else if (result.kind === "MEMBER_NOT_FOUND") {
    text = `${bold("Contributor not found")}${result.query === undefined ? "" : `\nI could not match ${escapeTelegramHtml(result.query)} to a contributor in this Collage.`}\n\nMention the person directly, reply to their message, or use their exact registered name.`;
  } else if (result.kind === "MESSAGE") {
    text = `${result.title === undefined ? "" : `${bold(result.title)}\n`}${escapeTelegramHtml(result.message)}`;
  } else {
    const facts = result.facts
      .map(
        ({ label, value }) =>
          `${bold(`${label}:`)} ${escapeTelegramHtml(value)}`,
      )
      .join("\n");
    text = `${bold(result.title)}${result.status === undefined ? "" : `\n${bold("Status:")} ${escapeTelegramHtml(result.status)}`}\n\n${facts}${result.note === undefined ? "" : `\n\n${escapeTelegramHtml(result.note)}`}`;
  }
  const buttons =
    result.kind === "AMBIGUOUS_MEMBER" ||
    result.kind === "MEMBER_NOT_FOUND" ||
    result.buttons === undefined
      ? undefined
      : result.buttons.map((button) => [
          { label: button.label, url: button.url },
        ]);
  return {
    text,
    parseMode: "HTML",
    disableLinkPreview: true,
    replyToMessageId,
    ...(messageThreadId === undefined ? {} : { messageThreadId }),
    ...(buttons === undefined || buttons.length === 0 ? {} : { buttons }),
  };
};

export const deterministicAssistantResponse = (
  kind:
    | "ANONYMOUS"
    | "CLARIFY"
    | "DISABLED"
    | "NO_COLLAGE"
    | "RATE_LIMIT"
    | "REFUSED"
    | "UNAUTHORIZED"
    | "UNAVAILABLE",
  replyToMessageId: number,
  messageThreadId?: number,
): AssistantQueryResponse => {
  const messages = {
    ANONYMOUS:
      "I cannot determine which contributor sent this message because it was posted anonymously. Send the question from your personal Telegram account.",
    CLARIFY:
      "I could not identify the contributor safely. Mention the person directly, reply to their message, or use their exact registered name.",
    DISABLED:
      "The Collage assistant is currently disabled. You can still use /status or /rules.",
    NO_COLLAGE:
      "This group does not have an open or active Collage. Use /collage to view the available setup action.",
    RATE_LIMIT:
      "You have asked the Collage assistant too often. Please wait a minute, then try again. /status and /rules remain available.",
    REFUSED:
      "I cannot perform or disclose that request. Collage permissions, payout order, payment evidence, and private financial information cannot be bypassed through the assistant.",
    UNAUTHORIZED:
      "I cannot provide that Collage information to this Telegram account. Open the secure Mini App or ask a registered contributor to check.",
    UNAVAILABLE:
      "The Collage assistant is temporarily unavailable. You can still use /status or /rules.",
  } as const;
  return {
    text: escapeTelegramHtml(messages[kind]),
    parseMode: "HTML",
    disableLinkPreview: true,
    replyToMessageId,
    ...(messageThreadId === undefined ? {} : { messageThreadId }),
  };
};
