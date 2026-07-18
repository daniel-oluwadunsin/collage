export * from "./init-data.js";

const htmlEscapes: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export const escapeTelegramHtml = (value: string): string =>
  value.replaceAll(/[&<>"]/g, (character) => htmlEscapes[character] ?? "");
