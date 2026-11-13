import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    plugins: { "@next/next": next, "react-hooks": hooks },
    rules: { "@next/next/no-img-element": "warn", "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
);
