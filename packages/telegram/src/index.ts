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
  readonly shortName: string;
  readonly startAppToken: string;
  readonly mode?: "compact" | "fullscreen";
}): string => {
  const botUsername = input.botUsername.replace(/^@/u, "");
  if (
    !telegramPathPart.test(botUsername) ||
    !telegramPathPart.test(input.shortName)
  ) {
    throw new Error(
      "Telegram bot username and Mini App short name are invalid",
    );
  }
  const query = new URLSearchParams({
    startapp: input.startAppToken,
    mode: input.mode ?? "compact",
  });
  return `https://t.me/${botUsername}/${input.shortName}?${query.toString()}`;
};
