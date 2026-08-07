import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two suites live in this repo and they need different environments:
 *
 *   client — src/**, jsdom + the React plugin (JSX must be transformed)
 *   server — server/**, plain node. No React plugin, no jsdom: loading the
 *            Express app under jsdom would give it a browser `fetch`/`XMLHttpRequest`
 *            and mask real Node behaviour.
 *
 * Coverage is configured once at the root so a single `npm run test:coverage`
 * reports both projects in one merged number.
 *
 * Server tests are `.mjs` on purpose: server/package.json has no "type" field,
 * so `.js` there resolves as CommonJS while the test files need ESM `import`.
 */
export default defineConfig({
  test: {
    globals: true,

    projects: [
      {
        plugins: [react()],
        test: {
          name: 'client',
          globals: true,
          environment: 'jsdom',
          setupFiles: './src/setupTests.js',
          include: ['src/**/*.test.{js,jsx}'],
        },
      },
      {
        test: {
          name: 'server',
          globals: true,
          environment: 'node',
          setupFiles: './server/tests/setup.mjs',
          include: ['server/tests/**/*.test.mjs'],
          // sql.js loads a WASM binary on init(); the first file pays ~2s.
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',

      // Scoped to business logic. Everything omitted here is either wiring,
      // static markup, or WebGL/GSAP code that cannot execute under jsdom —
      // see tests/README.md for the full rationale.
      include: [
        'server/index.js',
        'server/db.js',
        'server/email.js',
        'src/components/**/*.jsx',
        'src/context/**/*.jsx',
        'src/hooks/**/*.js',
        'src/lib/**/*.js',
        'src/pages/**/*.jsx',
      ],

      exclude: [
        // Wiring only — no branches worth asserting.
        'src/main.jsx',
        'src/App.jsx',

        // WebGL / GSAP / Lenis. jsdom has no canvas or layout engine; these are
        // exercised by the Puppeteer capture scripts in scripts/ instead.
        'src/components/SceneCanvas.jsx',
        'src/components/ShoeModel.jsx',
        'src/components/ProgressBridge.jsx',
        'src/components/LoadingBar.jsx',
        'src/components/InstallPrompt.jsx',
        'src/pages/Home.jsx',
        'src/hooks/useSmoothScroll.js',

        // Static markup, no logic. Each of these reports 100% branch coverage
        // with 0% statements — the signature of a component containing no
        // conditional at all, so a test would assert only that JSX renders.
        'src/components/LegalPage.jsx',
        'src/components/GrainOverlay.jsx',
        'src/pages/Contact.jsx',
        'src/pages/FAQ.jsx',
        'src/pages/PrivacyPolicy.jsx',
        'src/pages/TermsOfService.jsx',
        'src/pages/ShippingReturns.jsx',
        'src/pages/About.jsx',
        'src/pages/Categories.jsx',
        'src/pages/CheckoutCancel.jsx',

        // Two-line effect wrapper around document.title.
        'src/hooks/useDocumentTitle.js',

        // Scene/WebGL state, consumed only by the excluded 3D components.
        'src/context/SceneContext.jsx',

        // Test scaffolding and one-off scripts.
        'src/test/**',
        '**/*.test.{js,jsx,mjs}',
        'server/tests/**',
        'server/generate-hash.js',
        'server/test-*.js',
        'server/webhook-test.js',
      ],
    },
  },
});
