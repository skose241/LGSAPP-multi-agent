import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const noComments = {
  meta: {
    type: "problem",
    schema: [],
    messages: { forbidden: "Kod içinde yorum satırı yazılamaz." },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ loc: comment.loc, messageId: "forbidden" });
        }
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.next-e2e/**",
      "**/.next-demo/**",
      "**/.e2e/**",
      "**/generated/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/next-env.d.ts",
      "**/.azurite/**",
      "**/public/pdfjs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    plugins: { lgs: { rules: { "no-comments": noComments } } },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "lgs/no-comments": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
);
