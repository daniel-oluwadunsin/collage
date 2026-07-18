import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const forbiddenInfrastructureImports = [
  "@collage/database",
  "@collage/monnify",
  "@collage/queue",
  "@collage/telegram",
];

export const baseConfig = [
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/domain/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: forbiddenInfrastructureImports.map((name) => ({
            name,
            message: "The domain package must remain infrastructure-free.",
          })),
          patterns: [
            {
              group: ["express", "bullmq", "@prisma/*", "grammy", "redis"],
              message: "The domain package must remain infrastructure-free.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@collage/ui",
              message: "Server applications cannot import browser UI.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/bot/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@collage/database",
              message: "The bot calls the internal API and does not own data.",
            },
            {
              name: "@collage/monnify",
              message: "The bot must never call Monnify.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/mini-app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "@collage/database",
            "@collage/logger",
            "@collage/monnify",
            "@collage/queue",
            "@collage/security",
          ].map((name) => ({
            name,
            message: "Browser code may import only browser-safe contracts/UI.",
          })),
        },
      ],
    },
  },
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/generated/**",
      "**/node_modules/**",
    ],
  },
];
