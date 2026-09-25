import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import perfectionist from "eslint-plugin-perfectionist";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

const productionFiles = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "main.ts",
  "main.dev.ts",
];
const typeScriptFiles = ["**/*.ts", "**/*.tsx"];

const layerViolation = {
  patterns: [
    {
      group: ["src/gui/*", "src/gui/**"],
      message: "Layer rule: services and entities never import the gui layer.",
    },
  ],
};

export default [
  {
    ignores: ["node_modules/", "coverage/", "dist/", "main.js", "docs/**"],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"].map((config) => ({
    ...config,
    files: typeScriptFiles,
  })),
  {
    files: typeScriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...tsPlugin.configs["flat/strict-type-checked"].map((config) => ({
    ...config,
    files: productionFiles,
  })),
  {
    files: productionFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      perfectionist,
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      complexity: ["error", 18],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports" },
      ],
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        { max: 225, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 7],
      "max-statements": ["error", 55],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "no-console": "error",
      "perfectionist/sort-interfaces": "error",
      "perfectionist/sort-jsx-props": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "sonarjs/cognitive-complexity": ["error", 20],
      "@typescript-eslint/await-thenable": "off",
    },
  },
  {
    files: ["src/services/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["src/entities/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", layerViolation],
    },
  },
  {
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...layerViolation.patterns,
            {
              group: ["react", "react-dom"],
              message: "Layer rule: services never import React.",
            },
          ],
        },
      ],
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
