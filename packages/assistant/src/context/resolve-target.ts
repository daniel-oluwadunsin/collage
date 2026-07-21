export const memberReferencePattern = /^(?:MENTION_[1-9]\d*|REPLY_TARGET)$/u;

export const isTrustedMemberReference = (
  value: string,
  trusted: ReadonlySet<string>,
): boolean => memberReferencePattern.test(value) && trusted.has(value);
