// Single source of truth for ESLint config (flat config, ESLint v9+)
// .cjs extension: repo has "type":"module" so CommonJS config must not be .js
module.exports = [
  {
    ignores: [
      "node_modules/**",
      "data/**",
      "backups/**",
      "logs/**",
      "storage/**",
      "client/**",
      // Syntax/import broken vs model exports; legacy path — fix in dedicated PR
      "server/controllers/database/serverDatabaseController.js",
    ],
  },
  // Default: ESM (server, tests, tooling scripts)
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        Promise: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        setImmediate: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { caughtErrors: "none", argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "warn",
    },
  },
  // Legacy CommonJS utilities and scripts that intentionally still use require/module.
  {
    files: [
      "app/routes/registerAppRoutes.js",
      "scripts/backup.js",
      "scripts/check-db-tables.js",
      "scripts/fix-inventory-gpu-image.js",
      "scripts/fixDuplicateMinerImageUrls.js",
      "scripts/inspect-faucet-inventory.js",
      "scripts/inspect-faucet.js",
      "scripts/seed-rewards-data.js",
      "server/src/config/index.js",
      "server/src/services/publicStateService.js",
    ],
    languageOptions: {
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
  },
  // Hardhat / legacy CommonJS under contracts/
  {
    files: ["contracts/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
      },
    },
  },
  // Legacy browser bundles (no ESM)
  {
    files: ["public/js/**/*.js", "admin/**/*.js", "LiveDashboard/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        alert: "readonly",
        confirm: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        WebSocket: "readonly",
        io: "readonly",
      },
    },
  },
];
