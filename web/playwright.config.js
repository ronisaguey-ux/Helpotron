/* Playwright CLI config for helpotron web.
 * Shared base for ad-hoc browser QA scripts (testDir = ./scripts).
 * Run: node scripts/pw_smoke.mjs  (or `npm run test:ui`) */
import { defineConfig } from 'playwright';

export default defineConfig({
  testDir: './scripts',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
});
