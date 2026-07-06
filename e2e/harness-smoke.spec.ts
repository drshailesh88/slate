import { expect, test } from '@playwright/test';

/**
 * Boots the app through Playwright's webServer (`pnpm dev` with WorkOS creds
 * blanked) and proves the dev auth bypass renders the mock `Dr. Singh` session
 * — no live WorkOS login required. Later SR journeys reuse this bypass.
 */
test('home renders under the dev auth bypass', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Dr. Singh',
  );
});
