import { expect, test } from '@playwright/test';
import { zh } from '../../src/lib/i18n/zh';
import { collectErrors } from './helpers';

const PAGES = ['', 'fitness/', 'safety/'];
const LOCALES = [
  { code: 'en', htmlLang: 'en' },
  { code: 'zh', htmlLang: 'zh-Hans' },
];

for (const { code, htmlLang } of LOCALES) {
  for (const path of PAGES) {
    test(`/${code}/${path} renders cleanly`, async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(`/ai_health/${code}/${path}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', htmlLang);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

test('language toggle maps to the same page', async ({ page }) => {
  await page.goto('/ai_health/en/fitness/');
  await page.locator('a[hreflang="zh-Hans"]').click();
  await expect(page).toHaveURL(/\/ai_health\/zh\/fitness\/$/);
});

// The root page redirects to the browser's preferred language; anything unsupported falls back to English.
for (const { locale, expected } of [
  { locale: 'zh-CN', expected: 'zh' },
  { locale: 'en-US', expected: 'en' },
  { locale: 'fr-FR', expected: 'en' },
]) {
  test.describe(`root page with browser language ${locale}`, () => {
    test.use({ locale });
    test(`redirects to /${expected}/`, async ({ page }) => {
      await page.goto('/ai_health/');
      await expect(page).toHaveURL(new RegExp(`/ai_health/${expected}/$`));
    });
  });
}

test('unknown pages return the 404 page', async ({ page }) => {
  const res = await page.goto('/ai_health/does-not-exist/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('Page not found');
});

test('the 404 page also has its heading and back link in Chinese', async ({ page }) => {
  await page.goto('/ai_health/does-not-exist/');
  await expect(page.locator('h1 [lang="zh-Hans"]')).toHaveText(zh['notFound.title']);
  await expect(page.locator('a[lang="zh-Hans"]')).toHaveText(zh['notFound.back']);
  await expect(page.locator('a[lang="zh-Hans"]')).toHaveAttribute('href', /\/ai_health\/zh\/$/);
});

// Privacy: no runtime third-party requests. Every request a page makes goes to the site's own origin.
test.describe('same-origin requests', () => {
  // The 3D page loads a model and renders with software WebGL, so it needs more than the 30 s default.
  test.describe.configure({ timeout: 120_000 });
  for (const path of ['', 'fitness/', 'dev/figure-spike/']) {
    test(`/en/${path} only requests its own origin`, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin;
      const foreign: string[] = [];
      page.on('request', (req) => {
        const url = new URL(req.url());
        if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== origin) foreign.push(req.url());
      });
      await page.goto(`/ai_health/en/${path}`);
      if (path.startsWith('dev/')) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
      await page.waitForLoadState('networkidle');
      expect(foreign).toEqual([]);
    });
  }
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  // The spike page mounts the 3D viewer (software WebGL on CI), so its sweep gets a longer budget.
  test.describe.configure({ timeout: 120_000 });
  for (const { code } of LOCALES) {
    for (const path of [...PAGES, 'dev/figure-spike/']) {
      test(`/${code}/${path} has no horizontal scroll`, async ({ page }) => {
        await page.goto(`/ai_health/${code}/${path}`);
        if (path.startsWith('dev/')) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe('meta descriptions', () => {
  for (const { code } of LOCALES) {
    test(`/${code}/ pages each have their own description`, async ({ page }) => {
      const description = async (path: string) => {
        await page.goto(`/ai_health/${code}/${path}`);
        return (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
      };
      const home = await description('');
      expect(home.trim()).not.toBe('');
      for (const path of ['fitness/', 'safety/', 'dev/figure-spike/']) {
        const d = await description(path);
        expect(d.trim(), path).not.toBe('');
        expect(d, path).not.toBe(home);
      }
    });
  }
});
