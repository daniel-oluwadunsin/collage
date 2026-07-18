import nextPlugin from "@next/eslint-plugin-next";
import { reactConfig } from "./react.js";

export const nextConfig = [
  ...reactConfig,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
