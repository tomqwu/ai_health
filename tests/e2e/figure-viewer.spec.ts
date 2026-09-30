import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { FIGURES } from '../../src/lib/figure/fixtures';
import { SMITH_SQUAT } from '../../src/lib/figure/fixtures/smith-squat';
import { EQUIPMENT_MODELS } from '../../src/lib/figure/geometry/models';
import { en } from '../../src/lib/i18n/en';
import { collectErrors } from './helpers';

// Software WebGL on CI (SwiftShader, no GPU) can take seconds per frame, and each render blocks the
// page's main thread, so these tests get a longer budget than the 30 s default.
test.describe.configure({ timeout: 120_000 });
const RENDER_TIMEOUT = { timeout: 30_000 };

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

const SQUAT = '/ai_health/en/dev/figures/smith-squat/';

for (const lang of ['en', 'zh']) {
  test(`/${lang}/dev/figures/smith-squat/ renders the 3D viewer, frames and passing checks`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/ai_health/${lang}/dev/figures/smith-squat/`);
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
    await expect(page.locator('.figure-checks tbody tr')).toHaveCount(15);
    await expect(page.locator('.figure-checks .fail')).toHaveCount(0);
    await expect(page.locator('.figure-checks .warn')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('frame buttons switch the pose', async ({ page }) => {
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('svg.figure-overlay')).toBeVisible(RENDER_TIMEOUT); // frame 0 has been rendered
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);
  await page.getByRole('button', { name: /2\. Bottom/ }).click();
  await expect(page.getByRole('button', { name: /2\. Bottom/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => pixelSignature(canvas), RENDER_TIMEOUT).not.toBe(before);
});

test('Play animates the figure without errors and Pause stops it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('svg.figure-overlay')).toBeVisible(RENDER_TIMEOUT); // frame 0 has been rendered
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);

  await page.getByRole('button', { name: en['figure.play'], exact: true }).click();
  const pause = page.getByRole('button', { name: en['figure.pause'], exact: true });
  await expect(pause).toBeVisible();
  await page.waitForTimeout(1200); // about one segment of the loop
  expect(errors).toEqual([]);
  expect(await pixelSignature(canvas)).not.toBe(before);

  await pause.click();
  await expect(page.getByRole('button', { name: en['figure.play'], exact: true })).toBeVisible();
  await expect(pause).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Reset view restores the camera and the movement arrow', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  const overlay = page.locator('svg.figure-overlay');
  await expect(overlay).toBeVisible(RENDER_TIMEOUT); // frame 1 shows its arrow
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);

  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, Math.max(box.y, 0) + 100]; // a point inside the viewport
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y, { steps: 10 });
  await page.mouse.up();
  await expect(overlay).toHaveCount(0, RENDER_TIMEOUT); // orbiting hides the arrow (it would no longer line up)
  await expect.poll(() => pixelSignature(canvas), RENDER_TIMEOUT).not.toBe(before);

  await page.getByRole('button', { name: en['figure.resetView'], exact: true }).click();
  await expect(overlay).toBeVisible(RENDER_TIMEOUT);
  await expect.poll(() => pixelSignature(canvas), RENDER_TIMEOUT).toBe(before);
  expect(errors).toEqual([]);
});

test('the canvas is an image whose label names the step and says when it is animating', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  const canvas = page.locator('canvas.figure-canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  const name = SMITH_SQUAT.name.en;
  const [first, second] = SMITH_SQUAT.frames.map((f) => f.label.en);
  await expect(canvas).toHaveAttribute('aria-label', `${name} — ${first}`, RENDER_TIMEOUT);
  await page.getByRole('button', { name: /2\. Bottom/ }).click();
  await expect(canvas).toHaveAttribute('aria-label', `${name} — ${second}`, RENDER_TIMEOUT);

  await page.getByRole('button', { name: en['figure.play'], exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-label', `${name} — ${en['figure.animating']}`, RENDER_TIMEOUT);
  await page.getByRole('button', { name: en['figure.pause'], exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-label', `${name} — ${second}`, RENDER_TIMEOUT); // accurate again once paused
  expect(errors).toEqual([]);
});

test('the canvas and the arrow overlay follow the container width', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  const canvas = page.locator('canvas.figure-canvas');
  const overlay = page.locator('svg.figure-overlay');
  await expect(overlay).toBeVisible(RENDER_TIMEOUT);

  // One atomic read: the canvas sizes, the overlay viewBox, and the arrow's tail (the shaft's first point)
  // and tip (the head's first point). Both points scale exactly with the stage size; the shaft's far end does not
  // (it stops a fixed 18 px short of the tip), so it is not compared.
  const state = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const first = (sel: string) => {
        const d = document.querySelector(sel)?.getAttribute('d') ?? '';
        const nums = d.match(/-?\d+(?:\.\d+)?/g)?.slice(0, 2).map(Number);
        return nums && nums.length === 2 ? nums : null;
      };
      return {
        css: c.clientWidth,
        backing: c.width,
        viewBox: document.querySelector('svg.figure-overlay')?.getAttribute('viewBox') ?? null,
        ratio: Math.min(window.devicePixelRatio, 2),
        arrow: { tail: first('.figure-arrow__line'), tip: first('.figure-arrow__head') },
      };
    });
  type State = Awaited<ReturnType<typeof state>>;
  const consistent = (s: State) =>
    s.backing === Math.floor(s.css * s.ratio) && s.viewBox === `0 0 ${s.css} ${Math.round((s.css * 4) / 3)}`;
  // The arrow's points equal `from`'s scaled by `k`, within a pixel.
  const arrowMatches = (s: State, from: State, k: number) =>
    s.arrow.tail !== null &&
    s.arrow.tip !== null &&
    from.arrow.tail !== null &&
    from.arrow.tip !== null &&
    [...s.arrow.tail, ...s.arrow.tip].every((v, i) => Math.abs(v - [...from.arrow.tail!, ...from.arrow.tip!][i]! * k) <= 1);

  await expect.poll(async () => consistent(await state()), RENDER_TIMEOUT).toBe(true);
  const initial = await state();
  expect(initial.arrow.tail).not.toBeNull();
  expect(initial.arrow.tip).not.toBeNull();

  await page.setViewportSize({ width: 420, height: 900 });
  await expect.poll(async () => (await state()).css, RENDER_TIMEOUT).toBeLessThan(initial.css);
  await expect
    .poll(async () => {
      const s = await state();
      return consistent(s) && arrowMatches(s, initial, s.css / initial.css);
    }, RENDER_TIMEOUT)
    .toBe(true);
  const small = await state();
  // The arrow really moved (a stale, un-projected arrow would keep its old coordinates).
  expect(small.arrow.tip![0]!).toBeLessThan(initial.arrow.tip![0]! - 10);

  // Orbiting hides the arrow; Reset view brings it back, re-projected for the new size.
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, Math.max(box.y, 0) + 100];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 10 });
  await page.mouse.up();
  await expect(overlay).toHaveCount(0, RENDER_TIMEOUT);
  await page.getByRole('button', { name: en['figure.resetView'], exact: true }).click();
  await expect(overlay).toBeVisible(RENDER_TIMEOUT);
  await expect.poll(async () => arrowMatches(await state(), small, 1), RENDER_TIMEOUT).toBe(true);

  // And growing back works too: the buffer and the arrow return to their original values.
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect
    .poll(async () => {
      const s = await state();
      return consistent(s) && s.backing === initial.backing && arrowMatches(s, initial, 1);
    }, RENDER_TIMEOUT)
    .toBe(true);
  expect(errors).toEqual([]);
});

test('shows the error state and fallback images when the model fails to load', async ({ page }) => {
  await page.route('**/models/human.glb', (route) => route.abort());
  await page.goto(SQUAT);
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

test('the height picker re-poses the figure at another stature', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SQUAT);
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('svg.figure-overlay')).toBeVisible(RENDER_TIMEOUT);
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);
  await expect(page.locator('.figure-note')).toContainText(en['figure.typicalHeight']);
  await page.getByLabel(en['figure.height']).selectOption('200');
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.figure-note')).toContainText(en['figure.shownAt'].replace('{height}', '200'));
  await expect.poll(() => pixelSignature(canvas), RENDER_TIMEOUT).not.toBe(before);
  expect(errors).toEqual([]);
});

test('a generalized figure (dumbbell curl) renders, plays and has passing checks', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/ai_health/en/dev/figures/db-curl/');
  await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('svg.figure-overlay')).toBeVisible(RENDER_TIMEOUT);
  await expect(page.locator('.figure-checks .fail')).toHaveCount(0);
  const canvas = page.locator('canvas.figure-canvas');
  const before = await pixelSignature(canvas);
  await page.getByRole('button', { name: en['figure.play'], exact: true }).click();
  await page.waitForTimeout(1200);
  expect(await pixelSignature(canvas)).not.toBe(before);
  expect(errors).toEqual([]);
});

test('the gallery lists every figure and equipment model with its pre-rendered image', async ({ page }) => {
  await page.goto('/ai_health/en/dev/figures/');
  const images = page.locator('.figure-gallery img');
  await expect(images).toHaveCount(Object.keys(FIGURES).length + Object.keys(EQUIPMENT_MODELS).length);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
});
