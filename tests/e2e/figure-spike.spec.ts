import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { collectErrors } from './helpers';

// Downsampled RGB signature of the canvas: samples every 7th pixel, hashed (FNV-1a) into one number.
const pixelSignature = (canvas: Locator) =>
  canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }).getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let hash = 2166136261;
    for (let i = 0; i < d.length; i += 4 * 7) {
      hash = Math.imul(hash ^ d[i]!, 16777619);
      hash = Math.imul(hash ^ d[i + 1]!, 16777619);
      hash = Math.imul(hash ^ d[i + 2]!, 16777619);
    }
    return hash >>> 0;
  });

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
  await expect(page.locator('svg.figure-overlay')).toBeVisible(); // frame 0 has been rendered
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);
  await page.getByRole('button', { name: /2\. Bottom/ }).click();
  await expect(page.getByRole('button', { name: /2\. Bottom/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => pixelSignature(canvas)).not.toBe(before);
});

test('shows the error state and fallback images when the model fails to load', async ({ page }) => {
  await page.route('**/models/human.glb', (route) => route.abort());
  await page.goto('/ai_health/en/dev/figure-spike/');
  const viewer = page.locator('[data-figure-status="error"]');
  await expect(viewer).toBeVisible({ timeout: 90_000 });
  await expect(viewer.getByRole('status')).toHaveText(en['figure.loadError']);
  const images = viewer.locator('.figure-fallback-grid img');
  await expect(images).toHaveCount(3);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
});
