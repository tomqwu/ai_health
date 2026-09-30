import { expect, test } from '@playwright/test';
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

test.describe('root page', () => {
  test.use({ locale: 'zh-CN' });
  test('picks the browser language', async ({ page }) => {
    await page.goto('/ai_health/');
    await expect(page).toHaveURL(/\/ai_health\/zh\/$/);
  });
});

test('unknown pages return the 404 page', async ({ page }) => {
  const res = await page.goto('/ai_health/does-not-exist/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('Page not found');
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const path of PAGES) {
    test(`/en/${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(`/ai_health/en/${path}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
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
