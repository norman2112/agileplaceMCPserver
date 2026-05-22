import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-shadow": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-fallthrough": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-throw-literal": "error",
      "prefer-const": "error",
      "preserve-caught-error": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
    },
  },
  {
    files: ["src/__tests__/**/*.mjs"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
];
