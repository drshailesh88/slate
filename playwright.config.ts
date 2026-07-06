import { defineConfig, devices } from '@playwright/test';

// A dedicated port (not Next's default 3000) so E2E always boots its own
// bypass-configured server instead of reusing an unrelated `pnpm dev`.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E runs against `pnpm dev` with WorkOS credentials blanked, which forces
 * Slate's dev auth bypass (`isDevAuthBypassActive()` in src/lib/auth/config.ts)
 * on — so journeys render the mock `Dr. Singh` session without a live WorkOS
 * login. This replaces the precursor's Clerk `__playwright` cookie.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'development',
      WORKOS_API_KEY: '',
      WORKOS_CLIENT_ID: '',
      WORKOS_COOKIE_PASSWORD: '',
    },
  },
});
