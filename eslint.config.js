import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Flat config (package.json is "type": "module", so ESM is correct here).
 *
 * Two environments live in this repo and they do NOT share globals:
 *   - src/**       browser + JSX, React 18 automatic runtime
 *   - server/**    Node CommonJS
 */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'server/node_modules/**',
      // One-off codemods kept for reference; not part of the app.
      'refactor*.cjs',
      'ktx/**',
      'test-screenshots/**',
    ],
  },

  // ── Frontend ───────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...(reactHooks.configs.recommended?.rules ?? {}),
      // Vite HMR works best when a module exports only components.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Loop/catch bindings named _ or leading-underscore are intentional.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
        caughtErrors: 'none',
      }],
    },
  },

  // ── Test files ─────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // ── Backend (CommonJS) ─────────────────────────────────────────────────────
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // scripts/ are ES modules despite living outside src/. They are Puppeteer
  // drivers, so they legitimately contain browser code inside page.evaluate()
  // callbacks — both global sets apply.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
