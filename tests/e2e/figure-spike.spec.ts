import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

for (const lang of ['en', 'zh']) {
  test(`/${lang}/dev/figure-spike/ renders the 3D viewer, frames and passing checks`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/ai_health/${lang}/dev/figure-spike/`);
    await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });

    const colours = await page.locator('canvas.figure-canvas').evaluate((c: HTMLCanvasElement) => {
      const ctx = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }).getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 7) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return seen.size;
    });
    expect(colours).toBeGreaterThan(200);

    await expect(page.locator('.figure-frames img')).toHaveCount(3);
    await expect(page.locator('.spike-checks tbody tr')).toHaveCount(15);
    await expect(page.locator('.spike-checks .fail')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('frame buttons switch the pose', async ({ page }) => {
  await page.goto('/ai_health/en/dev/figure-spike/');
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /2\. Bottom/ }).click();
  await expect(page.getByRole('button', { name: /2\. Bottom/ })).toHaveAttribute('aria-pressed', 'true');
});
