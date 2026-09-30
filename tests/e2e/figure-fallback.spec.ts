import { expect, test } from '@playwright/test';

// Chrome without WebGL: the viewer must fall back to the pre-rendered frames, for the M1 Smith squat and
// for a pose-library figure. (three.js logs a console error when it cannot create a context, so these
// tests do not assert on console errors.)
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

for (const id of ['smith-squat', 'db-curl']) {
  test(`the ${id} viewer falls back to still images without WebGL`, async ({ page }) => {
    await page.goto(`/ai_health/en/dev/figures/${id}/`);
    const viewer = page.locator('[data-figure-status="unavailable"]');
    await expect(viewer).toBeVisible({ timeout: 60_000 });
    const images = viewer.locator('img');
    await expect(images).toHaveCount(3);
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  });
}
