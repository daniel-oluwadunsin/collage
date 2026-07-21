import type { AssistantQueryRequest } from "@collage/contracts";

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const sanitizeAssistantMessage = (
  input: AssistantQueryRequest,
): { readonly text: string; readonly references: ReadonlySet<string> } => {
  let text = input.text;
  const references = new Set<string>();
  for (const mention of input.mentions) {
    const candidates = [mention.username, mention.displayName]
      .filter((value): value is string => value !== undefined)
      .sort((left, right) => right.length - left.length);
    for (const candidate of candidates) {
      text = text.replaceAll(
        new RegExp(`@?${escapeRegExp(candidate)}`, "giu"),
        `<${mention.reference}>`,
      );
    }
    references.add(mention.reference);
  }
  if (input.replyTarget !== undefined) {
    references.add("REPLY_TARGET");
    text = `${text}\nContext: the message replies to <REPLY_TARGET>.`;
  }
  return { text: text.trim(), references };
};

export const containsFirstPersonPronoun = (text: string): boolean =>
  /\b(?:i|i'm|im|me|my|mine|myself)\b/iu.test(text);
