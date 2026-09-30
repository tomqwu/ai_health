import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// The root page redirects to the browser's preferred language (the first supported entry of navigator.languages,
// matched on the primary subtag); anything unsupported falls back to English.
for (const { locales, expected } of [
  { locales: ['zh-CN'], expected: 'zh' },
  { locales: ['zh-TW', 'en-US'], expected: 'zh' }, // pickLocale matches the primary subtag, so any zh-* is Chinese
  { locales: ['fr-FR', 'zh-CN'], expected: 'zh' }, // the first unsupported entry is skipped, not the whole list
  { locales: ['en-US'], expected: 'en' },
  { locales: ['fr-FR'], expected: 'en' },
]) {
  test.describe(`root page with browser languages ${locales.join(', ')}`, () => {
    // Playwright's `locale` sets a single language, so navigator.languages is overridden before the page's script runs.
    test(`redirects to /${expected}/`, async ({ page }) => {
      await page.addInitScript((languages) => {
        Object.defineProperty(navigator, 'languages', { get: () => languages });
        Object.defineProperty(navigator, 'language', { get: () => languages[0] });
      }, locales);
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
  // The 3D pages load a model and render with software WebGL, so they need more than the 30 s default.
  test.describe.configure({ timeout: 120_000 });
  const targets = [
    ...LOCALES.flatMap(({ code }) => [...PAGES, 'dev/figures/', 'dev/figures/smith-squat/'].map((path) => `/ai_health/${code}/${path}`)),
    '/ai_health/', // the language-detecting root page (it redirects)
    '/ai_health/does-not-exist/', // the 404 page
  ];
  for (const url of targets) {
    test(`${url} only requests its own origin`, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin;
      const foreign: string[] = [];
      const isForeign = (raw: string) => {
        const u = new URL(raw);
        return u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin;
      };
      page.on('request', (req) => {
        if (isForeign(req.url())) foreign.push(req.url());
      });
      page.on('websocket', (ws) => {
        if (isForeign(ws.url())) foreign.push(ws.url());
      });
      await page.goto(url);
      if (/\/dev\/figures\/[^/]+\/$/.test(url)) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
      // Scroll to the bottom in steps so lazy-loaded images request their files before the network goes idle.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.waitForLoadState('networkidle');
      expect(foreign).toEqual([]);
    });
  }

  // Hints such as preconnect and dns-prefetch open connections without emitting a request event, so the built
  // output is checked too: no external stylesheet, script, media, or CSS url()/@import anywhere in dist/.
  test('the build output references no external resources', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
    const all = files('dist');
    const external = /^(?:https?:)?\/\//i;
    const found: string[] = [];
    for (const file of all.filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      for (const [tag] of html.matchAll(/<(?:link|script|img|iframe|source|video|audio|embed|object|track)\b[^>]*>/gi)) {
        const rel = /\brel="([^"]*)"/i.exec(tag)?.[1] ?? '';
        const isLink = /^<link/i.test(tag);
        // <link rel="canonical|alternate"> point at documents, they are not fetched.
        if (isLink && !/\b(preconnect|dns-prefetch|prefetch|preload|modulepreload|stylesheet|icon|manifest)\b/i.test(rel)) continue;
        for (const attr of tag.matchAll(/\b(?:src|href|srcset|poster|data)="([^"]*)"/gi)) {
          if (attr[1]!.split(',').some((part) => external.test(part.trim().split(/\s+/)[0]!))) found.push(`${file}: ${tag}`);
        }
      }
    }
    for (const file of all.filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(file, 'utf8');
      if (/(?:url\(\s*|@import\s+(?:url\(\s*)?)["']?(?:https?:)?\/\//i.test(css)) found.push(file);
    }
    expect(all.some((f) => f.endsWith('.html'))).toBe(true); // dist/ exists: this is not vacuous
    expect(found).toEqual([]);
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  // The figure page mounts the 3D viewer (software WebGL on CI), so its sweep gets a longer budget.
  test.describe.configure({ timeout: 120_000 });
  for (const { code } of LOCALES) {
    for (const path of [...PAGES, 'dev/figures/', 'dev/figures/smith-squat/']) {
      test(`/${code}/${path} has no horizontal scroll`, async ({ page }) => {
        await page.goto(`/ai_health/${code}/${path}`);
        if (path.startsWith('dev/figures/') && path !== 'dev/figures/') await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
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
      for (const path of ['fitness/', 'safety/', 'dev/figures/', 'dev/figures/smith-squat/']) {
        const d = await description(path);
        expect(d.trim(), path).not.toBe('');
        expect(d, path).not.toBe(home);
      }
    });
  }
});
