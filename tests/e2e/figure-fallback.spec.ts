import { expect, test } from '@playwright/test';

// Chrome without WebGL: the viewer must fall back to the pre-rendered frames.
// (three.js logs a console error when it cannot create a context, so this test does not assert on console errors.)
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('the spike page falls back to still images without WebGL', async ({ page }) => {
  await page.goto('/ai_health/en/dev/figure-spike/');
  const viewer = page.locator('[data-figure-status="unavailable"]');
  await expect(viewer).toBeVisible({ timeout: 60_000 });
  await expect(viewer.locator('img')).toHaveCount(3);
});
