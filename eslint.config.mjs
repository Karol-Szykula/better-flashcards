import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import perfectionist from "eslint-plugin-perfectionist";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "coverage/", "dist/", "main.js", "docs/**"],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  {
    plugins: {
      perfectionist,
    },
    rules: {
      "perfectionist/sort-interfaces": "error",
      "perfectionist/sort-jsx-props": "error",
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["tests/**/*", "jest.config.ts", "rollup.config.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },
];
