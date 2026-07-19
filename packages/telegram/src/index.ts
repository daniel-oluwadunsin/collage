export * from "./init-data.js";

const htmlEscapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export const escapeTelegramHtml = (value: string): string =>
  value.replaceAll(/[&<>"]/g, (character) => htmlEscapes[character] ?? "");

export const safeTelegramMention = (
  telegramUserId: string,
  displayName: string,
): string => {
  if (!/^\d+$/u.test(telegramUserId)) {
    throw new Error("Telegram user ID must contain only digits");
  }
  return `<a href="tg://user?id=${telegramUserId}">${escapeTelegramHtml(displayName)}</a>`;
};

const telegramPathPart = /^[A-Za-z0-9_]{1,64}$/u;

export const buildTelegramMiniAppLink = (input: {
  readonly botUsername: string;
  readonly shortName?: string;
  readonly startAppToken: string;
  readonly mode?: "compact" | "fullscreen";
}): string => {
  const botUsername = input.botUsername.replace(/^@/u, "");
  if (!telegramPathPart.test(botUsername)) {
    throw new Error("Telegram bot username is invalid");
  }
  if (
    input.shortName !== undefined &&
    !telegramPathPart.test(input.shortName)
  ) {
    throw new Error("Telegram Mini App short name is invalid");
  }
  const query = new URLSearchParams({
    startapp: input.startAppToken,
    mode: input.mode ?? "compact",
  });
  const appPath =
    input.shortName === undefined
      ? botUsername
      : `${botUsername}/${input.shortName}`;
  return `https://t.me/${appPath}?${query.toString()}`;
};
