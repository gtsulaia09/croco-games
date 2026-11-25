// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/coverage/**", "playwright-report/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      // Security baseline: no dynamic code execution anywhere.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
    },
  },
  {
    // Game-critical and server code must never use Math.random().
    files: ["packages/game-engine/src/**/*.ts", "apps/worker/src/**/*.ts", "packages/security/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/testing/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the CSPRNG (cryptoRng / randomBytes) for anything game- or security-critical." },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "dangerouslySetInnerHTML is forbidden (XSS)." },
        { selector: "MemberExpression[property.name='innerHTML']", message: "innerHTML is forbidden (DOM XSS)." },
        { selector: "MemberExpression[property.name='outerHTML']", message: "outerHTML is forbidden (DOM XSS)." },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: "insertAdjacentHTML is forbidden (DOM XSS)." },
      ],
    },
  },
);
