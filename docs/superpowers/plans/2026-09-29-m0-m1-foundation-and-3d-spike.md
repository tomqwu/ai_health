# M0 Foundation + M1 3D Figure Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an empty-but-real bilingual (EN/中文) Astro site on GitHub Pages with CI, then prove the 3D exercise-figure pipeline end to end on one exercise (Smith machine squat) for the owner's sign-off.

**Architecture:** Astro 7 static site with `[lang]` routes; pure TypeScript libraries (`src/lib/**`) hold all logic and are unit-tested with Vitest; Preact islands only where interactivity is needed. The figure system is three layers: a pure pose layer (skeleton, IK, solvers, validators — no three.js), a pure geometry layer (equipment primitives from parameters), and a three.js layer that renders a CC0 MakeHuman figure posed by the pose layer. Figures are pre-rendered to WebP by headless Chromium for static pages and rendered live in an interactive viewer.

**Tech Stack:** Astro 7.3.5, @astrojs/preact 6.0.5, Preact 10.29.8, TypeScript 6.0.3, Vitest 5.0.2, Playwright 1.63.0, ESLint 10.11.0 + typescript-eslint 8.71.0 + eslint-plugin-astro 3.2.1, three 0.186.1, @gltf-transform 4.5.1, meshoptimizer 1.3.0, sharp 0.35.5, tsx 4.23.15, Blender 5.2 LTS + MPFB 2.0.17 (local only), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-09-29-fitness-platform-design.md` (§16: this plan covers M0 and M1 only).

## Global Constraints

- Node ≥ 22.12.0 (Astro 7 requirement); CI uses Node 24 via `.nvmrc`.
- Pin TypeScript to **6.0.3** — `@astrojs/check` supports `^5 || ^6` and typescript-eslint requires `<6.1.0`; do not install TypeScript 7.
- Site URL `https://tomqwu.github.io/ai_health/`: `site: 'https://tomqwu.github.io'`, `base: '/ai_health'`, `trailingSlash: 'always'`. Internal links always go through `withBase()` / `localizedPath()`.
- Locales `en` and `zh` (Simplified Chinese, `<html lang="zh-Hans">`), both URL-prefixed (`/ai_health/en/…`, `/ai_health/zh/…`). Routing is implemented with `src/pages/[lang]/` + `getStaticPaths` (satisfies spec §10 without Astro's i18n middleware).
- Every user-facing string exists in EN and 中文. UI strings live in typed dictionaries — a missing key is a type error. Figure data uses `{ en, zh }` objects.
- No runtime third-party requests: no CDNs, web fonts or analytics. Fonts come from the system stack including `PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`.
- Privacy (spec §13): no personal data in the repo, issues, PRs, commit messages, fixtures or logs. Fixtures use synthetic data. Owner photos are never committed or attached. No equipment brand names anywhere.
- Pure layers (`src/lib/figure/math`, `src/lib/figure/pose`, `src/lib/figure/geometry`, `src/lib/i18n`, `src/lib/areas.ts`, `src/lib/site.ts`) must not import `three`, the DOM, or Astro modules. Only `src/lib/figure/scene3d/**` imports `three`.
- Pose/geometry units are **centimetres** with glTF axes: **+Y up, +Z = the figure's facing direction, +X = the figure's LEFT**. The three.js scene uses metres (cm ÷ 100).
- The human model is generated from CC0 MakeHuman assets only; the `.blend` is never committed; `public/models/human.glb` ≤ 8 MB.
- Downloads of the MPFB extension (3 MB, extensions.blender.org) and `makehuman_system_assets_cc0.zip` (267 MB, files2.makehumancommunity.org) require the owner's explicit OK at execution time (Task 11 Step 1).
- Astro 7 auto-backgrounds `astro dev` / `astro preview` when it detects an AI agent. Anything that manages a server's lifetime (Playwright `webServer`, `scripts/render-figures.ts`) passes `--ignore-lock` to stay in the foreground. Stop a stray server with `npx astro dev stop` or `npx astro preview stop`.
- Git: one branch + PR per issue, PR body contains `Closes #N`, squash-merge when CI is green; `gate:user-review` issues wait for the owner. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## File Map

```
.nvmrc, .gitignore, package.json, package-lock.json, README.md
astro.config.mjs, tsconfig.json, vitest.config.ts, eslint.config.js, playwright.config.ts
.github/workflows/ci.yml, .github/workflows/deploy.yml
.github/ISSUE_TEMPLATE/{config,feature,content,bug}.yml
docs/architecture.md, docs/figure-pipeline.md
public/favicon.svg
public/models/human.glb                         (Task 11, committed, generated)
public/figures/                                  (Task 13, generated, gitignored)
assets-src/human/{README.md,LICENSE.md,human.config.json,generate_human.py,install_assets.py}
scripts/setup-mpfb.sh, scripts/build-human.ts, scripts/render-figures.ts
scripts/lib/{extractSkeleton.ts,extractSkeleton.test.ts,imageCheck.ts,imageCheck.test.ts}
src/styles/global.css
src/layouts/BaseLayout.astro
src/components/{SiteHeader,SiteFooter,LanguageToggle,AreaCard}.astro
src/components/figure/{FigureViewer.tsx,FigureFrames.astro,SpikeChecks.astro,figure.css}
src/pages/index.astro, src/pages/404.astro
src/pages/[lang]/{index,safety}.astro, src/pages/[lang]/fitness/index.astro
src/pages/[lang]/dev/figure-spike.astro, src/pages/render/figure.astro
src/lib/site.ts (+ site.test.ts)
src/lib/areas.ts (+ areas.test.ts)
src/lib/i18n/{locales.ts,en.ts,zh.ts,index.ts} (+ i18n.test.ts)
src/lib/figure/math/{vec3.ts,quat.ts} (+ math.test.ts)
src/lib/figure/pose/{skeleton.ts,builder.ts,hands.ts,synthetic.ts,smithSquat.ts,validate.ts} (+ tests)
src/lib/figure/pose/skeleton.json               (Task 11, generated, committed)
src/lib/figure/geometry/{primitives.ts,smith.ts} (+ smith.test.ts)
src/lib/figure/{arrow.ts,overlay.ts} (+ tests)
src/lib/figure/fixtures/{smith-squat.ts,index.ts}
src/lib/figure/scene3d/{stage.ts,equipment.ts,human.ts,figureScene.ts}
tests/e2e/{smoke.spec.ts,figure-spike.spec.ts}
tests/assets/human-model.test.ts
```

---

### Task 0: GitHub project setup

No code. Push the approved spec and create the tracking structure so every later task has an issue to close.

**Files:** none (GitHub state only). Record issue numbers in the table below as you create them.

| Task | Issue title | Labels | Milestone | Issue # |
|---|---|---|---|---|
| 1 | Scaffold Astro + TypeScript tooling and CI | area:platform, type:feature | M0 Foundation | #1 |
| 2 | i18n core: locales, dictionaries, localized paths | area:platform, type:feature | M0 Foundation | #2 |
| 3 | Site shell: area registry, layout, home and fitness pages | area:platform, type:feature | M0 Foundation | #3 |
| 4 | Safety page and 404 | area:platform, type:content | M0 Foundation | #4 |
| 5 | End-to-end smoke tests | area:platform, type:feature | M0 Foundation | #5 |
| 6 | Pages deploy, issue templates, architecture docs | area:platform, type:docs | M0 Foundation | #6 |
| 7 | Figure math core (vec3, quat) | area:figures, type:feature | M1 3D figure spike | #7 |
| 8 | Pose core: skeleton, FK, pose builder, hands | area:figures, type:feature | M1 3D figure spike | #8 |
| 9 | Smith machine geometry | area:figures, type:feature | M1 3D figure spike | #9 |
| 10 | Smith squat solver and validators | area:figures, type:feature | M1 3D figure spike | #10 |
| 11 | Human model pipeline (MakeHuman → glTF) | area:figures, type:feature | M1 3D figure spike | #11 |
| 12 | 3D scene: stage, equipment, human | area:figures, type:feature | M1 3D figure spike | #12 |
| 13 | Figure pre-render pipeline | area:figures, type:feature | M1 3D figure spike | #13 |
| 14 | Figure spike page and viewer | area:figures, type:feature | M1 3D figure spike | #14 |
| 15 | Figure pipeline docs | area:figures, type:docs | M1 3D figure spike | #15 |
| 16 | Owner review: 3D figure look | area:figures, gate:user-review | M1 3D figure spike | #16 |

- [ ] **Step 1: Push `main`**

```bash
git push -u origin main
```
Expected: `branch 'main' set up to track 'origin/main'`.

- [ ] **Step 2: Create labels**

```bash
R=tomqwu/ai_health
gh label create "area:platform"    --repo $R --color 1d76db --description "Site shell, tooling, CI" --force
gh label create "area:fitness"     --repo $R --color 0e8a16 --description "Fitness content and planner" --force
gh label create "area:figures"     --repo $R --color 5319e7 --description "3D exercise figures" --force
gh label create "type:feature"     --repo $R --color a2eeef --description "New capability" --force
gh label create "type:content"     --repo $R --color fbca04 --description "Written or data content" --force
gh label create "type:docs"        --repo $R --color 0075ca --description "Documentation" --force
gh label create "type:bug"         --repo $R --color d73a4a --description "Something is broken" --force
gh label create "gate:user-review" --repo $R --color b60205 --description "Waits for the owner's sign-off" --force
```

- [ ] **Step 3: Create milestones**

```bash
R=tomqwu/ai_health
for m in "M0 Foundation|Astro scaffold, i18n, layout, CI/CD, Pages deploy, docs" \
         "M1 3D figure spike|Smith squat end to end with a 3D human; owner sign-off" \
         "M2 Content model & engine|Schemas, feasibility, week builder, profile" \
         "M3 Figure system|Pose library, viewer, pre-render pipeline for all exercises" \
         "M4 Planner & PDF|Wizard, week view, swaps, print/PDF" \
         "M5 Smith module & program|Equipment guides, v1 exercises, eight guide sections"; do
  gh api repos/$R/milestones -f title="${m%%|*}" -f description="${m#*|}" --jq '.number, .title'
done
```

- [ ] **Step 4: Create one issue per task (table above)**

For each row run (fill the body with the task's goal and its "Done when" line from this plan):
```bash
gh issue create --repo tomqwu/ai_health --title "<Issue title>" --label "<labels comma-separated>" --milestone "<Milestone>" \
  --body $'Plan: docs/superpowers/plans/2026-09-29-m0-m1-foundation-and-3d-spike.md — Task <N>\n\nDone when: <acceptance line>'
```
Write the printed issue number into the table's last column.

- [ ] **Step 5: Create epics for M2–M5 and the roadmap issue**

```bash
R=tomqwu/ai_health
gh issue create --repo $R --title "M2 epic: content model & engine" --label "area:fitness,type:feature" --milestone "M2 Content model & engine" --body "Spec §5–§7. Detailed plan is written after the M1 gate."
gh issue create --repo $R --title "M3 epic: figure system" --label "area:figures,type:feature" --milestone "M3 Figure system" --body "Spec §8. Detailed plan is written after the M1 gate."
gh issue create --repo $R --title "M4 epic: planner & PDF" --label "area:fitness,type:feature" --milestone "M4 Planner & PDF" --body "Spec §9. Detailed plan is written after M2."
gh issue create --repo $R --title "M5 epic: Smith module & program content" --label "area:fitness,type:content" --milestone "M5 Smith module & program" --body "Spec §5, §12, §17. Needs the owner's measurements and safety screening (in chat only)."
gh issue create --repo $R --title "Roadmap: future areas (nutrition, daily tracking)" --label "area:platform" --body "Each future area gets its own spec. No code until then."
```

- [ ] **Step 6: Commit the recorded issue numbers**

```bash
git checkout -b chore/plan-issue-numbers
git add docs/superpowers/plans/2026-09-29-m0-m1-foundation-and-3d-spike.md
git commit -m $'docs: record issue numbers in the M0/M1 plan\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin chore/plan-issue-numbers
gh pr create --repo tomqwu/ai_health --title "docs: record issue numbers in the M0/M1 plan" --body $'Tracking setup for the M0/M1 plan.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
gh pr merge --squash --delete-branch
git checkout main && git pull
```

**Branch naming for every later task:** `m0/<issue#>-<slug>` or `m1/<issue#>-<slug>`. Every task ends with a commit/PR/merge step; replace `<issue from the Task 0 table>` with that task's issue number. Wait for CI through the app's PR tools, not by polling `gh`.

---

### Task 1: Scaffold Astro + TypeScript tooling and CI

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `README.md`, `public/favicon.svg`, `src/lib/site.ts`, `src/lib/site.test.ts`, `src/pages/index.astro` (temporary, replaced in Task 3), `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `withBase(path: string, base?: string): string` in `src/lib/site.ts`; npm scripts `dev`, `build`, `preview`, `check`, `lint`, `test`.

- [ ] **Step 1: Create the branch and project files**

```bash
git checkout -b m0/<issue>-scaffold
echo 24 > .nvmrc
```

`.gitignore`:
```gitignore
node_modules/
dist/
.astro/
.cache/
playwright-report/
test-results/
public/figures/
assets-src/human/build/
*.blend
*.blend1
.DS_Store
```

`package.json`:
```json
{
  "name": "ai-health",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install pinned dependencies**

```bash
npm install --save-exact astro@7.3.5 @astrojs/preact@6.0.5 preact@10.29.8
npm install --save-exact --save-dev typescript@6.0.3 @astrojs/check@0.9.10 vitest@5.0.2 @types/node@24.19.0 \
  eslint@10.11.0 @eslint/js@10.0.1 typescript-eslint@8.71.0 eslint-plugin-astro@3.2.1 globals@17.12.0
```
Expected: no `ERESOLVE` errors.

- [ ] **Step 3: Write the config files**

`astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://tomqwu.github.io',
  base: '/ai_health',
  trailingSlash: 'always',
  // The dev toolbar injects DOM into every page, which breaks figure screenshots.
  devToolbar: { enabled: false },
  integrations: [preact()],
});
```

`tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "node_modules"],
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "noUncheckedIndexedAccess": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/assets/**/*.test.ts'],
    environment: 'node',
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.astro/', 'node_modules/', 'public/', 'playwright-report/', 'test-results/', 'assets-src/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
```

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f6f5e"/><path d="M6 17h5l2-5 4 10 3-7 2 2h4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

- [ ] **Step 4: Write the failing test for `withBase`**

`src/lib/site.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { withBase } from './site';

describe('withBase', () => {
  it('joins the base and a relative path with one slash', () => {
    expect(withBase('en/', '/ai_health/')).toBe('/ai_health/en/');
    expect(withBase('/models/human.glb', '/ai_health')).toBe('/ai_health/models/human.glb');
  });
  it('returns the base for an empty path', () => {
    expect(withBase('', '/ai_health/')).toBe('/ai_health/');
    expect(withBase('', '/')).toBe('/');
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/lib/site.test.ts`
Expected: FAIL — `Failed to resolve import "./site"`.

- [ ] **Step 6: Implement `withBase`**

`src/lib/site.ts`:
```ts
/** Join the site base (e.g. "/ai_health/") with a relative path, with exactly one slash between them. */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}${path.replace(/^\/+/, '')}`;
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npx vitest run src/lib/site.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Add a temporary home page, README and CI**

`src/pages/index.astro` (replaced in Task 3):
```astro
---
---
<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Healthy Living</title></head><body><h1>Healthy Living</h1></body></html>
```

`README.md`:
````markdown
# Healthy Living (ai_health)

A bilingual (English / 简体中文) static site with practical, evidence-based guides for healthy living, starting with fitness.
Live site: https://tomqwu.github.io/ai_health/

- Design: [docs/superpowers/specs/2026-09-29-fitness-platform-design.md](docs/superpowers/specs/2026-09-29-fitness-platform-design.md)
- Plans: [docs/superpowers/plans/](docs/superpowers/plans/)

## Develop

```bash
npm ci
npm run dev        # http://localhost:4321/ai_health/
npm test           # unit tests
npm run check      # type check
npm run lint
```

## Privacy

This repository is public and holds generic content only. Personal profiles, measurements and plans stay in each visitor's browser.
````

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 9: Verify everything locally**

Run: `npm run check && npm run lint && npm test && npm run build`
Expected: `0 errors`, lint silent, `2 passed`, `Complete!` with `dist/index.html`.

- [ ] **Step 10: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat: scaffold Astro site with TypeScript, Vitest, ESLint and CI\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Scaffold Astro + TypeScript tooling and CI" \
  --body $'Astro 7 + Preact + TypeScript 6 scaffold with Vitest, ESLint and a CI workflow.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** CI is green on `main`.

---

### Task 2: i18n core — locales, dictionaries, localized paths

**Files:**
- Create: `src/lib/i18n/locales.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts`, `src/lib/i18n/index.ts`, `src/lib/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `withBase` (Task 1).
- Produces:
  - `LOCALES: readonly ['en','zh']`, `type Locale`, `DEFAULT_LOCALE`, `type I18nText = Readonly<Record<Locale,string>>`, `isLocale(v): v is Locale`, `HTML_LANG: Record<Locale,string>`, `LOCALE_LABEL: Record<Locale,string>`, `pickLocale(preferred: readonly string[]): Locale` — in `locales.ts`
  - `type MessageKey`, `type Dictionary` — in `en.ts`
  - `t(locale, key): string`, `localizedPath(locale, path?, base?): string`, `switchLocale(pathname, target, base?): string`, `localeStaticPaths()` — in `index.ts` (which also re-exports `locales.ts` and `MessageKey`)

- [ ] **Step 1: Write the failing tests**

`src/lib/i18n/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';
import { localeStaticPaths, localizedPath, pickLocale, switchLocale, t } from './index';

const CJK = /[㐀-鿿]/;

describe('dictionaries', () => {
  it('have identical keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
  it('have no empty strings', () => {
    for (const d of [en, zh]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('');
  });
  it('have Chinese text in every zh entry', () => {
    for (const [k, v] of Object.entries(zh)) expect(CJK.test(v), `zh.${k} = "${v}"`).toBe(true);
  });
  it('t() looks up by locale', () => {
    expect(t('en', 'nav.home')).toBe('Home');
    expect(t('zh', 'nav.home')).toBe('首页');
  });
});

describe('pickLocale', () => {
  it('matches the first supported language', () => {
    expect(pickLocale(['zh-CN', 'en'])).toBe('zh');
    expect(pickLocale(['EN-us'])).toBe('en');
  });
  it('falls back to English', () => {
    expect(pickLocale(['fr-FR'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });
});

describe('paths', () => {
  it('localizedPath builds prefixed paths with a trailing slash', () => {
    expect(localizedPath('en', '', '/ai_health/')).toBe('/ai_health/en/');
    expect(localizedPath('zh', 'fitness', '/ai_health/')).toBe('/ai_health/zh/fitness/');
    expect(localizedPath('zh', '/fitness/equipment/', '/ai_health/')).toBe('/ai_health/zh/fitness/equipment/');
  });
  it('switchLocale swaps the locale segment', () => {
    expect(switchLocale('/ai_health/en/fitness/', 'zh', '/ai_health/')).toBe('/ai_health/zh/fitness/');
    expect(switchLocale('/ai_health/zh/', 'en', '/ai_health/')).toBe('/ai_health/en/');
  });
  it('switchLocale falls back to the target home page', () => {
    expect(switchLocale('/ai_health/', 'zh', '/ai_health/')).toBe('/ai_health/zh/');
  });
  it('localeStaticPaths lists every locale', () => {
    expect(localeStaticPaths()).toEqual([{ params: { lang: 'en' } }, { params: { lang: 'zh' } }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/i18n`
Expected: FAIL — cannot resolve `./en`.

- [ ] **Step 3: Implement `locales.ts`**

```ts
export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Text in every supported language. */
export type I18nText = Readonly<Record<Locale, string>>;

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** BCP 47 tag for <html lang> and hreflang. */
export const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-Hans' };

/** Each language's name written in that language (for the toggle). */
export const LOCALE_LABEL: Record<Locale, string> = { en: 'English', zh: '中文' };

/** First supported locale in a browser preference list, else the default. */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Implement `en.ts`**

```ts
export const en = {
  'site.name': 'Healthy Living',
  'site.tagline': 'Practical, evidence-based guides for training, with nutrition and recovery to follow.',
  'nav.main': 'Main',
  'nav.home': 'Home',
  'nav.safety': 'Safety',
  'nav.language': 'Language',
  'nav.skip': 'Skip to content',
  'home.title': 'Build healthy habits that fit your life',
  'home.intro': 'Start with fitness: equipment guides, illustrated exercises and a weekly plan that fits your space and time.',
  'area.fitness.title': 'Fitness',
  'area.fitness.summary': 'Equipment guides, an exercise library and weekly plans.',
  'fitness.title': 'Fitness',
  'fitness.intro': 'This section is being built. Equipment guides, the exercise library and the weekly planner will appear here as they are finished.',
  'footer.disclaimer': 'Educational content, not medical advice.',
  'footer.safetyLink': 'Read the safety notes',
  'safety.title': 'Safety first',
  'safety.intro': 'This site offers general training information. It does not replace advice from a doctor or physiotherapist who knows your health history.',
  'safety.stopTitle': 'Stop and get checked if you notice',
  'safety.flag.chest': 'Chest pain, pressure or tightness',
  'safety.flag.nerve': 'New or returning numbness, tingling or weakness',
  'safety.flag.joint': 'Joint swelling, locking or giving way',
  'safety.flag.dizzy': 'Dizziness, fainting or unusual shortness of breath',
  'safety.habitsTitle': 'Everyday habits',
  'safety.habit.warmup': 'Warm up before working sets and use light sets to rehearse each movement.',
  'safety.habit.stops': 'Set safety catches and stops before loading a bar, and never bypass them.',
  'safety.habit.space': 'Check the space around and above you, including the ceiling, before each exercise.',
  'safety.habit.effort': 'End most sets with a few reps still in reserve.',
  'notFound.title': 'Page not found',
  'notFound.back': 'Back to the home page',
} as const;

export type MessageKey = keyof typeof en;
export type Dictionary = Record<MessageKey, string>;
```

- [ ] **Step 5: Implement `zh.ts`**

```ts
import type { Dictionary } from './en';

export const zh: Dictionary = {
  'site.name': '健康生活',
  'site.tagline': '实用、循证的训练指南，营养与恢复内容即将推出。',
  'nav.main': '主导航',
  'nav.home': '首页',
  'nav.safety': '安全须知',
  'nav.language': '语言',
  'nav.skip': '跳到正文',
  'home.title': '养成适合自己的健康习惯',
  'home.intro': '从健身开始：器械指南、图解动作，以及适合你的空间和时间的每周计划。',
  'area.fitness.title': '健身',
  'area.fitness.summary': '器械指南、动作库和每周计划。',
  'fitness.title': '健身',
  'fitness.intro': '本栏目正在建设中。器械指南、动作库和每周计划完成后会陆续上线。',
  'footer.disclaimer': '本站内容仅供学习参考，不构成医疗建议。',
  'footer.safetyLink': '阅读安全须知',
  'safety.title': '安全第一',
  'safety.intro': '本站提供一般性的训练信息，不能替代了解你健康状况的医生或康复治疗师的建议。',
  'safety.stopTitle': '出现以下情况请停止训练并就医检查',
  'safety.flag.chest': '胸痛、胸闷或压迫感',
  'safety.flag.nerve': '新出现或反复出现的麻木、刺痛或无力',
  'safety.flag.joint': '关节肿胀、卡住或打软',
  'safety.flag.dizzy': '头晕、晕厥或异常的气短',
  'safety.habitsTitle': '日常习惯',
  'safety.habit.warmup': '正式组之前先热身，并用轻重量组熟悉每个动作。',
  'safety.habit.stops': '上杠铃片之前先设置好保护杆和限位，切勿绕过。',
  'safety.habit.space': '每个动作前检查周围和头顶的空间，包括天花板高度。',
  'safety.habit.effort': '大多数组在还能再做几次时就结束。',
  'notFound.title': '页面未找到',
  'notFound.back': '返回首页',
};
```

- [ ] **Step 6: Implement `index.ts`**

```ts
import { withBase } from '../site';
import { en, type MessageKey } from './en';
import { zh } from './zh';
import { LOCALES, type Locale } from './locales';

export * from './locales';
export type { MessageKey } from './en';

const DICTIONARIES = { en, zh } as const;

export function t(locale: Locale, key: MessageKey): string {
  return DICTIONARIES[locale][key];
}

/** Localized page path including the site base, always ending in "/". */
export function localizedPath(locale: Locale, path = '', base: string = import.meta.env.BASE_URL): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return withBase(clean ? `${locale}/${clean}/` : `${locale}/`, base);
}

/** The same page in another locale, or that locale's home page if the path has no locale segment. */
export function switchLocale(pathname: string, target: Locale, base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  const rest = pathname.startsWith(b) ? pathname.slice(b.length) : '';
  const [first, ...tail] = rest.split('/');
  if (first && (LOCALES as readonly string[]).includes(first)) return localizedPath(target, tail.join('/'), base);
  return localizedPath(target, '', base);
}

export function localeStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/i18n && npm run check`
Expected: PASS (all i18n tests), `0 errors`.

- [ ] **Step 8: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat: add i18n core with typed EN/中文 dictionaries\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "i18n core: locales, dictionaries, localized paths" \
  --body $'i18n tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** i18n tests pass in CI.

---

### Task 3: Site shell — area registry, layout, home and fitness pages

**Files:**
- Create: `src/lib/areas.ts`, `src/lib/areas.test.ts`, `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`, `src/components/LanguageToggle.astro`, `src/components/AreaCard.astro`, `src/pages/[lang]/index.astro`, `src/pages/[lang]/fitness/index.astro`
- Modify (replace): `src/pages/index.astro`

**Interfaces:**
- Consumes: i18n (`t`, `localizedPath`, `switchLocale`, `localeStaticPaths`, `isLocale`, `HTML_LANG`, `LOCALE_LABEL`, `LOCALES`, `pickLocale`, `MessageKey`), `withBase`.
- Produces: `interface Area { id: string; path: string; titleKey: MessageKey; summaryKey: MessageKey }`, `AREAS: readonly Area[]`; `BaseLayout` props `{ lang: Locale; title?: string; description?: string; noindex?: boolean }`.

- [ ] **Step 1: Write the failing area test**

`src/lib/areas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AREAS } from './areas';
import { t } from './i18n';

describe('AREAS', () => {
  it('has unique ids and kebab-case paths', () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
    for (const a of AREAS) expect(a.path).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('has titles and summaries in every language', () => {
    for (const a of AREAS) for (const lang of ['en', 'zh'] as const) {
      expect(t(lang, a.titleKey)).not.toBe('');
      expect(t(lang, a.summaryKey)).not.toBe('');
    }
  });
  it('starts with fitness only', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['fitness']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/areas.test.ts` — Expected: FAIL (cannot resolve `./areas`).

- [ ] **Step 3: Implement `src/lib/areas.ts`**

```ts
import type { MessageKey } from './i18n';

/** A top-level area of the site. New areas (nutrition, tracking…) are added here and nowhere else. */
export interface Area {
  id: string;
  /** URL segment under /<lang>/ */
  path: string;
  titleKey: MessageKey;
  summaryKey: MessageKey;
}

export const AREAS: readonly Area[] = [
  { id: 'fitness', path: 'fitness', titleKey: 'area.fitness.title', summaryKey: 'area.fitness.summary' },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/areas.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Write the design system**

`src/styles/global.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #fbfaf7;
  --surface: #ffffff;
  --text: #1f2328;
  --muted: #5b616b;
  --border: #e3e0d8;
  --accent: #2f6f5e;
  --accent-contrast: #ffffff;
  --focus: #1f6feb;
  --radius: 12px;
  --maxw: 1080px;
  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
    'Noto Sans CJK SC', 'Noto Sans SC', sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171a;
    --surface: #1d2024;
    --text: #eceae4;
    --muted: #a3a8b0;
    --border: #2e3237;
    --accent: #7cc6ad;
    --accent-contrast: #0e1512;
    --focus: #79b8ff;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans); line-height: 1.6; }
img, svg, canvas, video { max-width: 100%; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
h1, h2, h3 { line-height: 1.25; }
.container { width: 100%; max-width: var(--maxw); margin: 0 auto; padding: 0 16px; }
main.container { padding-top: 24px; padding-bottom: 48px; min-height: 60vh; }
.lead { font-size: 1.125rem; color: var(--muted); max-width: 60ch; }

.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 16px; top: 8px; z-index: 10; background: var(--surface); padding: 8px 12px; border-radius: 8px; }

.site-header { border-bottom: 1px solid var(--border); background: var(--surface); }
.site-header__inner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding-top: 12px; padding-bottom: 12px; }
.site-header__brand { font-weight: 700; color: var(--text); text-decoration: none; margin-right: auto; }
.site-nav { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; margin: 0; padding: 0; }
.site-nav a { text-decoration: none; color: var(--muted); padding: 4px 0; }
.site-nav a[aria-current='page'] { color: var(--text); font-weight: 600; border-bottom: 2px solid var(--accent); }
.lang-toggle a { display: inline-block; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; text-decoration: none; }

.site-footer { border-top: 1px solid var(--border); color: var(--muted); font-size: 0.9rem; padding: 16px 0 32px; }

.hero { padding: 24px 0 8px; }
.area-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-top: 24px; }
.area-card { display: block; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); text-decoration: none; }
.area-card:hover { border-color: var(--accent); }
.area-card__title { margin: 0 0 4px; font-size: 1.25rem; }
.area-card__summary { margin: 0; color: var(--muted); }

.prose { max-width: 70ch; }
.flag-list li { margin-bottom: 6px; }
```

- [ ] **Step 6: Write the layout and components**

`src/layouts/BaseLayout.astro`:
```astro
---
import '../styles/global.css';
import SiteHeader from '../components/SiteHeader.astro';
import SiteFooter from '../components/SiteFooter.astro';
import { HTML_LANG, t, type Locale } from '../lib/i18n';
import { withBase } from '../lib/site';

interface Props {
  lang: Locale;
  title?: string;
  description?: string;
  noindex?: boolean;
}
const { lang, title, description, noindex = false } = Astro.props;
const siteName = t(lang, 'site.name');
const fullTitle = title ? `${title} · ${siteName}` : siteName;
---
<!doctype html>
<html lang={HTML_LANG[lang]}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description ?? t(lang, 'site.tagline')} />
    {noindex && <meta name="robots" content="noindex" />}
    <link rel="icon" type="image/svg+xml" href={withBase('favicon.svg')} />
  </head>
  <body>
    <a class="skip-link" href="#main">{t(lang, 'nav.skip')}</a>
    <SiteHeader lang={lang} />
    <main id="main" class="container"><slot /></main>
    <SiteFooter lang={lang} />
  </body>
</html>
```

`src/components/SiteHeader.astro`:
```astro
---
import LanguageToggle from './LanguageToggle.astro';
import { AREAS } from '../lib/areas';
import { localizedPath, t, type Locale } from '../lib/i18n';

interface Props { lang: Locale }
const { lang } = Astro.props;
const here = Astro.url.pathname;
const links = [
  { href: localizedPath(lang), label: t(lang, 'nav.home'), exact: true },
  ...AREAS.map((a) => ({ href: localizedPath(lang, a.path), label: t(lang, a.titleKey), exact: false })),
  { href: localizedPath(lang, 'safety'), label: t(lang, 'nav.safety'), exact: true },
];
const current = (href: string, exact: boolean) => (exact ? here === href : here.startsWith(href));
---
<header class="site-header">
  <div class="container site-header__inner">
    <a class="site-header__brand" href={localizedPath(lang)}>{t(lang, 'site.name')}</a>
    <nav aria-label={t(lang, 'nav.main')}>
      <ul class="site-nav">
        {links.map((l) => <li><a href={l.href} aria-current={current(l.href, l.exact) ? 'page' : undefined}>{l.label}</a></li>)}
      </ul>
    </nav>
    <LanguageToggle lang={lang} />
  </div>
</header>
```

`src/components/LanguageToggle.astro`:
```astro
---
import { HTML_LANG, LOCALE_LABEL, LOCALES, switchLocale, t, type Locale } from '../lib/i18n';

interface Props { lang: Locale }
const { lang } = Astro.props;
const others = LOCALES.filter((l) => l !== lang);
---
<div class="lang-toggle" role="group" aria-label={t(lang, 'nav.language')}>
  {others.map((l) => <a href={switchLocale(Astro.url.pathname, l)} hreflang={HTML_LANG[l]} lang={HTML_LANG[l]}>{LOCALE_LABEL[l]}</a>)}
</div>
```

`src/components/SiteFooter.astro`:
```astro
---
import { localizedPath, t, type Locale } from '../lib/i18n';

interface Props { lang: Locale }
const { lang } = Astro.props;
---
<footer class="site-footer">
  <div class="container">
    <p>{t(lang, 'footer.disclaimer')} <a href={localizedPath(lang, 'safety')}>{t(lang, 'footer.safetyLink')}</a></p>
  </div>
</footer>
```

`src/components/AreaCard.astro`:
```astro
---
interface Props { href: string; title: string; summary: string }
const { href, title, summary } = Astro.props;
---
<a class="area-card" href={href}>
  <h2 class="area-card__title">{title}</h2>
  <p class="area-card__summary">{summary}</p>
</a>
```

- [ ] **Step 7: Write the pages**

`src/pages/index.astro` (replace the temporary page — picks a language, with plain links as fallback):
```astro
---
import { HTML_LANG, LOCALE_LABEL, LOCALES, localizedPath } from '../lib/i18n';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Healthy Living · 健康生活</title>
    <script>
      import { localizedPath, pickLocale } from '../lib/i18n';
      location.replace(localizedPath(pickLocale(navigator.languages ?? [navigator.language])));
    </script>
  </head>
  <body>
    <main>
      <h1>Healthy Living · 健康生活</h1>
      <ul>
        {LOCALES.map((l) => <li><a href={localizedPath(l)} lang={HTML_LANG[l]} hreflang={HTML_LANG[l]}>{LOCALE_LABEL[l]}</a></li>)}
      </ul>
    </main>
  </body>
</html>
```

`src/pages/[lang]/index.astro`:
```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import AreaCard from '../../components/AreaCard.astro';
import { AREAS } from '../../lib/areas';
import { isLocale, localeStaticPaths, localizedPath, t } from '../../lib/i18n';

export function getStaticPaths() {
  return localeStaticPaths();
}
const { lang } = Astro.params;
if (!isLocale(lang)) throw new Error(`Unknown locale: ${lang}`);
---
<BaseLayout lang={lang}>
  <section class="hero">
    <h1>{t(lang, 'home.title')}</h1>
    <p class="lead">{t(lang, 'home.intro')}</p>
  </section>
  <div class="area-grid">
    {AREAS.map((a) => <AreaCard href={localizedPath(lang, a.path)} title={t(lang, a.titleKey)} summary={t(lang, a.summaryKey)} />)}
  </div>
</BaseLayout>
```

`src/pages/[lang]/fitness/index.astro`:
```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { isLocale, localeStaticPaths, t } from '../../../lib/i18n';

export function getStaticPaths() {
  return localeStaticPaths();
}
const { lang } = Astro.params;
if (!isLocale(lang)) throw new Error(`Unknown locale: ${lang}`);
---
<BaseLayout lang={lang} title={t(lang, 'fitness.title')}>
  <h1>{t(lang, 'fitness.title')}</h1>
  <p class="lead">{t(lang, 'fitness.intro')}</p>
</BaseLayout>
```

- [ ] **Step 8: Verify build output**

Run: `npm run check && npm run lint && npm test && npm run build && ls dist dist/en dist/zh dist/en/fitness`
Expected: `0 errors`; `dist/index.html`, `dist/en/index.html`, `dist/zh/index.html`, `dist/en/fitness/index.html`.
Then run `npm run preview` and open `http://localhost:4321/ai_health/en/` — header shows Home / Fitness / Safety and a 中文 link that lands on `/ai_health/zh/`.

- [ ] **Step 9: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat: add site shell with area registry, layout and bilingual pages\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Site shell: area registry, layout, home and fitness pages" \
  --body $'/en/, /zh/, /en/fitness/, /zh/fitness/ build, and the language toggle maps each page to its counterpart.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** `/en/`, `/zh/`, `/en/fitness/`, `/zh/fitness/` build, and the language toggle maps each page to its counterpart.

---

### Task 4: Safety page and 404

**Files:**
- Create: `src/pages/[lang]/safety.astro`, `src/pages/404.astro`

**Interfaces:**
- Consumes: `BaseLayout`, i18n keys `safety.*`, `notFound.*` (added in Task 2).

- [ ] **Step 1: Write the safety page**

`src/pages/[lang]/safety.astro`:
```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { isLocale, localeStaticPaths, t, type MessageKey } from '../../lib/i18n';

export function getStaticPaths() {
  return localeStaticPaths();
}
const { lang } = Astro.params;
if (!isLocale(lang)) throw new Error(`Unknown locale: ${lang}`);
const flags: MessageKey[] = ['safety.flag.chest', 'safety.flag.nerve', 'safety.flag.joint', 'safety.flag.dizzy'];
const habits: MessageKey[] = ['safety.habit.warmup', 'safety.habit.stops', 'safety.habit.space', 'safety.habit.effort'];
---
<BaseLayout lang={lang} title={t(lang, 'safety.title')}>
  <article class="prose">
    <h1>{t(lang, 'safety.title')}</h1>
    <p class="lead">{t(lang, 'safety.intro')}</p>
    <h2>{t(lang, 'safety.stopTitle')}</h2>
    <ul class="flag-list">{flags.map((k) => <li>{t(lang, k)}</li>)}</ul>
    <h2>{t(lang, 'safety.habitsTitle')}</h2>
    <ul>{habits.map((k) => <li>{t(lang, k)}</li>)}</ul>
  </article>
</BaseLayout>
```

- [ ] **Step 2: Write the bilingual 404 page**

`src/pages/404.astro`:
```astro
---
import '../styles/global.css';
import { HTML_LANG, LOCALES, localizedPath, t } from '../lib/i18n';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>{t('en', 'notFound.title')} · {t('zh', 'notFound.title')}</title>
  </head>
  <body>
    <main class="container">
      <h1>{t('en', 'notFound.title')} · <span lang="zh-Hans">{t('zh', 'notFound.title')}</span></h1>
      <ul>
        {LOCALES.map((l) => <li><a href={localizedPath(l)} lang={HTML_LANG[l]}>{t(l, 'notFound.back')}</a></li>)}
      </ul>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm run build && ls dist/404.html dist/en/safety/index.html dist/zh/safety/index.html`
Expected: all three files exist.

- [ ] **Step 4: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat: add bilingual safety page and 404\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Safety page and 404" \
  --body $'safety pages exist in both languages and dist/404.html is generated.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** safety pages exist in both languages and `dist/404.html` is generated.

---

### Task 5: End-to-end smoke tests

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (script `test:e2e`), `.github/workflows/ci.yml` (e2e steps)

**Interfaces:**
- Produces: Playwright project `chromium` with SwiftShader WebGL flags (used again in Task 14).

- [ ] **Step 1: Install Playwright and add the script**

```bash
npm install --save-exact --save-dev @playwright/test@1.63.0
npx playwright install chromium
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  webServer: {
    // --ignore-lock keeps Astro 7 in the foreground even when it detects an AI agent.
    command: `npm run build && npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/ai_health/en/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL so 3D pages render on CI machines without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
});
```

- [ ] **Step 3: Write the smoke tests**

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['', 'fitness/', 'safety/'];
const LOCALES = [
  { code: 'en', htmlLang: 'en' },
  { code: 'zh', htmlLang: 'zh-Hans' },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

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
```

- [ ] **Step 4: Run the suite**

Run: `npm run test:e2e`
Expected: all tests pass (6 page tests + toggle + root + 404 + 3 phone-width). If the 404 test reports status 200, check that `dist/404.html` exists (Task 4).

- [ ] **Step 5: Add e2e to CI**

Append to `.github/workflows/ci.yml` after `- run: npm run build`:
```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'test: add Playwright smoke tests for every page in both languages\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "End-to-end smoke tests" \
  --body $'CI runs and passes the e2e suite.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** CI runs and passes the e2e suite.

---

### Task 6: Pages deploy, issue templates, architecture docs

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/content.yml`, `.github/ISSUE_TEMPLATE/bug.yml`, `docs/architecture.md`

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Write the issue templates**

`.github/ISSUE_TEMPLATE/config.yml`:
```yaml
blank_issues_enabled: false
```

`.github/ISSUE_TEMPLATE/feature.yml`:
```yaml
name: Feature
description: A new capability for the site
labels: ["type:feature"]
body:
  - type: textarea
    id: goal
    attributes: { label: Goal, description: What should be possible afterwards? }
    validations: { required: true }
  - type: textarea
    id: done
    attributes: { label: Done when, description: How we will know it works. }
    validations: { required: true }
```

`.github/ISSUE_TEMPLATE/content.yml`:
```yaml
name: Content (equipment or exercise)
description: Add or change a piece of equipment, an exercise or a guide
labels: ["type:content"]
body:
  - type: markdown
    attributes:
      value: |
        **Privacy:** this repository is public. Do **not** attach personal photos, measurements or health details here.
        Share photos in a private session; only generic descriptions belong in this issue.
  - type: input
    id: item
    attributes: { label: Equipment or exercise (generic name, no brands) }
    validations: { required: true }
  - type: checkboxes
    id: measurements
    attributes:
      label: Geometry the figures need (see the spec §5.1)
      options:
        - label: Hole numbering (floor to the lowest and highest numbered hole)
        - label: Lowest and highest bar positions
        - label: Inner depth and width between the uprights
        - label: Pull-up bar height and ceiling height above it
        - label: Bench seat height, backrest length and available angles
  - type: textarea
    id: notes
    attributes: { label: Notes }
```

`.github/ISSUE_TEMPLATE/bug.yml`:
```yaml
name: Bug
description: Something is broken
labels: ["type:bug"]
body:
  - type: input
    id: url
    attributes: { label: Page URL }
    validations: { required: true }
  - type: textarea
    id: what
    attributes: { label: What happened, and what did you expect? }
    validations: { required: true }
```

- [ ] **Step 3: Write `docs/architecture.md`**

```markdown
# Architecture

See the design spec for the full picture: `docs/superpowers/specs/2026-09-29-fitness-platform-design.md`.

## Layers

| Layer | Where | Rules |
|---|---|---|
| Pages and components | `src/pages`, `src/components`, `src/layouts` | Astro; Preact islands only for interactive parts |
| Pure libraries | `src/lib/**` except `scene3d` | No DOM, no Astro, no three.js; unit-tested with Vitest |
| 3D rendering | `src/lib/figure/scene3d` | The only code that imports `three` |
| Build scripts | `scripts/` | Run with `tsx`; their pure parts live in `scripts/lib` with tests |

## Conventions

- Routes are `/<lang>/…` for `en` and `zh`; build links with `localizedPath()` and assets with `withBase()`.
- UI strings live in `src/lib/i18n/{en,zh}.ts`; `zh` must define every key (type-checked).
- Areas (fitness today; nutrition and tracking later) are registered in `src/lib/areas.ts`; the header and home page read from it.
- Personal data never enters the repository; it stays in the visitor's browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at `http://localhost:4321/ai_health/` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Build, preview and run Playwright |
| `npm run check` / `npm run lint` | Type check / lint |

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds `dist/` and publishes it to GitHub Pages.
```

- [ ] **Step 4: Enable GitHub Pages (source: GitHub Actions)**

```bash
gh api -X POST repos/tomqwu/ai_health/pages -f build_type=workflow \
  || gh api -X PUT repos/tomqwu/ai_health/pages -f build_type=workflow
gh api repos/tomqwu/ai_health/pages --jq '.build_type, .html_url'
```
Expected: `workflow` and `https://tomqwu.github.io/ai_health/`.

- [ ] **Step 5: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'ci: deploy to GitHub Pages; add issue templates and architecture docs\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Pages deploy, issue templates, architecture docs" \
  --body $'the bilingual site is live on Pages and CI is green. Close the M0 milestone:\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

- [ ] **Step 6: Verify the live site**

```bash
gh run list --repo tomqwu/ai_health --workflow Deploy --limit 1
curl -s -o /dev/null -w "%{http_code}\n" https://tomqwu.github.io/ai_health/en/
curl -s -o /dev/null -w "%{http_code}\n" https://tomqwu.github.io/ai_health/zh/fitness/
```
Expected: latest Deploy run `completed success`; both URLs `200`.

**Done when (M0 exit):** the bilingual site is live on Pages and CI is green. Close the M0 milestone:
```bash
M=$(gh api repos/tomqwu/ai_health/milestones --jq '.[] | select(.title=="M0 Foundation") | .number')
gh api -X PATCH repos/tomqwu/ai_health/milestones/$M -f state=closed
```

---

### Task 7: Figure math core (vec3, quat)

**Files:**
- Create: `src/lib/figure/math/vec3.ts`, `src/lib/figure/math/quat.ts`, `src/lib/figure/math/math.test.ts`

**Interfaces:**
- Produces (`vec3.ts`): `type Vec3 = readonly [number, number, number]`; `ZERO, X_AXIS, Y_AXIS, Z_AXIS`; `add, sub, scale, dot, cross, length, distance, lerp, midpoint, normalize, angleBetweenDeg`.
- Produces (`quat.ts`): `type Quat = readonly [x, y, z, w]`; `IDENTITY`; `degToRad, radToDeg, fromAxisAngle, multiply, conjugate, normalizeQuat, rotate, fromUnitVectors, slerp, angleBetweenQuatsDeg`. Semantics match three.js (`multiply(a,b)` applies `b` first).

- [ ] **Step 1: Write the failing tests**

`src/lib/figure/math/math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { add, angleBetweenDeg, cross, distance, normalize, sub, X_AXIS, Y_AXIS, Z_AXIS } from './vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, rotate, slerp } from './quat';

const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('vec3', () => {
  it('adds, subtracts and measures', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
  });
  it('cross follows the right-hand rule', () => {
    expect(cross(X_AXIS, Y_AXIS)).toEqual(Z_AXIS);
  });
  it('normalize rejects zero vectors', () => {
    expect(() => normalize([0, 0, 0])).toThrow(/zero-length/);
  });
  it('angleBetweenDeg', () => {
    expect(angleBetweenDeg(X_AXIS, Y_AXIS)).toBeCloseTo(90);
    expect(angleBetweenDeg([1, 1, 0], X_AXIS)).toBeCloseTo(45);
  });
});

describe('quat', () => {
  it('rotates +Y toward +Z for a positive rotation about +X', () => {
    close(rotate(fromAxisAngle(X_AXIS, degToRad(90)), Y_AXIS), [0, 0, 1]);
  });
  it('rotates +Z toward +X for a positive rotation about +Y', () => {
    close(rotate(fromAxisAngle(Y_AXIS, degToRad(90)), Z_AXIS), [1, 0, 0]);
  });
  it('multiply applies the right operand first', () => {
    const qx = fromAxisAngle(X_AXIS, degToRad(90));
    const qy = fromAxisAngle(Y_AXIS, degToRad(90));
    close(rotate(multiply(qy, qx), Y_AXIS), [1, 0, 0]);
  });
  it('conjugate inverts', () => {
    const q = fromAxisAngle([1, 2, 3], 0.7);
    close(multiply(q, conjugate(q)), IDENTITY);
  });
  it('fromUnitVectors maps from onto to, including opposite vectors', () => {
    close(rotate(fromUnitVectors([1, 0, 0], [0, 0, 5]), X_AXIS), [0, 0, 1]);
    close(rotate(fromUnitVectors(Y_AXIS, [0, -1, 0]), Y_AXIS), [0, -1, 0]);
  });
  it('slerp halfway is half the angle', () => {
    const b = fromAxisAngle(Z_AXIS, degToRad(80));
    expect(angleBetweenQuatsDeg(IDENTITY, slerp(IDENTITY, b, 0.5))).toBeCloseTo(40);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/figure/math` — Expected: FAIL (cannot resolve `./vec3`).

- [ ] **Step 3: Implement `vec3.ts`**

```ts
/** 3D vector as an immutable tuple. The pose layer uses centimetres. */
export type Vec3 = readonly [number, number, number];

export const ZERO: Vec3 = [0, 0, 0];
export const X_AXIS: Vec3 = [1, 0, 0];
export const Y_AXIS: Vec3 = [0, 1, 0];
export const Z_AXIS: Vec3 = [0, 0, 1];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export const midpoint = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) throw new Error('normalize: zero-length vector');
  return scale(a, 1 / l);
}

/** Unsigned angle between two non-zero vectors, in degrees (0..180). */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const c = dot(normalize(a), normalize(b));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}
```

- [ ] **Step 4: Implement `quat.ts`**

```ts
import { type Vec3, cross, dot, normalize } from './vec3';

/** Unit quaternion [x, y, z, w] — same component order as three.js. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export function fromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angleRad / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angleRad / 2)];
}

/** a * b: the result rotates by b first, then by a. */
export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inverse of a unit quaternion. */
export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l === 0) throw new Error('normalizeQuat: zero quaternion');
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate vector v by unit quaternion q (same math as three.js Vector3.applyQuaternion). */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

/** Shortest rotation taking direction `from` onto direction `to` (three.js setFromUnitVectors). */
export function fromUnitVectors(from: Vec3, to: Vec3): Quat {
  const f = normalize(from);
  const t = normalize(to);
  const r = dot(f, t) + 1;
  if (r < 1e-9) {
    // Opposite directions: 180° about any axis orthogonal to `from`.
    return normalizeQuat(Math.abs(f[0]) > Math.abs(f[2]) ? [-f[1], f[0], 0, 0] : [0, -f[2], f[1], 0]);
  }
  const c = cross(f, t);
  return normalizeQuat([c[0], c[1], c[2], r]);
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    cos = -cos;
  }
  if (cos > 0.9995) {
    return normalizeQuat([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** Angle of the rotation taking a to b, in degrees (0..180). */
export function angleBetweenQuatsDeg(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return radToDeg(2 * Math.acos(Math.min(1, d)));
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/figure/math` — Expected: PASS (10 tests).

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add vec3/quat math core\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure math core (vec3, quat)" \
  --body $'math tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** math tests pass in CI.

---

### Task 8: Pose core — skeleton, forward kinematics, pose builder, hands

**Files:**
- Create: `src/lib/figure/pose/skeleton.ts`, `src/lib/figure/pose/builder.ts`, `src/lib/figure/pose/hands.ts`, `src/lib/figure/pose/synthetic.ts`, `src/lib/figure/pose/core.test.ts`

**Interfaces:**
- Consumes: Task 7 math.
- Produces:
  - `skeleton.ts`: `interface BoneDef { name; parent: string|null; restLocalT: Vec3; restLocalR: Quat }`, `interface SkeletonDef { source: {file; sha256}; statureCm; bones: readonly BoneDef[]; headTopLocal: Vec3 }`, `interface BoneState { position: Vec3; rotation: Quat }`, `type LocalRotations`, `type WorldPose`, `interface PoseInput { local; rootPosition? }`, `boneMap(sk)`, `forwardKinematics(sk, input, scaleFactor): WorldPose`, `restPose(sk, scaleFactor): WorldPose`.
  - `builder.ts`: `class PoseBuilder(sk, scaleFactor)` with `local`, `rootPosition`, `def(name)`, `world()`, `setWorldRotation(bone, q)`, `rotateWorld(bone, axis, rad)`, `rotateLocal(bone, axisLocal, rad)`, `aim(bone, child, target)`, `twoBoneIK(upper, lower, end, target, pole): Vec3`.
  - `hands.ts`: `type Side = 'l'|'r'`, `palmNormal(w, side): Vec3`, `curlFingers(b, side, fingerDeg, thumbDeg)`.
  - `synthetic.ts`: `syntheticSkeleton(opts?: { randomRestSeed?: number }): SkeletonDef` — 175 cm, MPFB `game_engine` bone names and hierarchy.

- [ ] **Step 1: Write the failing tests**

`src/lib/figure/pose/core.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, dot, midpoint, normalize, scale, sub } from '../math/vec3';
import { PoseBuilder } from './builder';
import { curlFingers, palmNormal } from './hands';
import { forwardKinematics, restPose } from './skeleton';
import { syntheticSkeleton } from './synthetic';

describe('forward kinematics', () => {
  it('reproduces rest positions regardless of rest-rotation convention', () => {
    const a = restPose(syntheticSkeleton(), 1);
    const b = restPose(syntheticSkeleton({ randomRestSeed: 7 }), 1);
    for (const name of Object.keys(a)) expect(distance(a[name]!.position, b[name]!.position)).toBeLessThan(1e-9);
  });
  it('uses glTF axes: left = +X, facing +Z, up +Y', () => {
    const w = restPose(syntheticSkeleton(), 1);
    expect(w.hand_l!.position[0]).toBeGreaterThan(0);
    expect(w.ball_l!.position[2]).toBeGreaterThan(w.foot_l!.position[2]);
    expect(w.head!.position[1]).toBeGreaterThan(w.pelvis!.position[1]);
  });
  it('scales positions uniformly', () => {
    expect(forwardKinematics(syntheticSkeleton(), { local: {} }, 2).head!.position[1]).toBeCloseTo(314);
  });
});

describe('PoseBuilder', () => {
  it('two-bone IK reaches a reachable target and bends toward the pole', () => {
    const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 3 }), 1);
    const target: Vec3 = [9, 30, 25];
    b.twoBoneIK('thigh_l', 'calf_l', 'foot_l', target, [0, 0, 1]);
    const w = b.world();
    expect(distance(w.foot_l!.position, target)).toBeLessThan(1e-6);
    const axis = normalize(sub(target, w.thigh_l!.position));
    const knee = sub(w.calf_l!.position, w.thigh_l!.position);
    const offAxis = sub(knee, scale(axis, dot(knee, axis)));
    expect(dot(offAxis, [0, 0, 1])).toBeGreaterThan(0);
  });
  it('keeps bone lengths when aiming', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 2 });
    const b = new PoseBuilder(sk, 1);
    b.aim('upperarm_l', 'lowerarm_l', [60, 150, 40]);
    const w = b.world();
    const rest = restPose(sk, 1);
    expect(distance(w.upperarm_l!.position, w.lowerarm_l!.position)).toBeCloseTo(
      distance(rest.upperarm_l!.position, rest.lowerarm_l!.position),
      9,
    );
  });
  it('aim rejects a non-child', () => {
    const b = new PoseBuilder(syntheticSkeleton(), 1);
    expect(() => b.aim('upperarm_l', 'hand_l', [0, 0, 0])).toThrow(/not a child/);
  });
});

describe('hands', () => {
  it('curling fingers moves fingertips toward the palm', () => {
    for (const seed of [undefined, 11]) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
      const w0 = b.world();
      const palmPoint = add(midpoint(w0.hand_l!.position, w0.middle_01_l!.position), scale(palmNormal(w0, 'l'), 3));
      const before = distance(w0.middle_03_l!.position, palmPoint);
      curlFingers(b, 'l', [60, 70, 50], [15, 25, 20]);
      expect(distance(b.world().middle_03_l!.position, palmPoint)).toBeLessThan(before - 2);
    }
  });
  it('palm normals of a hanging hand point toward the body', () => {
    const w = restPose(syntheticSkeleton(), 1);
    expect(palmNormal(w, 'l')[0]).toBeLessThan(0);
    expect(palmNormal(w, 'r')[0]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/figure/pose` — Expected: FAIL (cannot resolve `./builder`).

- [ ] **Step 3: Implement `skeleton.ts`**

```ts
import { type Vec3, add, scale } from '../math/vec3';
import { type Quat, multiply, rotate } from '../math/quat';

/**
 * Pose-layer conventions:
 * - units: centimetres
 * - axes (glTF): +Y up, +Z = the figure's forward (facing) direction, +X = the figure's LEFT
 * - bones are listed parents-first; the first bone is the root (parent null)
 */
export interface BoneDef {
  name: string;
  parent: string | null;
  /** Head position in the parent's local frame (cm, at the model's native stature). */
  restLocalT: Vec3;
  /** Rest rotation relative to the parent. */
  restLocalR: Quat;
}

export interface SkeletonDef {
  source: { file: string; sha256: string };
  /** Body mesh height at rest (cm). Pose scale factor = targetStature / statureCm. */
  statureCm: number;
  bones: readonly BoneDef[];
  /** Top of the skull in the `head` bone's local frame (cm, native). */
  headTopLocal: Vec3;
}

export interface BoneState {
  position: Vec3;
  rotation: Quat;
}

export type LocalRotations = Readonly<Record<string, Quat>>;
export type WorldPose = Readonly<Record<string, BoneState>>;

export interface PoseInput {
  /** Full local rotation per bone; bones not listed keep their rest rotation. */
  local: LocalRotations;
  /** World position of the root bone (cm, already scaled). Defaults to its scaled rest position. */
  rootPosition?: Vec3;
}

export function boneMap(sk: SkeletonDef): Map<string, BoneDef> {
  return new Map(sk.bones.map((b) => [b.name, b]));
}

export function forwardKinematics(sk: SkeletonDef, input: PoseInput, scaleFactor: number): WorldPose {
  const out: Record<string, BoneState> = {};
  for (const b of sk.bones) {
    const localR = input.local[b.name] ?? b.restLocalR;
    if (b.parent === null) {
      out[b.name] = { position: input.rootPosition ?? scale(b.restLocalT, scaleFactor), rotation: localR };
      continue;
    }
    const p = out[b.parent];
    if (!p) throw new Error(`forwardKinematics: bone "${b.name}" is listed before its parent "${b.parent}"`);
    out[b.name] = {
      position: add(p.position, rotate(p.rotation, scale(b.restLocalT, scaleFactor))),
      rotation: multiply(p.rotation, localR),
    };
  }
  return out;
}

export function restPose(sk: SkeletonDef, scaleFactor: number): WorldPose {
  return forwardKinematics(sk, { local: {} }, scaleFactor);
}
```

- [ ] **Step 4: Implement `builder.ts`**

```ts
import { type Vec3, add, dot, length, normalize, scale, sub } from '../math/vec3';
import { type Quat, conjugate, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, normalizeQuat, rotate } from '../math/quat';
import { type BoneDef, type SkeletonDef, type WorldPose, boneMap, forwardKinematics } from './skeleton';

/** Mutable pose under construction. Every operation is a rotation, so bone lengths never change. */
export class PoseBuilder {
  readonly local: Record<string, Quat>;
  rootPosition: Vec3;
  private readonly defs: Map<string, BoneDef>;

  constructor(
    readonly sk: SkeletonDef,
    readonly scaleFactor: number,
  ) {
    this.defs = boneMap(sk);
    this.local = Object.fromEntries(sk.bones.map((b) => [b.name, b.restLocalR]));
    this.rootPosition = scale(sk.bones[0]!.restLocalT, scaleFactor);
  }

  def(name: string): BoneDef {
    const d = this.defs.get(name);
    if (!d) throw new Error(`Unknown bone "${name}"`);
    return d;
  }

  world(): WorldPose {
    return forwardKinematics(this.sk, { local: this.local, rootPosition: this.rootPosition }, this.scaleFactor);
  }

  /** Set a bone's world rotation; its children follow rigidly. */
  setWorldRotation(bone: string, worldRot: Quat): void {
    const d = this.def(bone);
    const parentRot = d.parent ? this.world()[d.parent]!.rotation : IDENTITY;
    this.local[bone] = normalizeQuat(multiply(conjugate(parentRot), worldRot));
  }

  /** Rotate a bone about a world-space axis through its head. */
  rotateWorld(bone: string, axis: Vec3, angleRad: number): void {
    this.setWorldRotation(bone, multiply(fromAxisAngle(axis, angleRad), this.world()[bone]!.rotation));
  }

  /** Rotate a bone about an axis expressed in its own local frame. */
  rotateLocal(bone: string, axisLocal: Vec3, angleRad: number): void {
    this.local[bone] = normalizeQuat(multiply(this.local[bone]!, fromAxisAngle(axisLocal, angleRad)));
  }

  /**
   * Point `bone` so its child `child` lies on the line toward `target`. Starts from the bone's rest
   * orientation relative to its posed parent and applies the shortest swing, which keeps twist natural.
   */
  aim(bone: string, child: string, target: Vec3): void {
    const d = this.def(bone);
    const c = this.def(child);
    if (c.parent !== bone) throw new Error(`aim: "${child}" is not a child of "${bone}"`);
    const w = this.world();
    const parentRot = d.parent ? w[d.parent]!.rotation : IDENTITY;
    const restWorldRot = multiply(parentRot, d.restLocalR);
    const swing = fromUnitVectors(rotate(restWorldRot, c.restLocalT), sub(target, w[bone]!.position));
    this.setWorldRotation(bone, multiply(swing, restWorldRot));
  }

  /**
   * Analytic two-bone IK: upper -> lower -> end, bending the middle joint toward `pole`.
   * Returns where the end joint landed (differs from `target` only when out of reach).
   */
  twoBoneIK(upper: string, lower: string, end: string, target: Vec3, pole: Vec3): Vec3 {
    const a = this.world()[upper]!.position;
    const l1 = length(this.def(lower).restLocalT) * this.scaleFactor;
    const l2 = length(this.def(end).restLocalT) * this.scaleFactor;
    const toTarget = sub(target, a);
    const d = Math.min(Math.max(length(toTarget), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
    const dir = normalize(toTarget);
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const poleOrtho = normalize(sub(pole, scale(dir, dot(pole, dir))));
    const mid = add(add(a, scale(dir, along)), scale(poleOrtho, h));
    const reached = add(a, scale(dir, d));
    this.aim(upper, lower, mid);
    this.aim(lower, end, reached);
    return reached;
  }
}
```

- [ ] **Step 5: Implement `hands.ts`**

```ts
import { type Vec3, cross, normalize, sub } from '../math/vec3';
import { degToRad } from '../math/quat';
import type { PoseBuilder } from './builder';
import type { WorldPose } from './skeleton';

export type Side = 'l' | 'r';
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** Unit normal pointing out of the palm, from the knuckle layout (anatomy, not rig axes). */
export function palmNormal(w: WorldPose, side: Side): Vec3 {
  const across = sub(w[`pinky_01_${side}`]!.position, w[`index_01_${side}`]!.position);
  const along = sub(w[`middle_01_${side}`]!.position, w[`hand_${side}`]!.position);
  return normalize(side === 'l' ? cross(across, along) : cross(along, across));
}

/** Curl every finger segment toward the palm (degrees for segments 01/02/03). */
export function curlFingers(
  b: PoseBuilder,
  side: Side,
  fingerDeg: readonly [number, number, number],
  thumbDeg: readonly [number, number, number],
): void {
  for (const finger of [...FINGERS, 'thumb'] as const) {
    const angles = finger === 'thumb' ? thumbDeg : fingerDeg;
    for (let seg = 1; seg <= 3; seg++) {
      const w = b.world();
      const bone = `${finger}_0${seg}_${side}`;
      const dir =
        seg < 3
          ? sub(w[`${finger}_0${seg + 1}_${side}`]!.position, w[bone]!.position)
          : sub(w[bone]!.position, w[`${finger}_0${seg - 1}_${side}`]!.position);
      b.rotateWorld(bone, normalize(cross(dir, palmNormal(w, side))), degToRad(angles[seg - 1]!));
    }
  }
}
```

- [ ] **Step 6: Implement `synthetic.ts`**

```ts
import { type Vec3, sub } from '../math/vec3';
import { type Quat, conjugate, fromAxisAngle, IDENTITY, multiply, rotate } from '../math/quat';
import type { BoneDef, SkeletonDef } from './skeleton';

/**
 * 175 cm synthetic skeleton with the same bone names and hierarchy as the MPFB "game_engine" rig,
 * so solvers can be tested without the real model. Rest pose: standing, arms hanging slightly
 * abducted, palms facing the thighs, facing +Z, left = +X.
 */
const LEFT: Record<string, [string, Vec3]> = {
  clavicle_l: ['spine_03', [3, 143, 2]],
  upperarm_l: ['clavicle_l', [18, 142, -2]],
  lowerarm_l: ['upperarm_l', [22.5, 109.7, -2]],
  hand_l: ['lowerarm_l', [26.1, 84.3, -1]],
  thumb_01_l: ['hand_l', [26, 82, 3.5]],
  thumb_02_l: ['thumb_01_l', [27, 78.5, 5.5]],
  thumb_03_l: ['thumb_02_l', [27.5, 75.5, 6.5]],
  index_01_l: ['hand_l', [27.5, 75, 2]],
  index_02_l: ['index_01_l', [27.8, 71, 2.3]],
  index_03_l: ['index_02_l', [28, 68.5, 2.4]],
  middle_01_l: ['hand_l', [27.8, 74.5, 0]],
  middle_02_l: ['middle_01_l', [28.1, 70, 0.2]],
  middle_03_l: ['middle_02_l', [28.3, 67.2, 0.3]],
  ring_01_l: ['hand_l', [27.8, 75, -2]],
  ring_02_l: ['ring_01_l', [28, 71, -2.1]],
  ring_03_l: ['ring_02_l', [28.2, 68.4, -2.2]],
  pinky_01_l: ['hand_l', [27.3, 76, -3.8]],
  pinky_02_l: ['pinky_01_l', [27.5, 73, -4]],
  pinky_03_l: ['pinky_02_l', [27.6, 71, -4.1]],
  thigh_l: ['pelvis', [9, 91, 0]],
  calf_l: ['thigh_l', [9, 49.9, 0.5]],
  foot_l: ['calf_l', [9, 6.8, -1]],
  ball_l: ['foot_l', [9, 2, 14]],
};

const CENTER: Record<string, [string | null, Vec3]> = {
  Root: [null, [0, 0, 0]],
  pelvis: ['Root', [0, 94, 0]],
  spine_01: ['pelvis', [0, 100, -1]],
  spine_02: ['spine_01', [0, 112, -2]],
  spine_03: ['spine_02', [0, 126, -2]],
  neck_01: ['spine_03', [0, 146, -2]],
  head: ['neck_01', [0, 157, 0]],
};

const STATURE = 175;

function worldTable(): Array<[string, string | null, Vec3]> {
  const rows: Array<[string, string | null, Vec3]> = Object.entries(CENTER).map(([n, [p, v]]) => [n, p, v]);
  for (const [n, [p, v]] of Object.entries(LEFT)) {
    rows.push([n, p, v]);
    rows.push([n.replace(/_l$/, '_r'), p.replace(/_l$/, '_r'), [-v[0], v[1], v[2]]]);
  }
  const ordered: typeof rows = [];
  const placed = new Set<string>();
  while (ordered.length < rows.length) {
    for (const r of rows) {
      if (!placed.has(r[0]) && (r[1] === null || placed.has(r[1]))) {
        ordered.push(r);
        placed.add(r[0]);
      }
    }
  }
  return ordered;
}

/** Deterministic pseudo-random rotation, for testing that solvers ignore rig axis conventions. */
function seededRotation(seed: number, i: number): Quat {
  const r = (k: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + k * 233280) * 43758.5453;
    return x - Math.floor(x);
  };
  return fromAxisAngle([r(1) - 0.5, r(2) - 0.5, r(3) - 0.5 + 1e-3], (r(4) - 0.5) * 2 * Math.PI);
}

export function syntheticSkeleton(opts: { randomRestSeed?: number } = {}): SkeletonDef {
  const rows = worldTable();
  const pos = new Map(rows.map(([n, , v]) => [n, v]));
  const worldRot = new Map<string, Quat>(
    rows.map(([n], i) => [n, opts.randomRestSeed === undefined ? IDENTITY : seededRotation(opts.randomRestSeed, i)]),
  );
  const bones: BoneDef[] = rows.map(([name, parent, p]) => {
    if (parent === null) return { name, parent, restLocalT: p, restLocalR: worldRot.get(name)! };
    const invParent = conjugate(worldRot.get(parent)!);
    return {
      name,
      parent,
      restLocalT: rotate(invParent, sub(p, pos.get(parent)!)),
      restLocalR: multiply(invParent, worldRot.get(name)!),
    };
  });
  const head = pos.get('head')!;
  return {
    source: { file: 'synthetic', sha256: 'synthetic' },
    statureCm: STATURE,
    bones,
    headTopLocal: rotate(conjugate(worldRot.get('head')!), [0, STATURE - head[1], 0]),
  };
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/lib/figure/pose && npm run lint`
Expected: PASS (9 tests), lint clean.

- [ ] **Step 8: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add skeleton FK, pose builder with IK, and hand curl\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Pose core: skeleton, FK, pose builder, hands" \
  --body $'pose-core tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** pose-core tests pass in CI.

---

### Task 9: Smith machine geometry

**Files:**
- Create: `src/lib/figure/geometry/primitives.ts`, `src/lib/figure/geometry/smith.ts`, `src/lib/figure/geometry/smith.test.ts`

**Interfaces:**
- Produces:
  - `primitives.ts`: `type SurfaceKind = 'frame'|'chrome'|'plate'|'stop'|'catch'|'carriage'`; `type Primitive = {kind:'box'; id; center; size; surface} | {kind:'cylinder'; id; start; end; radius; surface}`; `interface Aabb {min; max}`; `aabbOf(p)`, `aabbOverlap(a, b)`.
  - `smith.ts`: `interface SmithParams { rackInnerWidthCm; rackInnerDepthCm; rackHeightCm; uprightSizeCm; railZCm; railHalfSpacingCm; railRadiusCm; barRadiusCm; sleeveLengthCm; lowestBarHeightCm; highestBarHeightCm; plateDiameterCm; plateThicknessCm }`, `ILLUSTRATIVE_SMITH`, `interface SmithState { barHeightCm; catchHeightCm? }`, `CARRIAGE_HALF_HEIGHT_CM = 8`, `buildSmith(p, state): Primitive[]`. Moving parts have ids `bar`, `plate-left|right`, `carriage-left|right` and are centred at the bar height.

- [ ] **Step 1: Write the failing tests**

`src/lib/figure/geometry/smith.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { aabbOf, aabbOverlap, type Primitive } from './primitives';
import { buildSmith, CARRIAGE_HALF_HEIGHT_CM, ILLUSTRATIVE_SMITH as P } from './smith';

const byId = (prims: Primitive[], id: string) => {
  const p = prims.find((x) => x.id === id);
  if (!p) throw new Error(`missing ${id}`);
  return p;
};

describe('buildSmith', () => {
  const prims = buildSmith(P, { barHeightCm: 120, catchHeightCm: 90 });

  it('has unique ids', () => {
    expect(new Set(prims.map((p) => p.id)).size).toBe(prims.length);
  });
  it('places vertical rails inside the uprights', () => {
    for (const side of ['left', 'right']) {
      const rail = byId(prims, `rail-${side}`);
      if (rail.kind !== 'cylinder') throw new Error('rail must be a cylinder');
      expect(rail.start[0]).toBe(rail.end[0]);
      expect(rail.start[2]).toBe(rail.end[2]);
      expect(Math.abs(rail.start[0])).toBeLessThan(P.rackInnerWidthCm / 2);
    }
  });
  it('puts the bar, carriages and plates at the bar height', () => {
    for (const id of ['bar', 'plate-left', 'plate-right']) {
      const p = byId(prims, id);
      if (p.kind !== 'cylinder') throw new Error(`${id} must be a cylinder`);
      expect(p.start[1]).toBe(120);
    }
    const c = byId(prims, 'carriage-left');
    expect(c.kind === 'box' && c.center[1]).toBe(120);
  });
  it('loads plates outside the rails', () => {
    const plate = aabbOf(byId(prims, 'plate-left'));
    expect(plate.min[0]).toBeGreaterThan(P.railHalfSpacingCm);
  });
  it('stops the carriage at the lowest bar height', () => {
    const stop = aabbOf(byId(prims, 'stop-left'));
    expect(stop.max[1]).toBeCloseTo(P.lowestBarHeightCm - CARRIAGE_HALF_HEIGHT_CM);
  });
  it('sets catches so the carriage rests on them at the catch height', () => {
    const c = aabbOf(byId(prims, 'catch-left'));
    expect(c.max[1]).toBeCloseTo(90 - CARRIAGE_HALF_HEIGHT_CM);
  });
  it('omits catches when no catch height is given', () => {
    expect(buildSmith(P, { barHeightCm: 120 }).some((p) => p.id.startsWith('catch-'))).toBe(false);
  });
  it('keeps the bar clear of the uprights', () => {
    const bar = aabbOf(byId(prims, 'bar'));
    for (const up of prims.filter((p) => p.id.startsWith('upright-'))) {
      expect(aabbOverlap(bar, aabbOf(up)), up.id).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/figure/geometry` — Expected: FAIL (cannot resolve `./primitives`).

- [ ] **Step 3: Implement `primitives.ts`**

```ts
import { type Vec3, normalize, sub } from '../math/vec3';

/** Surface kinds; the 3D layer maps each to a material. */
export type SurfaceKind = 'frame' | 'chrome' | 'plate' | 'stop' | 'catch' | 'carriage';

export type Primitive =
  | { kind: 'box'; id: string; center: Vec3; size: Vec3; surface: SurfaceKind }
  | { kind: 'cylinder'; id: string; start: Vec3; end: Vec3; radius: number; surface: SurfaceKind };

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export function aabbOf(p: Primitive): Aabb {
  if (p.kind === 'box') {
    const h: Vec3 = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    return {
      min: [p.center[0] - h[0], p.center[1] - h[1], p.center[2] - h[2]],
      max: [p.center[0] + h[0], p.center[1] + h[1], p.center[2] + h[2]],
    };
  }
  // Exact box of a capped cylinder: along each world axis the caps add r * sqrt(1 - d_i^2).
  const d = normalize(sub(p.end, p.start));
  const e = d.map((c) => p.radius * Math.sqrt(Math.max(0, 1 - c * c))) as unknown as Vec3;
  return {
    min: [Math.min(p.start[0], p.end[0]) - e[0], Math.min(p.start[1], p.end[1]) - e[1], Math.min(p.start[2], p.end[2]) - e[2]],
    max: [Math.max(p.start[0], p.end[0]) + e[0], Math.max(p.start[1], p.end[1]) + e[1], Math.max(p.start[2], p.end[2]) + e[2]],
  };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return [0, 1, 2].every((i) => a.min[i]! < b.max[i]! && b.min[i]! < a.max[i]!);
}
```

- [ ] **Step 4: Implement `smith.ts`**

```ts
import type { Primitive } from './primitives';

/**
 * Smith machine geometry (cm). Origin: floor under the rack centre; +Z toward the side the lifter
 * faces; +X to the lifter's left.
 */
export interface SmithParams {
  rackInnerWidthCm: number;
  rackInnerDepthCm: number;
  rackHeightCm: number;
  uprightSizeCm: number;
  /** Z of the Smith rails (the bar path). */
  railZCm: number;
  /** Distance of each rail from the centre line (X). */
  railHalfSpacingCm: number;
  railRadiusCm: number;
  barRadiusCm: number;
  /** How far each bar sleeve extends past its rail. */
  sleeveLengthCm: number;
  lowestBarHeightCm: number;
  highestBarHeightCm: number;
  plateDiameterCm: number;
  plateThicknessCm: number;
}

/**
 * Drawing defaults for generic pages — NOT measurements of anyone's machine. Pages label them
 * "illustrative" and feasibility checks never use them.
 */
export const ILLUSTRATIVE_SMITH: SmithParams = {
  rackInnerWidthCm: 120,
  rackInnerDepthCm: 100,
  rackHeightCm: 215,
  uprightSizeCm: 7.5,
  railZCm: 0,
  railHalfSpacingCm: 52,
  railRadiusCm: 1.5,
  barRadiusCm: 1.6,
  sleeveLengthCm: 30,
  lowestBarHeightCm: 40,
  highestBarHeightCm: 190,
  plateDiameterCm: 45,
  plateThicknessCm: 6,
};

export interface SmithState {
  barHeightCm: number;
  /** Bar height at which the safety catches stop the bar; omit to draw no catches. */
  catchHeightCm?: number;
}

/** Half the height of the carriage block on each rail; it rests on stops and catches. */
export const CARRIAGE_HALF_HEIGHT_CM = 8;

export function buildSmith(p: SmithParams, state: SmithState): Primitive[] {
  const halfW = p.rackInnerWidthCm / 2 + p.uprightSizeCm / 2;
  const halfD = p.rackInnerDepthCm / 2 + p.uprightSizeCm / 2;
  const u = p.uprightSizeCm;
  const h = p.rackHeightCm;
  const y = state.barHeightCm;
  const out: Primitive[] = [];

  for (const [sx, sz, tag] of [
    [1, 1, 'front-left'],
    [-1, 1, 'front-right'],
    [1, -1, 'back-left'],
    [-1, -1, 'back-right'],
  ] as const) {
    out.push({ kind: 'box', id: `upright-${tag}`, center: [sx * halfW, h / 2, sz * halfD], size: [u, h, u], surface: 'frame' });
  }
  for (const [sz, tag] of [
    [1, 'front'],
    [-1, 'back'],
  ] as const) {
    out.push({ kind: 'box', id: `beam-top-${tag}`, center: [0, h - u / 2, sz * halfD], size: [2 * halfW + u, u, u], surface: 'frame' });
  }
  for (const [sx, tag] of [
    [1, 'left'],
    [-1, 'right'],
  ] as const) {
    out.push({ kind: 'box', id: `beam-top-${tag}`, center: [sx * halfW, h - u / 2, 0], size: [u, u, 2 * halfD - u], surface: 'frame' });
    out.push({ kind: 'box', id: `base-${tag}`, center: [sx * halfW, u / 4, 0], size: [u, u / 2, 2 * halfD + u], surface: 'frame' });
    const rx = sx * p.railHalfSpacingCm;
    out.push({ kind: 'cylinder', id: `rail-${tag}`, start: [rx, 3, p.railZCm], end: [rx, h - u, p.railZCm], radius: p.railRadiusCm, surface: 'chrome' });
    out.push({ kind: 'box', id: `carriage-${tag}`, center: [rx, y, p.railZCm], size: [6, 2 * CARRIAGE_HALF_HEIGHT_CM, 6], surface: 'carriage' });
    out.push({ kind: 'box', id: `stop-${tag}`, center: [rx, p.lowestBarHeightCm - CARRIAGE_HALF_HEIGHT_CM - 2, p.railZCm], size: [7, 4, 7], surface: 'stop' });
    if (state.catchHeightCm !== undefined) {
      out.push({ kind: 'box', id: `catch-${tag}`, center: [rx, state.catchHeightCm - CARRIAGE_HALF_HEIGHT_CM - 1.5, p.railZCm], size: [9, 3, 9], surface: 'catch' });
    }
    const plateX = sx * (p.railHalfSpacingCm + 8 + p.plateThicknessCm / 2);
    out.push({
      kind: 'cylinder',
      id: `plate-${tag}`,
      start: [plateX - p.plateThicknessCm / 2, y, p.railZCm],
      end: [plateX + p.plateThicknessCm / 2, y, p.railZCm],
      radius: p.plateDiameterCm / 2,
      surface: 'plate',
    });
  }
  const barHalf = p.railHalfSpacingCm + p.sleeveLengthCm;
  out.push({ kind: 'cylinder', id: 'bar', start: [-barHalf, y, p.railZCm], end: [barHalf, y, p.railZCm], radius: p.barRadiusCm, surface: 'chrome' });
  return out;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/figure/geometry` — Expected: PASS (8 tests).

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add parametric Smith machine geometry\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Smith machine geometry" \
  --body $'geometry tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** geometry tests pass in CI.

---

### Task 10: Smith squat solver and validators

**Files:**
- Create: `src/lib/figure/pose/smithSquat.ts`, `src/lib/figure/pose/validate.ts`, `src/lib/figure/fixtures/smith-squat.ts`, `src/lib/figure/fixtures/index.ts`, `src/lib/figure/pose/smithSquat.test.ts`

**Interfaces:**
- Consumes: Tasks 7–9; `I18nText` from `src/lib/i18n/locales.ts` (type only).
- Produces:
  - `smithSquat.ts`: `interface SmithSquatFrame { id; label: I18nText; cue: I18nText; shankDeg; thighDeg; arrow?: 'down'|'up' }`, `interface SmithSquatSpec { id; name: I18nText; camera: { azimuthDeg; elevationDeg; distanceCm; targetYCm }; stance: { halfWidthCm; toeOutDeg; forwardOfRailCm }; grip: { halfWidthCm; wristOffsetCm: Vec3; knuckleOffsetCm: Vec3; fingerCurlDeg; thumbCurlDeg }; barRestOffsetCm: Vec3; headFollow; frames }`, `type AnchorBone`, `interface SmithSquatSolution { frameId; scaleFactor; local; rootPosition; world; barCenter; trunkDeg; targets }`, `solveSmithSquat(sk, spec, frame, { statureCm, railZCm }): SmithSquatSolution`.
  - `validate.ts`: `interface Finding { check: 'anchor'|'feet-flat'|'bar-on-rail'|'bar-travel'|'bone-length'|'rom'|'ceiling'; severity: 'error'|'warn'; message }`, `ROM_LIMITS`, `jointAngles(w, side)`, `headTop(sk, w, scaleFactor)`, `validateSmithSquat(sk, sol, { smith, ceilingCm?, clearanceMarginCm? }): Finding[]`.
  - `fixtures`: `SMITH_SQUAT: SmithSquatSpec`, `FIGURES: Record<string, SmithSquatSpec>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/figure/pose/smithSquat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { distance } from '../math/vec3';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { syntheticSkeleton } from './synthetic';
import { solveSmithSquat } from './smithSquat';
import { jointAngles, validateSmithSquat } from './validate';

const STATURES = [150, 165, 175, 190, 200];

describe('solveSmithSquat', () => {
  it.each(STATURES)('produces valid frames at %i cm', (statureCm) => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(sk, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      const findings = validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH });
      expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
    }
  });

  it('is independent of the rig rest-rotation convention', () => {
    const f = SMITH_SQUAT.frames[1]!;
    const a = solveSmithSquat(syntheticSkeleton(), SMITH_SQUAT, f, { statureCm: 190, railZCm: 0 });
    const b = solveSmithSquat(syntheticSkeleton({ randomRestSeed: 9 }), SMITH_SQUAT, f, { statureCm: 190, railZCm: 0 });
    for (const name of Object.keys(a.world)) expect(distance(a.world[name]!.position, b.world[name]!.position)).toBeLessThan(1e-6);
  });

  it('squats deeper and leans more at the bottom than at the top', () => {
    const sk = syntheticSkeleton();
    const [top, bottom] = [0, 1].map((i) => solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[i]!, { statureCm: 190, railZCm: 0 }));
    expect(bottom!.barCenter[1]).toBeLessThan(top!.barCenter[1] - 30);
    expect(bottom!.trunkDeg).toBeGreaterThan(top!.trunkDeg + 15);
    const a = jointAngles(bottom!.world, 'l');
    expect(a.kneeFlexDeg).toBeGreaterThan(90);
    expect(a.hipFlexDeg).toBeGreaterThan(90);
  });

  it('throws when no trunk angle can reach the rail', () => {
    const far = { ...SMITH_SQUAT, stance: { ...SMITH_SQUAT.stance, forwardOfRailCm: 150 } };
    expect(() => solveSmithSquat(syntheticSkeleton(), far, SMITH_SQUAT.frames[0]!, { statureCm: 175, railZCm: 0 })).toThrow(
      /no trunk angle/,
    );
  });
});

describe('validateSmithSquat catches problems', () => {
  const sk = syntheticSkeleton();
  it('flags a narrow grip that over-bends the elbows', () => {
    const narrow = { ...SMITH_SQUAT, grip: { ...SMITH_SQUAT.grip, halfWidthCm: 20 } };
    const sol = solveSmithSquat(sk, narrow, SMITH_SQUAT.frames[0]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH }).map((f) => f.check)).toContain('rom');
  });
  it('flags a bottom position below the lower stop', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: { ...ILLUSTRATIVE_SMITH, lowestBarHeightCm: 150 } }).map((f) => f.check)).toContain('bar-travel');
  });
  it('flags a low ceiling and passes a normal one', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[0]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, ceilingCm: 195 }).map((f) => f.check)).toContain('ceiling');
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, ceilingCm: 244 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/figure/pose/smithSquat.test.ts` — Expected: FAIL (cannot resolve `../fixtures/smith-squat`).

- [ ] **Step 3: Implement `smithSquat.ts`**

```ts
import { type Vec3, add, distance, midpoint, scale, sub, X_AXIS, Y_AXIS } from '../math/vec3';
import { type Quat, degToRad, fromAxisAngle, multiply, rotate } from '../math/quat';
import type { I18nText } from '../../i18n/locales';
import { PoseBuilder } from './builder';
import { curlFingers, type Side } from './hands';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';

export interface SmithSquatFrame {
  id: string;
  label: I18nText;
  cue: I18nText;
  /** Forward tilt of the shin from vertical (deg). */
  shankDeg: number;
  /** Thigh angle from vertical (deg); negative = hips behind the knees. */
  thighDeg: number;
  /** Movement arrow drawn beside the bar in this frame. */
  arrow?: 'down' | 'up';
}

export interface SmithSquatSpec {
  id: string;
  name: I18nText;
  /** Camera at the 175 cm default stature; distance and target scale with stature. */
  camera: { azimuthDeg: number; elevationDeg: number; distanceCm: number; targetYCm: number };
  stance: { halfWidthCm: number; toeOutDeg: number; forwardOfRailCm: number };
  grip: {
    halfWidthCm: number;
    /** Wrist target relative to the grip point (left hand; mirrored for the right). */
    wristOffsetCm: Vec3;
    /** Knuckle aim point relative to the grip point (left hand; mirrored for the right). */
    knuckleOffsetCm: Vec3;
    fingerCurlDeg: readonly [number, number, number];
    thumbCurlDeg: readonly [number, number, number];
  };
  /** Bar centre relative to the neck_01 head at rest (cm at native scale). */
  barRestOffsetCm: Vec3;
  /** Fraction of the trunk lean the head keeps (0.4 = the head tilts 40% as much as the trunk). */
  headFollow: number;
  frames: readonly SmithSquatFrame[];
}

export type AnchorBone = 'hand_l' | 'hand_r' | 'foot_l' | 'foot_r';

export interface SmithSquatSolution {
  frameId: string;
  scaleFactor: number;
  local: Record<string, Quat>;
  rootPosition: Vec3;
  world: WorldPose;
  barCenter: Vec3;
  trunkDeg: number;
  targets: Record<AnchorBone, Vec3>;
}

const mirror = (v: Vec3, sx: number): Vec3 => [sx * v[0], v[1], v[2]];

export function solveSmithSquat(
  sk: SkeletonDef,
  spec: SmithSquatSpec,
  frame: SmithSquatFrame,
  ctx: { statureCm: number; railZCm: number },
): SmithSquatSolution {
  const s = ctx.statureCm / sk.statureCm;
  const b = new PoseBuilder(sk, s);
  const rest = restPose(sk, s);
  const P = (n: string): Vec3 => rest[n]!.position;

  // Legs in the sagittal plane; the stance's lateral offset is folded into effective segment lengths.
  const hipRest = midpoint(P('thigh_l'), P('thigh_r'));
  const thighLen = distance(P('thigh_l'), P('calf_l'));
  const shankLen = distance(P('calf_l'), P('foot_l'));
  const lateral = Math.max(0, spec.stance.halfWidthCm - Math.abs(P('thigh_l')[0] - hipRest[0]));
  const thighEff = Math.sqrt(thighLen ** 2 - ((lateral * thighLen) / (thighLen + shankLen)) ** 2);
  const shankEff = Math.sqrt(shankLen ** 2 - ((lateral * shankLen) / (thighLen + shankLen)) ** 2);
  const ankleY = (P('foot_l')[1] + P('foot_r')[1]) / 2;
  const footZ = ctx.railZCm + spec.stance.forwardOfRailCm;
  const sr = degToRad(frame.shankDeg);
  const tr = degToRad(frame.thighDeg);
  const kneeY = ankleY + shankEff * Math.cos(sr);
  const kneeZ = footZ + shankEff * Math.sin(sr);
  const hip: Vec3 = [0, kneeY + thighEff * Math.cos(tr), kneeZ + thighEff * Math.sin(tr)];

  // Trunk lean: rotate the rigid torso about the hip axis until the bar sits on the rail.
  const barRest = add(P('neck_01'), scale(spec.barRestOffsetCm, s));
  const hipToBar = sub(barRest, hipRest);
  const barAt = (deg: number): Vec3 => add(hip, rotate(fromAxisAngle(X_AXIS, degToRad(deg)), hipToBar));
  let lo = -15;
  let hi = 75;
  if (barAt(lo)[2] > ctx.railZCm || barAt(hi)[2] < ctx.railZCm) {
    throw new Error(`smith-squat frame "${frame.id}": no trunk angle puts the bar on the rail`);
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (barAt(mid)[2] < ctx.railZCm) lo = mid;
    else hi = mid;
  }
  const trunkDeg = (lo + hi) / 2;
  const lean = fromAxisAngle(X_AXIS, degToRad(trunkDeg));
  const root = sk.bones[0]!;
  b.local[root.name] = multiply(lean, root.restLocalR);
  b.rootPosition = add(hip, rotate(lean, sub(rest[root.name]!.position, hipRest)));

  // Head keeps only `headFollow` of the lean (neutral neck, gaze slightly down).
  const headBack = -(1 - spec.headFollow) * degToRad(trunkDeg);
  b.rotateWorld('neck_01', X_AXIS, headBack / 2);
  b.rotateWorld('head', X_AXIS, headBack / 2);

  const barCenter = barAt(trunkDeg);
  const targets = {} as Record<AnchorBone, Vec3>;
  const toe = degToRad(spec.stance.toeOutDeg);

  for (const [side, sx] of [
    ['l', 1],
    ['r', -1],
  ] as Array<[Side, number]>) {
    // Legs: knees track over the toes; feet flat and turned out.
    const ankle: Vec3 = [sx * spec.stance.halfWidthCm, P(`foot_${side}`)[1], footZ];
    b.twoBoneIK(`thigh_${side}`, `calf_${side}`, `foot_${side}`, ankle, [sx * Math.sin(toe), 0.1, Math.cos(toe)]);
    b.setWorldRotation(`foot_${side}`, multiply(fromAxisAngle(Y_AXIS, sx * toe), rest[`foot_${side}`]!.rotation));
    targets[`foot_${side}`] = ankle;

    // Arms: hands on the bar, elbows down and back.
    const grip: Vec3 = [sx * spec.grip.halfWidthCm, barCenter[1], barCenter[2]];
    const wrist = add(grip, mirror(spec.grip.wristOffsetCm, sx));
    b.twoBoneIK(`upperarm_${side}`, `lowerarm_${side}`, `hand_${side}`, wrist, [sx * 0.6, -1, -0.6]);
    b.aim(`hand_${side}`, `middle_01_${side}`, add(grip, mirror(spec.grip.knuckleOffsetCm, sx)));
    curlFingers(b, side, spec.grip.fingerCurlDeg, spec.grip.thumbCurlDeg);
    targets[`hand_${side}`] = wrist;
  }

  return {
    frameId: frame.id,
    scaleFactor: s,
    local: { ...b.local },
    rootPosition: b.rootPosition,
    world: b.world(),
    barCenter,
    trunkDeg,
    targets,
  };
}
```

- [ ] **Step 4: Implement `validate.ts`**

```ts
import { add, angleBetweenDeg, distance, length, scale, sub, Y_AXIS } from '../math/vec3';
import { rotate } from '../math/quat';
import type { SmithParams } from '../geometry/smith';
import type { Side } from './hands';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';
import type { SmithSquatSolution } from './smithSquat';

export type Severity = 'error' | 'warn';

export interface Finding {
  check: 'anchor' | 'feet-flat' | 'bar-on-rail' | 'bar-travel' | 'bone-length' | 'rom' | 'ceiling';
  severity: Severity;
  message: string;
}

/** Conservative joint limits (degrees of flexion from straight). */
export const ROM_LIMITS = { elbowFlexDeg: 145, kneeFlexDeg: 150, hipFlexDeg: 130, ankleDorsiflexDeg: 40 } as const;

export function jointAngles(w: WorldPose, side: Side) {
  const p = (n: string) => w[`${n}_${side}`]!.position;
  const trunkUp = sub(w.spine_03!.position, w.pelvis!.position);
  return {
    elbowFlexDeg: angleBetweenDeg(sub(p('lowerarm'), p('upperarm')), sub(p('hand'), p('lowerarm'))),
    kneeFlexDeg: angleBetweenDeg(sub(p('calf'), p('thigh')), sub(p('foot'), p('calf'))),
    hipFlexDeg: 180 - angleBetweenDeg(trunkUp, sub(p('calf'), p('thigh'))),
    ankleDorsiflexDeg: angleBetweenDeg(sub(p('calf'), p('foot')), Y_AXIS),
  };
}

export function headTop(sk: SkeletonDef, w: WorldPose, scaleFactor: number) {
  return add(w.head!.position, rotate(w.head!.rotation, scale(sk.headTopLocal, scaleFactor)));
}

export function validateSmithSquat(
  sk: SkeletonDef,
  sol: SmithSquatSolution,
  ctx: { smith: SmithParams; ceilingCm?: number; clearanceMarginCm?: number },
): Finding[] {
  const out: Finding[] = [];
  const error = (check: Finding['check'], message: string) => out.push({ check, severity: 'error', message });
  const w = sol.world;
  const s = sol.scaleFactor;

  for (const [bone, target] of Object.entries(sol.targets)) {
    const d = distance(w[bone]!.position, target);
    if (d > 1) error('anchor', `${bone} is ${d.toFixed(1)} cm from its target`);
  }

  const rest = restPose(sk, s);
  for (const side of ['l', 'r'] as const) {
    const dy = Math.abs(w[`ball_${side}`]!.position[1] - rest[`ball_${side}`]!.position[1]);
    if (dy > 1.5) error('feet-flat', `ball_${side} lifted ${dy.toFixed(1)} cm off the floor`);
  }

  const offRail = Math.abs(sol.barCenter[2] - ctx.smith.railZCm);
  if (offRail > 0.5) error('bar-on-rail', `bar is ${offRail.toFixed(1)} cm off the rail`);
  const y = sol.barCenter[1];
  if (y < ctx.smith.lowestBarHeightCm || y > ctx.smith.highestBarHeightCm) {
    error('bar-travel', `bar at ${y.toFixed(0)} cm is outside ${ctx.smith.lowestBarHeightCm}–${ctx.smith.highestBarHeightCm} cm`);
  }

  for (const b of sk.bones) {
    if (!b.parent) continue;
    const expected = length(b.restLocalT) * s;
    const actual = distance(w[b.name]!.position, w[b.parent]!.position);
    if (Math.abs(actual - expected) > 0.1) error('bone-length', `${b.name} length changed by ${(actual - expected).toFixed(2)} cm`);
  }

  for (const side of ['l', 'r'] as const) {
    const a = jointAngles(w, side);
    for (const [k, limit] of Object.entries(ROM_LIMITS) as Array<[keyof typeof ROM_LIMITS, number]>) {
      if (a[k] > limit) error('rom', `${k.replace('Deg', '')}_${side} at ${a[k].toFixed(0)}° exceeds ${limit}°`);
    }
  }

  if (ctx.ceilingCm !== undefined) {
    const margin = ctx.clearanceMarginCm ?? 10;
    const top = Math.max(headTop(sk, w, s)[1], y + ctx.smith.plateDiameterCm / 2);
    if (top > ctx.ceilingCm - margin) {
      error('ceiling', `highest point ${top.toFixed(0)} cm leaves less than ${margin} cm below the ${ctx.ceilingCm} cm ceiling`);
    }
  }
  return out;
}
```

- [ ] **Step 5: Implement the fixtures**

`src/lib/figure/fixtures/smith-squat.ts`:
```ts
import type { SmithSquatSpec } from '../pose/smithSquat';

/** Smith machine back squat — the M1 spike exercise. Tuned so every frame passes the validators at 150–200 cm. */
export const SMITH_SQUAT: SmithSquatSpec = {
  id: 'smith-squat',
  name: { en: 'Smith Machine Squat', zh: '史密斯机深蹲' },
  camera: { azimuthDeg: 35, elevationDeg: 6, distanceCm: 520, targetYCm: 100 },
  stance: { halfWidthCm: 16, toeOutDeg: 12, forwardOfRailCm: 8 },
  grip: {
    halfWidthCm: 42,
    wristOffsetCm: [0, -2, -4],
    knuckleOffsetCm: [0, 5, -1],
    fingerCurlDeg: [55, 65, 45],
    thumbCurlDeg: [15, 25, 20],
  },
  barRestOffsetCm: [0, -4, -8],
  headFollow: 0.4,
  frames: [
    {
      id: 'unrack',
      label: { en: 'Unrack', zh: '出杠' },
      cue: { en: 'Rotate the bar off the hooks and brace', zh: '转动杠铃脱钩，收紧核心' },
      shankDeg: 2,
      thighDeg: -3,
      arrow: 'down',
    },
    {
      id: 'bottom',
      label: { en: 'Bottom', zh: '最低点' },
      cue: { en: 'Thighs about parallel, heels down', zh: '大腿约与地面平行，脚跟踩实' },
      shankDeg: 22,
      thighDeg: -80,
    },
    {
      id: 'drive',
      label: { en: 'Drive up', zh: '起身' },
      cue: { en: 'Push the floor away', zh: '用力蹬地起身' },
      shankDeg: 12,
      thighDeg: -42,
      arrow: 'up',
    },
  ],
};
```

`src/lib/figure/fixtures/index.ts`:
```ts
import type { SmithSquatSpec } from '../pose/smithSquat';
import { SMITH_SQUAT } from './smith-squat';

/** Every figure the renderer knows, by id. */
export const FIGURES: Record<string, SmithSquatSpec> = { [SMITH_SQUAT.id]: SMITH_SQUAT };
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/lib/figure && npm run check && npm run lint`
Expected: PASS (all figure tests, including 5 stature sweeps), `0 errors`, lint clean.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add Smith squat solver, validators and fixture\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Smith squat solver and validators" \
  --body $'the synthetic-skeleton sweep (5 statures × 3 frames) passes with zero findings in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** the synthetic-skeleton sweep (5 statures × 3 frames) passes with zero findings in CI.

---

### Task 11: Human model pipeline (MakeHuman → glTF)

**Files:**
- Create: `assets-src/human/README.md`, `assets-src/human/LICENSE.md`, `assets-src/human/human.config.json`, `assets-src/human/install_assets.py`, `assets-src/human/generate_human.py`, `scripts/setup-mpfb.sh`, `scripts/lib/extractSkeleton.ts`, `scripts/lib/extractSkeleton.test.ts`, `scripts/build-human.ts`, `tests/assets/human-model.test.ts`
- Generated + committed: `public/models/human.glb`, `src/lib/figure/pose/skeleton.json`

**Interfaces:**
- Consumes: `SkeletonDef`, `restPose`, math, solver, validators, `SMITH_SQUAT`, `ILLUSTRATIVE_SMITH`.
- Produces: `REQUIRED_BONES`, `extractSkeleton(doc: Document, source: {file; sha256}): SkeletonDef`; npm script `build:human`; `skeleton.json` (a `SkeletonDef`); `human.glb` with scene extras `{ statureM, headTopM }` and mesh nodes `Body`, `Clothes_*`, `Hair`, `Eyes`, `Eyebrows`, `Eyelashes`.

- [ ] **Step 1: STOP — ask the owner to approve the downloads**

Ask in chat, verbatim: "Task 11 needs two downloads to generate the 3D human: the MPFB (MakeHuman) Blender extension, `add-on-mpfb-v2.0.17.zip`, about 3 MB, from extensions.blender.org; and `makehuman_system_assets_cc0.zip`, 267 MB, CC0-licensed, from files2.makehumancommunity.org. Both are used only on this Mac; neither is committed. OK to download?" Continue only after a clear yes.

- [ ] **Step 2: Install tooling dependencies**

```bash
git checkout -b m1/<issue>-human-model
npm install --save-exact --save-dev tsx@4.23.15 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
  @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0 sharp@0.35.5
npm pkg set scripts.build:human="tsx scripts/build-human.ts"
```

- [ ] **Step 3: Write the failing extractor test**

`scripts/lib/extractSkeleton.test.ts`:
```ts
import { Document, type Node } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { distance } from '../../src/lib/figure/math/vec3';
import { restPose } from '../../src/lib/figure/pose/skeleton';
import { syntheticSkeleton } from '../../src/lib/figure/pose/synthetic';
import { extractSkeleton, REQUIRED_BONES } from './extractSkeleton';

/** A glTF document (metres) built from the synthetic skeleton under an armature node. */
function syntheticDocument(opts: { dropBone?: string } = {}) {
  const sk = syntheticSkeleton({ randomRestSeed: 4 });
  const doc = new Document();
  const scene = doc.createScene('Scene').setExtras({ statureM: 1.75, headTopM: [0, 1.75, 0] });
  const armature = doc.createNode('Armature');
  scene.addChild(armature);
  const nodes = new Map<string, Node>();
  for (const b of sk.bones) {
    if (b.name === opts.dropBone) continue;
    const n = doc
      .createNode(b.name)
      .setTranslation([b.restLocalT[0] / 100, b.restLocalT[1] / 100, b.restLocalT[2] / 100])
      .setRotation([b.restLocalR[0], b.restLocalR[1], b.restLocalR[2], b.restLocalR[3]]);
    nodes.set(b.name, n);
    (b.parent ? nodes.get(b.parent) : armature)?.addChild(n);
  }
  const skin = doc.createSkin('Skin');
  for (const n of nodes.values()) skin.addJoint(n);
  return { doc, sk };
}

describe('extractSkeleton', () => {
  it('recovers the rest pose in centimetres', () => {
    const { doc, sk } = syntheticDocument();
    const out = extractSkeleton(doc, { file: 'x.glb', sha256: 'abc' });
    expect(out.statureCm).toBeCloseTo(175);
    expect(out.bones[0]!.name).toBe('Root');
    const a = restPose(sk, 1);
    const b = restPose(out, 1);
    for (const name of REQUIRED_BONES) expect(distance(a[name]!.position, b[name]!.position)).toBeLessThan(1e-6);
    expect(distance(out.headTopLocal, sk.headTopLocal)).toBeLessThan(1e-6);
  });
  it('fails loudly when a required bone is missing', () => {
    const { doc } = syntheticDocument({ dropBone: 'ball_r' });
    expect(() => extractSkeleton(doc, { file: 'x', sha256: 'y' })).toThrow(/missing bones: ball_r/);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run scripts/lib/extractSkeleton.test.ts` — Expected: FAIL (cannot resolve `./extractSkeleton`).

- [ ] **Step 5: Implement `scripts/lib/extractSkeleton.ts`**

```ts
import { type Document, MathUtils, type mat4, type Node, type vec3, type vec4 } from '@gltf-transform/core';
import { type Vec3, sub } from '../../src/lib/figure/math/vec3';
import { type Quat, conjugate, rotate } from '../../src/lib/figure/math/quat';
import type { BoneDef, SkeletonDef } from '../../src/lib/figure/pose/skeleton';

/** Bones the pose layer relies on (MPFB "game_engine" rig). */
export const REQUIRED_BONES = [
  'Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  ...['l', 'r'].flatMap((s) => [
    `clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`,
    ...['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].map((i) => `${f}_0${i}_${s}`)),
    `thigh_${s}`, `calf_${s}`, `foot_${s}`, `ball_${s}`,
  ]),
];

const M_TO_CM = 100;

function worldTRS(node: Node): { t: Vec3; r: Quat; s: Vec3 } {
  const t = [0, 0, 0] as vec3;
  const r = [0, 0, 0, 1] as vec4;
  const s = [1, 1, 1] as vec3;
  MathUtils.decompose(node.getWorldMatrix() as mat4, t, r, s);
  return { t: [t[0], t[1], t[2]], r: [r[0], r[1], r[2], r[3]], s: [s[0], s[1], s[2]] };
}

function assertUnitScale(s: readonly number[], what: string): void {
  if (s.some((v) => Math.abs(v - 1) > 1e-4)) throw new Error(`${what} has non-unit scale ${s.join(',')}`);
}

/** Read the rig's rest pose (cm) plus stature and head-top from the scene extras written by build-human. */
export function extractSkeleton(doc: Document, source: { file: string; sha256: string }): SkeletonDef {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error('No skin found in the model');
  const joints = new Set(skin.listJoints());
  const parentJoint = (n: Node): Node | null => {
    const p = n.getParentNode();
    return p && joints.has(p) ? p : null;
  };
  const roots = [...joints].filter((j) => parentJoint(j) === null);
  if (roots.length !== 1) throw new Error(`Expected one root joint, found ${roots.length}`);

  const ordered: Node[] = [];
  const visit = (n: Node) => {
    ordered.push(n);
    for (const c of n.listChildren()) if (joints.has(c)) visit(c);
  };
  visit(roots[0]!);

  const bones: BoneDef[] = ordered.map((n) => {
    const parent = parentJoint(n);
    if (parent === null) {
      // Bake every non-joint ancestor (armature node, scene) into the root.
      const w = worldTRS(n);
      assertUnitScale(w.s, `Root joint "${n.getName()}" (world)`);
      return { name: n.getName(), parent: null, restLocalT: [w.t[0] * M_TO_CM, w.t[1] * M_TO_CM, w.t[2] * M_TO_CM], restLocalR: w.r };
    }
    assertUnitScale(n.getScale(), `Joint "${n.getName()}"`);
    const t = n.getTranslation();
    const r = n.getRotation();
    return {
      name: n.getName(),
      parent: parent.getName(),
      restLocalT: [t[0] * M_TO_CM, t[1] * M_TO_CM, t[2] * M_TO_CM],
      restLocalR: [r[0], r[1], r[2], r[3]],
    };
  });

  const names = new Set(bones.map((b) => b.name));
  const missing = REQUIRED_BONES.filter((b) => !names.has(b));
  if (missing.length) throw new Error(`Model is missing bones: ${missing.join(', ')}`);

  const extras = doc.getRoot().listScenes()[0]?.getExtras() as { statureM?: number; headTopM?: [number, number, number] } | undefined;
  if (!extras?.statureM || !extras.headTopM) throw new Error('Scene extras must include statureM and headTopM');

  const head = worldTRS(ordered.find((n) => n.getName() === 'head')!);
  const local = rotate(conjugate(head.r), sub(extras.headTopM, head.t));
  return {
    source,
    statureCm: extras.statureM * M_TO_CM,
    bones,
    headTopLocal: [local[0] * M_TO_CM, local[1] * M_TO_CM, local[2] * M_TO_CM],
  };
}
```

- [ ] **Step 6: Run to verify the extractor passes**

Run: `npx vitest run scripts/lib/extractSkeleton.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 7: Write the Blender-side files**

`assets-src/human/human.config.json`:
```json
{
  "macros": {
    "gender": 1.0,
    "age": 0.6,
    "muscle": 0.6,
    "weight": 0.55,
    "proportions": 0.6,
    "height": 0.6,
    "cupsize": 0.5,
    "firmness": 0.5,
    "race": { "asian": 0.333, "caucasian": 0.333, "african": 0.334 }
  },
  "assets": [
    ["eyes", "low-poly.mhclo", "Eyes"],
    ["eyebrows", "eyebrow001.mhclo", "Eyebrows"],
    ["eyelashes", "eyelashes01.mhclo", "Eyelashes"],
    ["hair", "short02.mhclo", "Hair"],
    ["clothes", "male_casualsuit04.mhclo", "Clothes"],
    ["clothes", "shoes06.mhclo", "Clothes"]
  ]
}
```

`assets-src/human/install_assets.py`:
```python
"""Extract the MakeHuman system asset pack into MPFB's user data folder.
Usage: Blender -b --python-exit-code 1 --python install_assets.py -- <makehuman_system_assets_cc0.zip>"""
import importlib
import sys
import zipfile


def dynamic_import(suffix, key):
    """MPFB is a Blender extension with an unknown package prefix; find it by suffix (from MPFB's script samples)."""
    for name in list(sys.modules):
        if name.endswith(suffix):
            return getattr(importlib.import_module(name), key)
    raise ValueError(f"No module ending in {suffix} - is the MPFB extension installed and enabled?")


LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
zip_path = sys.argv[sys.argv.index("--") + 1]
data_dir = LocationService.get_user_data()
with zipfile.ZipFile(zip_path) as z:
    z.extractall(data_dir)
print(f"Installed MakeHuman system assets into {data_dir}")
```

`assets-src/human/generate_human.py`:
```python
"""Generate the CC0 human used by the figure system.
Usage: Blender -b --python-exit-code 1 --python generate_human.py -- <config.json> <out.glb> <meta.json>
Called by scripts/build-human.ts; see docs/figure-pipeline.md."""
import importlib
import json
import sys

import bpy


def dynamic_import(suffix, key):
    """MPFB is a Blender extension with an unknown package prefix; find it by suffix (from MPFB's script samples)."""
    for name in list(sys.modules):
        if name.endswith(suffix):
            return getattr(importlib.import_module(name), key)
    raise ValueError(f"No module ending in {suffix} - is the MPFB extension installed and enabled?")


HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
ExportService = dynamic_import("mpfb.services.exportservice", "ExportService")
ObjectService = dynamic_import("mpfb.services.objectservice", "ObjectService")

config_path, out_glb, out_meta = sys.argv[sys.argv.index("--") + 1:][:3]
with open(config_path) as f:
    cfg = json.load(f)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

basemesh = HumanService.create_human(macro_detail_dict=cfg["macros"])
HumanService.add_builtin_rig(basemesh, "game_engine")
for subdir, fname, asset_type in cfg["assets"]:
    path = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if path is None:
        raise RuntimeError(f"{subdir}/{fname} not found - run scripts/setup-mpfb.sh first")
    HumanService.add_mhclo_asset(path, basemesh, asset_type=asset_type, subdiv_levels=0, material_type="GAMEENGINE")

# Bake masks and helpers into a copy so the original stays editable.
export_root = ExportService.create_character_copy(basemesh, name_suffix="_export")
export_body = ObjectService.find_object_of_type_amongst_nearest_relatives(export_root, "Basemesh")
ExportService.bake_modifiers_remove_helpers(export_body, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)

# Stable node names for the web layer.
clothes = 0
for obj in [export_root, *ObjectService.get_list_of_children(export_root)]:
    kind = ObjectService.get_object_type(obj)
    if kind == "Skeleton":
        obj.name = "Armature"
        continue
    if obj.type != "MESH":
        continue
    if kind == "Basemesh":
        name = "Body"
    elif kind == "Clothes":
        clothes += 1
        name = f"Clothes_{clothes}"
    else:
        name = kind
    obj.name = name
    obj.data.name = name

# Stature and skull top from the baked body, converted from Blender Z-up to glTF Y-up (x, z, -y).
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = export_body.evaluated_get(depsgraph)
mesh = evaluated.to_mesh()
points = [export_body.matrix_world @ v.co for v in mesh.vertices]
top = max(points, key=lambda p: p.z)
bottom = min(p.z for p in points)
evaluated.to_mesh_clear()
with open(out_meta, "w") as f:
    json.dump({"statureM": top.z - bottom, "headTopM": [top.x, top.z, -top.y]}, f)

bpy.ops.object.select_all(action="DESELECT")
export_root.select_set(True)
for child in ObjectService.get_list_of_children(export_root):
    child.select_set(True)
bpy.context.view_layer.objects.active = export_root
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_yup=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="WEBP",
)
print(f"Wrote {out_glb} and {out_meta}")
```

`scripts/setup-mpfb.sh`:
```bash
#!/usr/bin/env bash
# One-time local setup for regenerating the human model. Requires Blender >= 4.2.
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ZIP=".cache/makehuman_system_assets_cc0.zip"
"$BLENDER" -b --command extension install --sync --enable mpfb
mkdir -p .cache
[ -f "$ZIP" ] || curl -fL -o "$ZIP" https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
"$BLENDER" -b --python-exit-code 1 --python assets-src/human/install_assets.py -- "$ZIP"
```

`assets-src/human/LICENSE.md`:
```markdown
# Human model licence

`public/models/human.glb` is generated by `generate_human.py` with MPFB (MakeHuman plugin for Blender) from the
`makehuman_system_assets` pack. The MakeHuman base mesh, targets, rig and every asset used here (eyes, eyebrows,
eyelashes, hair `short02`, clothes `male_casualsuit04`, shoes `shoes06`) are released under **CC0 1.0**, and models
exported from MakeHuman/MPFB are CC0. The MPFB add-on itself is GPL-3.0; none of its code is included in this repository.
```

`assets-src/human/README.md`:
````markdown
# Human model source

Regenerate `public/models/human.glb` and `src/lib/figure/pose/skeleton.json`:

```bash
bash scripts/setup-mpfb.sh   # once per machine (downloads MPFB and the CC0 asset pack)
npm run build:human
```

Body shape and assets are set in `human.config.json`. Skin colour is applied at render time
(`SKIN_TONE` in `src/lib/figure/scene3d/human.ts`), so the model ships without skin textures.
See `docs/figure-pipeline.md` for conventions.
````

- [ ] **Step 8: Write the build script**

`scripts/build-human.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { extractSkeleton } from './lib/extractSkeleton';

const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const BUILD = 'assets-src/human/build';
const RAW = `${BUILD}/human.raw.glb`;
const META = `${BUILD}/human.meta.json`;
const OUT = 'public/models/human.glb';
const SKELETON = 'src/lib/figure/pose/skeleton.json';
const MAX_BYTES = 8 * 1024 * 1024;

mkdirSync(BUILD, { recursive: true });
mkdirSync('public/models', { recursive: true });
execFileSync(
  BLENDER,
  ['-b', '--python-exit-code', '1', '--python', 'assets-src/human/generate_human.py', '--', 'assets-src/human/human.config.json', RAW, META],
  { stdio: 'inherit' },
);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(RAW);
doc.getRoot().listScenes()[0]!.setExtras(JSON.parse(readFileSync(META, 'utf8')));
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(OUT, doc);

const bytes = statSync(OUT).size;
if (bytes > MAX_BYTES) throw new Error(`${OUT} is ${(bytes / 1e6).toFixed(1)} MB; the limit is 8 MB`);
const sha256 = createHash('sha256').update(readFileSync(OUT)).digest('hex');
const skeleton = extractSkeleton(await io.read(OUT), { file: OUT, sha256 });
writeFileSync(SKELETON, `${JSON.stringify(skeleton, null, 2)}\n`);
console.log(`Wrote ${OUT} (${(bytes / 1e6).toFixed(2)} MB): ${skeleton.bones.length} bones, stature ${skeleton.statureCm.toFixed(1)} cm`);
```

- [ ] **Step 9: Run the one-time setup and the build**

```bash
bash scripts/setup-mpfb.sh
npm run build:human
```
Expected: last line `Wrote public/models/human.glb (<8 MB): 53 bones, stature 1xx.x cm`.
If `generate_human.py` raises `not found`, re-run `bash scripts/setup-mpfb.sh`. If an export argument is rejected by Blender, check the names against Blender's bundled exporter: `grep -n "export_image_format\|export_skins" /Applications/Blender.app/Contents/Resources/*/scripts/addons_core/io_scene_gltf2/__init__.py`.

- [ ] **Step 10: Write the real-model test**

`tests/assets/human-model.test.ts`:
```ts
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { extractSkeleton } from '../../scripts/lib/extractSkeleton';
import skeletonJson from '../../src/lib/figure/pose/skeleton.json';
import { restPose, type SkeletonDef } from '../../src/lib/figure/pose/skeleton';
import { solveSmithSquat } from '../../src/lib/figure/pose/smithSquat';
import { validateSmithSquat } from '../../src/lib/figure/pose/validate';
import { ILLUSTRATIVE_SMITH } from '../../src/lib/figure/geometry/smith';
import { SMITH_SQUAT } from '../../src/lib/figure/fixtures/smith-squat';

const MODEL = 'public/models/human.glb';
const skeleton = skeletonJson as unknown as SkeletonDef;

describe('committed human model', () => {
  it('fits the 8 MB budget', () => {
    expect(statSync(MODEL).size).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
  it('matches skeleton.json', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const sha256 = createHash('sha256').update(readFileSync(MODEL)).digest('hex');
    expect(skeleton.source.sha256).toBe(sha256);
    // JSON round-trip matches how build-human writes skeleton.json (e.g. -0 becomes 0).
    const extracted = JSON.parse(JSON.stringify(extractSkeleton(await io.read(MODEL), { file: MODEL, sha256 })));
    expect(extracted).toEqual(skeleton);
  });
  it('uses glTF axes: left = +X, facing +Z, up +Y', () => {
    const w = restPose(skeleton, 1);
    expect(w.thigh_l!.position[0]).toBeGreaterThan(0);
    expect(w.ball_l!.position[2]).toBeGreaterThan(w.foot_l!.position[2]);
    expect(w.head!.position[1]).toBeGreaterThan(w.pelvis!.position[1]);
  });
  it('has an adult stature', () => {
    expect(skeleton.statureCm).toBeGreaterThan(160);
    expect(skeleton.statureCm).toBeLessThan(195);
  });
  it.each([150, 165, 175, 190, 200])('Smith squat frames are valid on the real rig at %i cm', (statureCm) => {
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(skeleton, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      expect(validateSmithSquat(skeleton, sol, { smith: ILLUSTRATIVE_SMITH }), `${statureCm} cm / ${frame.id}`).toEqual([]);
    }
  });
});
```

- [ ] **Step 11: Run and tune**

Run: `npx vitest run tests/assets`
Expected: PASS. If the real-rig sweep reports findings, tune `src/lib/figure/fixtures/smith-squat.ts` and re-run (then re-run `npx vitest run src/lib/figure` so the synthetic sweep stays green too):
- `rom` elbow: increase `grip.halfWidthCm` in 2 cm steps.
- `anchor` hand: move `grip.wristOffsetCm` 1–2 cm toward the shoulder (less negative Z).
- `bar-on-rail`/no trunk angle: reduce `stance.forwardOfRailCm` by 2 cm.
- `rom` hip/knee at the bottom: raise `frames[1].thighDeg` toward −75.

- [ ] **Step 12: Commit, open the PR, merge when CI is green**

```bash
git add assets-src scripts src/lib/figure/pose/skeleton.json public/models/human.glb tests/assets package.json package-lock.json src/lib/figure/fixtures
git commit -m $'feat(figures): generate CC0 human model with MPFB and extract its skeleton\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Human model pipeline (MakeHuman → glTF)" \
  --body $'human.glb (≤ 8 MB) and skeleton.json are committed and the real-rig sweep passes in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** `human.glb` (≤ 8 MB) and `skeleton.json` are committed and the real-rig sweep passes in CI.

---

### Task 12: 3D scene — stage, equipment, human

**Files:**
- Create: `src/lib/figure/scene3d/stage.ts`, `src/lib/figure/scene3d/equipment.ts`, `src/lib/figure/scene3d/human.ts`, `src/lib/figure/scene3d/figureScene.ts`, `src/lib/figure/arrow.ts`, `src/lib/figure/overlay.ts`, `src/lib/figure/overlay.test.ts`

**Interfaces:**
- Consumes: geometry, solver, skeleton JSON, fixtures.
- Produces:
  - `stage.ts`: `interface Stage { renderer; scene; camera; width; height }`, `interface OrbitView { azimuthDeg; elevationDeg; distanceCm; targetCm: Vec3 }`, `createStage(canvas, width, height, pixelRatio?)`, `setOrbitView(stage, v)`, `renderStage(stage)`, `projectCm(stage, p): [number, number]`, `disposeStage(stage)`.
  - `equipment.ts`: `buildEquipment(prims): THREE.Group`, `setBarHeight(group, barHeightCm)`.
  - `human.ts`: `SKIN_TONE`, `interface HumanRig { root; bones; rootBone }`, `interface RigPose { local; rootPosition }`, `loadHuman(url)`, `applyPose(rig, pose, scaleFactor)`.
  - `figureScene.ts`: `DEFAULT_STATURE_CM = 175`, `SKELETON`, `interface FigureScene { stage; view; showFrame(i); showBetween(a, b, t); arrow(i); render(); dispose() }`, `mountFigure(canvas, { width, height, modelUrl, spec, statureCm?, pixelRatio? }): Promise<FigureScene>`.
  - `arrow.ts` (pure): `type Point2`, `arrowPaths(from, to, headLength?) → { line; head }`, `arrowSvg(width, height, from, to, color?) → string`.
  - `overlay.ts` (pure): `interface ArrowSpec { from: Vec3; to: Vec3 }`, `barArrow(direction, barCenter, smith): ArrowSpec | null`.

- [ ] **Step 1: Install three**

```bash
git checkout -b m1/<issue>-scene3d
npm install --save-exact three@0.186.1 && npm install --save-exact --save-dev @types/three@0.186.0
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

`src/lib/figure/overlay.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_SMITH } from './geometry/smith';
import { arrowPaths, arrowSvg } from './arrow';
import { barArrow } from './overlay';

describe('barArrow', () => {
  it('returns null without a direction', () => {
    expect(barArrow(undefined, [0, 120, 0], ILLUSTRATIVE_SMITH)).toBeNull();
  });
  it('points down for "down", outside the plates', () => {
    const a = barArrow('down', [0, 120, 0], ILLUSTRATIVE_SMITH)!;
    expect(a.to[1]).toBeLessThan(a.from[1]);
    expect(a.from[0]).toBeGreaterThan(ILLUSTRATIVE_SMITH.railHalfSpacingCm + ILLUSTRATIVE_SMITH.sleeveLengthCm);
  });
  it('points up for "up"', () => {
    const a = barArrow('up', [0, 120, 0], ILLUSTRATIVE_SMITH)!;
    expect(a.to[1]).toBeGreaterThan(a.from[1]);
  });
});

describe('arrowPaths', () => {
  it('stops the line at the head base and puts the tip on the target', () => {
    const p = arrowPaths([10, 10], [10, 110], 18);
    expect(p.line).toBe('M10.0 10.0 L10.0 92.0');
    expect(p.head).toBe('M10.0 110.0 L0.1 92.0 L19.9 92.0 Z');
  });
  it('rejects zero-length arrows', () => {
    expect(() => arrowPaths([5, 5], [5, 5])).toThrow(/zero-length/);
  });
  it('wraps the paths in a sized SVG', () => {
    expect(arrowSvg(900, 1200, [10, 10], [10, 110])).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="900" height="1200">/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/figure/overlay.test.ts` — Expected: FAIL (cannot resolve `./arrow`).

- [ ] **Step 4: Implement `arrow.ts` and `overlay.ts`**

`src/lib/figure/arrow.ts`:
```ts
export type Point2 = readonly [number, number];

/** SVG path data for an arrow from `from` to `to` (pixels): a shaft and a filled triangular head. */
export function arrowPaths(from: Point2, to: Point2, headLength = 18): { line: string; head: string } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('arrowPaths: zero-length arrow');
  const ux = dx / len;
  const uy = dy / len;
  const bx = to[0] - ux * headLength;
  const by = to[1] - uy * headLength;
  const w = headLength * 0.55;
  const f = (n: number) => n.toFixed(1);
  return {
    line: `M${f(from[0])} ${f(from[1])} L${f(bx)} ${f(by)}`,
    head: `M${f(to[0])} ${f(to[1])} L${f(bx - uy * w)} ${f(by + ux * w)} L${f(bx + uy * w)} ${f(by - ux * w)} Z`,
  };
}

/** Standalone SVG (used to composite arrows onto pre-rendered frames). */
export function arrowSvg(width: number, height: number, from: Point2, to: Point2, color = '#1f6feb'): string {
  const p = arrowPaths(from, to);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<path d="${p.line}" stroke="${color}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="${p.head}" fill="${color}"/></svg>`
  );
}
```

`src/lib/figure/overlay.ts`:
```ts
import type { Vec3 } from './math/vec3';
import type { SmithParams } from './geometry/smith';

export interface ArrowSpec {
  from: Vec3;
  to: Vec3;
}

/** Vertical arrow beside the left bar sleeve showing the bar's direction of travel (cm, world). */
export function barArrow(direction: 'up' | 'down' | undefined, barCenter: Vec3, smith: SmithParams): ArrowSpec | null {
  if (!direction) return null;
  const x = smith.railHalfSpacingCm + smith.sleeveLengthCm + 12;
  const [y0, y1] = direction === 'down' ? [barCenter[1] + 18, barCenter[1] - 18] : [barCenter[1] - 18, barCenter[1] + 18];
  return { from: [x, y0, barCenter[2]], to: [x, y1, barCenter[2]] };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/figure/overlay.test.ts` — Expected: PASS (6 tests).

- [ ] **Step 6: Implement `stage.ts`**

```ts
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Vec3 } from '../math/vec3';

const CM = 0.01;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
}

export interface OrbitView {
  /** Degrees from the figure's front (+Z) toward its left (+X). */
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

export function createStage(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio = 1): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated since r186

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3f2ee');
  // Image-based lighting so metal (rails, bar) and skin read correctly.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9b4a8', 0.9));

  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1.8, 3.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 2.6, bottom: -0.2, near: 0.5, far: 8 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#dfe7ff', 0.8);
  rim.position.set(-2.5, 2.2, -2);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
  return { renderer, scene, camera, width, height };
}

export function setOrbitView(stage: Stage, v: OrbitView): void {
  const az = THREE.MathUtils.degToRad(v.azimuthDeg);
  const el = THREE.MathUtils.degToRad(v.elevationDeg);
  const d = v.distanceCm * CM;
  const t = new THREE.Vector3(v.targetCm[0] * CM, v.targetCm[1] * CM, v.targetCm[2] * CM);
  stage.camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
  stage.camera.lookAt(t);
  stage.camera.updateMatrixWorld();
}

export function renderStage(stage: Stage): void {
  stage.renderer.render(stage.scene, stage.camera);
}

/** Project a world point (cm) to canvas CSS pixels, origin top-left. */
export function projectCm(stage: Stage, p: Vec3): [number, number] {
  const v = new THREE.Vector3(p[0] * CM, p[1] * CM, p[2] * CM).project(stage.camera);
  return [((v.x + 1) / 2) * stage.width, ((1 - v.y) / 2) * stage.height];
}

export function disposeStage(stage: Stage): void {
  stage.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
  stage.renderer.dispose();
}
```

- [ ] **Step 7: Implement `equipment.ts`**

```ts
import * as THREE from 'three';
import type { Primitive, SurfaceKind } from '../geometry/primitives';

const CM = 0.01;

const SURFACES: Record<SurfaceKind, THREE.MeshStandardMaterialParameters> = {
  frame: { color: '#2b2d31', roughness: 0.55, metalness: 0.35 },
  chrome: { color: '#d7dade', roughness: 0.18, metalness: 0.9 },
  plate: { color: '#34363b', roughness: 0.8 },
  stop: { color: '#c0392b', roughness: 0.6 },
  catch: { color: '#e0a13a', roughness: 0.6 },
  carriage: { color: '#55585e', roughness: 0.5, metalness: 0.4 },
};

/** Parts that travel with the bar; all are built centred at the bar height. */
const MOVING = /^(bar$|plate-|carriage-)/;

export function buildEquipment(prims: readonly Primitive[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'equipment';
  const materials = new Map<SurfaceKind, THREE.Material>();
  const material = (k: SurfaceKind) => {
    let m = materials.get(k);
    if (!m) materials.set(k, (m = new THREE.MeshStandardMaterial(SURFACES[k])));
    return m;
  };
  for (const p of prims) {
    let mesh: THREE.Mesh;
    if (p.kind === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0] * CM, p.size[1] * CM, p.size[2] * CM), material(p.surface));
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
    } else {
      const a = new THREE.Vector3(...p.start).multiplyScalar(CM);
      const b = new THREE.Vector3(...p.end).multiplyScalar(CM);
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * CM, p.radius * CM, a.distanceTo(b), 32), material(p.surface));
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    mesh.name = p.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Move the bar, plates and carriages to a new bar height without rebuilding. */
export function setBarHeight(group: THREE.Group, barHeightCm: number): void {
  for (const child of group.children) if (MOVING.test(child.name)) child.position.y = barHeightCm * CM;
}
```

- [ ] **Step 8: Implement `human.ts`**

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Quat } from '../math/quat';
import type { Vec3 } from '../math/vec3';

/** Neutral skin tone applied at render time; the model ships without skin textures. */
export const SKIN_TONE = '#c8957a';

export interface HumanRig {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  rootBone: THREE.Bone;
}

/** A pose-layer result: full local rotations plus the root bone's world position (cm). */
export interface RigPose {
  local: Readonly<Record<string, Quat>>;
  rootPosition: Vec3;
}

export async function loadHuman(url: string): Promise<HumanRig> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const bones = new Map<string, THREE.Bone>();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONE, roughness: 0.6 });
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name, o);
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds do not follow the pose
      if (o.name.startsWith('Body')) o.material = skin;
    }
  });
  const rootBone = bones.get('Root');
  if (!rootBone) throw new Error('Human model has no "Root" bone');
  return { root: gltf.scene, bones, rootBone };
}

/** Apply a pose (cm at the target stature). `scaleFactor` = target stature / native stature. */
export function applyPose(rig: HumanRig, pose: RigPose, scaleFactor: number): void {
  rig.root.scale.setScalar(scaleFactor);
  for (const [name, q] of Object.entries(pose.local)) {
    const bone = rig.bones.get(name);
    if (bone && bone !== rig.rootBone) bone.quaternion.set(q[0], q[1], q[2], q[3]);
  }
  // The pose layer gives the root's WORLD transform; convert it through the real parent chain.
  const q = pose.local[rig.rootBone.name] ?? [0, 0, 0, 1];
  const desired = new THREE.Matrix4().compose(
    new THREE.Vector3(pose.rootPosition[0] / 100, pose.rootPosition[1] / 100, pose.rootPosition[2] / 100),
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
  );
  const parent = rig.rootBone.parent;
  if (!parent) throw new Error('Root bone has no parent');
  parent.updateWorldMatrix(true, false);
  new THREE.Matrix4()
    .copy(parent.matrixWorld)
    .invert()
    .multiply(desired)
    .decompose(rig.rootBone.position, rig.rootBone.quaternion, rig.rootBone.scale);
  rig.root.updateMatrixWorld(true);
}
```

- [ ] **Step 9: Implement `figureScene.ts`**

```ts
import skeletonJson from '../pose/skeleton.json';
import type { SkeletonDef } from '../pose/skeleton';
import { solveSmithSquat, type SmithSquatFrame, type SmithSquatSolution, type SmithSquatSpec } from '../pose/smithSquat';
import { buildSmith, ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { barArrow } from '../overlay';
import { buildEquipment, setBarHeight } from './equipment';
import { applyPose, loadHuman } from './human';
import { createStage, disposeStage, type OrbitView, projectCm, renderStage, setOrbitView, type Stage } from './stage';

export const DEFAULT_STATURE_CM = 175;
export const SKELETON = skeletonJson as unknown as SkeletonDef;

export interface FigureScene {
  stage: Stage;
  view: OrbitView;
  showFrame(index: number): SmithSquatSolution;
  /** Solve and show an in-between pose (t in 0..1); constraints hold at every step. */
  showBetween(from: number, to: number, t: number): SmithSquatSolution;
  /** The frame's movement arrow projected to canvas pixels, if it has one. */
  arrow(index: number): { from: [number, number]; to: [number, number] } | null;
  render(): void;
  dispose(): void;
}

export async function mountFigure(
  canvas: HTMLCanvasElement,
  opts: { width: number; height: number; modelUrl: string; spec: SmithSquatSpec; statureCm?: number; pixelRatio?: number },
): Promise<FigureScene> {
  const { spec } = opts;
  const statureCm = opts.statureCm ?? DEFAULT_STATURE_CM;
  const smith = ILLUSTRATIVE_SMITH;
  const solve = (frame: SmithSquatFrame) => solveSmithSquat(SKELETON, spec, frame, { statureCm, railZCm: smith.railZCm });
  const keyframes = spec.frames.map(solve);
  const lowestBar = Math.min(...keyframes.map((f) => f.barCenter[1]));
  const k = statureCm / DEFAULT_STATURE_CM;
  const view: OrbitView = {
    azimuthDeg: spec.camera.azimuthDeg,
    elevationDeg: spec.camera.elevationDeg,
    distanceCm: spec.camera.distanceCm * k,
    targetCm: [0, spec.camera.targetYCm * k, smith.railZCm],
  };

  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  setOrbitView(stage, view);
  const equipment = buildEquipment(buildSmith(smith, { barHeightCm: keyframes[0]!.barCenter[1], catchHeightCm: lowestBar - 8 }));
  stage.scene.add(equipment);
  const rig = await loadHuman(opts.modelUrl);
  stage.scene.add(rig.root);

  const show = (sol: SmithSquatSolution) => {
    applyPose(rig, { local: sol.local, rootPosition: sol.rootPosition }, sol.scaleFactor);
    setBarHeight(equipment, sol.barCenter[1]);
    return sol;
  };

  return {
    stage,
    view,
    showFrame: (i) => show(keyframes[i]!),
    showBetween: (a, b, t) => {
      const fa = spec.frames[a]!;
      const fb = spec.frames[b]!;
      return show(
        solve({
          ...fa,
          id: `${fa.id}>${fb.id}`,
          shankDeg: fa.shankDeg + (fb.shankDeg - fa.shankDeg) * t,
          thighDeg: fa.thighDeg + (fb.thighDeg - fa.thighDeg) * t,
        }),
      );
    },
    arrow: (i) => {
      const a = barArrow(spec.frames[i]?.arrow, keyframes[i]!.barCenter, smith);
      return a ? { from: projectCm(stage, a.from), to: projectCm(stage, a.to) } : null;
    },
    render: () => renderStage(stage),
    dispose: () => disposeStage(stage),
  };
}
```

- [ ] **Step 10: Verify types and tests**

Run: `npm run check && npm run lint && npm test`
Expected: `0 errors`, lint clean, all unit tests pass. (Rendering is exercised in Tasks 13–14.)

- [ ] **Step 11: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add three.js stage, equipment, human rig and figure scene\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "3D scene: stage, equipment, human" \
  --body $'the scene modules type-check and the arrow/overlay tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** the scene modules type-check and the arrow/overlay tests pass in CI.

---

### Task 13: Figure pre-render pipeline

**Files:**
- Create: `src/pages/render/figure.astro`, `scripts/lib/imageCheck.ts`, `scripts/lib/imageCheck.test.ts`, `scripts/render-figures.ts`
- Modify: `package.json` (script `render:figures`), `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `mountFigure`, `FIGURES`, `arrowSvg`, `withBase`.
- Produces: `distinctColors(png: Buffer, step?): Promise<number>`; harness globals `window.__figureList: {id; frames}[]` and `window.__figureReady: { arrow: {from; to} | null; width; height }`; outputs `public/figures/<id>/frame-<n>.webp`.

- [ ] **Step 1: Write the failing image-check test**

`scripts/lib/imageCheck.test.ts`:
```ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { distinctColors } from './imageCheck';

describe('distinctColors', () => {
  it('finds one colour in a blank image', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#f3f2ee' } }).png().toBuffer();
    expect(await distinctColors(png)).toBe(1);
  });
  it('finds many colours in a gradient', async () => {
    const raw = Buffer.alloc(256 * 64 * 3);
    for (let x = 0; x < 256; x++) for (let y = 0; y < 64; y++) raw.writeUInt8(x, (y * 256 + x) * 3);
    const png = await sharp(raw, { raw: { width: 256, height: 64, channels: 3 } }).png().toBuffer();
    expect(await distinctColors(png, 1)).toBeGreaterThan(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/lib/imageCheck.test.ts` — Expected: FAIL (cannot resolve `./imageCheck`).

- [ ] **Step 3: Implement `scripts/lib/imageCheck.ts`**

```ts
import sharp from 'sharp';

/** Distinct RGB colours on a sparse grid; a blank or failed WebGL render has only a handful. */
export async function distinctColors(png: Buffer, step = 7): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const seen = new Set<number>();
  for (let i = 0; i + 2 < data.length; i += info.channels * step) seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  return seen.size;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run scripts/lib/imageCheck.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 5: Write the render harness page**

`src/pages/render/figure.astro`:
```astro
---
import { withBase } from '../../lib/site';
const modelUrl = withBase('models/human.glb');
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Figure render harness</title>
    <style>html, body { margin: 0; background: #f3f2ee; } canvas { display: block; }</style>
  </head>
  <body>
    <canvas id="figure-canvas" data-model-url={modelUrl}></canvas>
    <script>
      import { mountFigure } from '../../lib/figure/scene3d/figureScene';
      import { FIGURES } from '../../lib/figure/fixtures';

      const W = 900;
      const H = 1200;
      const g = window as unknown as Record<string, unknown>;

      async function main() {
        const params = new URLSearchParams(location.search);
        if (params.has('list')) {
          g.__figureList = Object.values(FIGURES).map((f) => ({ id: f.id, frames: f.frames.length }));
          return;
        }
        const spec = FIGURES[params.get('figure') ?? ''];
        if (!spec) throw new Error(`Unknown figure: ${params.get('figure')}`);
        const frame = Number(params.get('frame') ?? '0');
        const canvas = document.getElementById('figure-canvas') as HTMLCanvasElement;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        const scene = await mountFigure(canvas, { width: W, height: H, modelUrl: canvas.dataset.modelUrl!, spec });
        scene.showFrame(frame);
        scene.render();
        g.__figureReady = { arrow: scene.arrow(frame), width: W, height: H };
      }
      main().catch((err) => {
        g.__figureError = String(err);
        throw err;
      });
    </script>
  </body>
</html>
```

- [ ] **Step 6: Write the render script**

`scripts/render-figures.ts`:
```ts
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { arrowSvg } from '../src/lib/figure/arrow';
import { distinctColors } from './lib/imageCheck';

type Arrow = { from: [number, number]; to: [number, number] } | null;
type Ready = { arrow: Arrow; width: number; height: number };
type Win = { __figureList?: Array<{ id: string; frames: number }>; __figureReady?: Ready; __figureError?: string };

const PORT = 4329;
const HARNESS = `http://localhost:${PORT}/ai_health/render/figure/`;
const OUT = 'public/figures';
const MIN_COLORS = 200;

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start: ${url}`);
}

// --ignore-lock keeps Astro 7 in the foreground even when it detects an AI agent, so kill() really stops it.
const server = spawn('node_modules/.bin/astro', ['dev', '--port', String(PORT), '--ignore-lock'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
try {
  await waitForServer(`${HARNESS}?list=1`);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${HARNESS}?list=1`);
  const list = await (await page.waitForFunction(() => (window as unknown as Win).__figureList)).jsonValue();

  for (const fig of list!) {
    await mkdir(`${OUT}/${fig.id}`, { recursive: true });
    for (let frame = 0; frame < fig.frames; frame++) {
      await page.goto(`${HARNESS}?figure=${fig.id}&frame=${frame}`);
      const handle = await page.waitForFunction(
        () => (window as unknown as Win).__figureReady ?? (window as unknown as Win).__figureError,
        null,
        { timeout: 120_000 },
      );
      const ready = (await handle.jsonValue()) as Ready | string;
      if (typeof ready === 'string') throw new Error(`${fig.id} frame ${frame}: ${ready}`);
      const png = await page.locator('canvas#figure-canvas').screenshot();
      const colors = await distinctColors(png);
      if (colors < MIN_COLORS) throw new Error(`${fig.id} frame ${frame} looks blank (${colors} colours)`);
      const layers = ready.arrow ? [{ input: Buffer.from(arrowSvg(ready.width, ready.height, ready.arrow.from, ready.arrow.to)) }] : [];
      await sharp(png).composite(layers).webp({ quality: 88 }).toFile(`${OUT}/${fig.id}/frame-${frame}.webp`);
      console.log(`rendered ${fig.id} frame ${frame} (${colors} colours)`);
    }
  }
  await browser.close();
  if (errors.length) throw new Error(`Page errors while rendering:\n${errors.join('\n')}`);
} finally {
  server.kill();
}
```

- [ ] **Step 7: Add the script and run it**

```bash
npm pkg set scripts.render:figures="tsx scripts/render-figures.ts"
npm run render:figures
ls -la public/figures/smith-squat/
```
Expected: three lines `rendered smith-squat frame N (… colours)` and `frame-0.webp`, `frame-1.webp`, `frame-2.webp`. Open them (e.g. `open public/figures/smith-squat/frame-1.webp`) and check: figure visible and grounded, bar on the upper back, hands on the bar, feet flat, arrow beside the bar in frames 1 and 3. If the figure is cropped, adjust `SMITH_SQUAT.camera.distanceCm`/`targetYCm` and re-run.

- [ ] **Step 8: Render in CI before e2e, and in deploy before build**

In `.github/workflows/ci.yml`, move `npx playwright install --with-deps chromium` before `npm run build` and add `- run: npm run render:figures` right after it. The job steps become:
```yaml
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run render:figures
      - run: npm run build
      - run: npm run test:e2e
```
In `.github/workflows/deploy.yml`, replace `- run: npm run build` with:
```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run render:figures
      - run: npm run build
```

- [ ] **Step 9: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): pre-render figure frames with headless Chromium\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure pre-render pipeline" \
  --body $'CI renders three non-blank Smith squat frames and deploy publishes them.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```
This PR's CI run is the proof that rendering works on Linux with software WebGL.

Caching renders by content hash (spec §8.4) is deferred to M3, when there are many figures; three frames render in under a minute.

**Done when:** CI renders three non-blank Smith squat frames and deploy publishes them.

---

### Task 14: Figure spike page and viewer

**Files:**
- Create: `src/components/figure/figure.css`, `src/components/figure/FigureViewer.tsx`, `src/components/figure/FigureFrames.astro`, `src/components/figure/SpikeChecks.astro`, `src/pages/[lang]/dev/figure-spike.astro`, `tests/e2e/figure-spike.spec.ts`, `tests/e2e/figure-fallback.spec.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts` (new keys)

**Interfaces:**
- Consumes: `mountFigure`, `FigureScene`, `arrowPaths`, `SMITH_SQUAT`, `solveSmithSquat`, `validateSmithSquat`, `jointAngles`, `ILLUSTRATIVE_SMITH`, `withBase`, i18n.
- Produces: page `/<lang>/dev/figure-spike/` (noindex, not linked from nav); `FigureViewer` props `{ lang; modelUrl; spec; fallbackImages }`, root element `data-figure-status="loading|ready|unavailable"`, canvas class `figure-canvas`.

- [ ] **Step 1: Add the i18n keys**

Add to `en` in `src/lib/i18n/en.ts` (before `} as const`):
```ts
  'figure.play': 'Play',
  'figure.pause': 'Pause',
  'figure.resetView': 'Reset view',
  'figure.loading': 'Loading the 3D model…',
  'figure.noWebgl': '3D view is not available on this device; showing still images.',
  'figure.illustrative': 'Illustrative dimensions',
  'figure.dragHint': 'Drag to rotate',
  'spike.title': '3D figure preview: Smith machine squat',
  'spike.intro': 'An early preview of the 3D exercise figures. Machine dimensions are illustrative, not measurements of any specific machine.',
  'spike.viewer': 'Interactive view',
  'spike.frames': 'Printable frames',
  'spike.checks': 'Automated checks',
  'spike.check.stature': 'Height',
  'spike.check.frame': 'Step',
  'spike.check.angles': 'Joint angles',
  'spike.check.result': 'Result',
  'spike.check.pass': 'All checks pass',
  'spike.check.fail': 'Failed',
  'angle.trunk': 'trunk',
  'angle.hip': 'hip',
  'angle.knee': 'knee',
  'angle.elbow': 'elbow',
```
Add to `zh` in `src/lib/i18n/zh.ts`:
```ts
  'figure.play': '播放',
  'figure.pause': '暂停',
  'figure.resetView': '重置视角',
  'figure.loading': '正在加载 3D 模型…',
  'figure.noWebgl': '此设备无法显示 3D 视图，改为显示静态图片。',
  'figure.illustrative': '示意尺寸',
  'figure.dragHint': '拖动可旋转',
  'spike.title': '3D 人物预览：史密斯机深蹲',
  'spike.intro': '3D 动作图的早期预览。器械尺寸仅为示意，并非任何具体器械的实测数据。',
  'spike.viewer': '交互视图',
  'spike.frames': '可打印分解图',
  'spike.checks': '自动检查',
  'spike.check.stature': '身高',
  'spike.check.frame': '步骤',
  'spike.check.angles': '关节角度',
  'spike.check.result': '结果',
  'spike.check.pass': '全部通过',
  'spike.check.fail': '未通过',
  'angle.trunk': '躯干',
  'angle.hip': '髋',
  'angle.knee': '膝',
  'angle.elbow': '肘',
```
Run: `npx vitest run src/lib/i18n` — Expected: PASS (parity and CJK checks cover the new keys).

- [ ] **Step 2: Write the e2e test (fails until the page exists)**

`tests/e2e/figure-spike.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

for (const lang of ['en', 'zh']) {
  test(`/${lang}/dev/figure-spike/ renders the 3D viewer, frames and passing checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
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
```

`tests/e2e/figure-fallback.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx playwright test tests/e2e/figure-spike.spec.ts tests/e2e/figure-fallback.spec.ts`
Expected: FAIL (404 for `/ai_health/en/dev/figure-spike/`).

- [ ] **Step 4: Write the styles**

`src/components/figure/figure.css`:
```css
.figure-viewer { max-width: 640px; }
.figure-stage { position: relative; }
.figure-canvas { display: block; width: 100%; aspect-ratio: 3 / 4; border-radius: var(--radius); background: #f3f2ee; touch-action: none; }
.figure-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.figure-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
.figure-controls button { font: inherit; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.figure-controls button[aria-pressed='true'] { border-color: var(--accent); background: var(--accent); color: var(--accent-contrast); }
.figure-controls button:disabled { opacity: 0.5; cursor: default; }
.figure-note { font-size: 0.875rem; color: var(--muted); margin: 4px 0 0; }
.figure-frames, .figure-fallback-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; list-style: none; padding: 0; margin: 16px 0; }
.figure-frames figure, .figure-fallback-grid figure { margin: 0; }
.figure-frames img, .figure-fallback-grid img { width: 100%; height: auto; border-radius: var(--radius); background: #f3f2ee; }
.figure-frames figcaption { display: flex; flex-direction: column; margin-top: 6px; }
.figure-frames figcaption span { color: var(--muted); font-size: 0.9rem; }
.spike-checks { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.spike-checks th, .spike-checks td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.spike-checks .pass { color: var(--accent); }
.spike-checks .fail { color: #c0392b; font-weight: 600; }
@media (max-width: 480px) { .spike-checks { font-size: 0.8rem; } }
```

- [ ] **Step 5: Write the viewer island**

`src/components/figure/FigureViewer.tsx`:
```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { arrowPaths } from '../../lib/figure/arrow';
import type { SmithSquatSpec } from '../../lib/figure/pose/smithSquat';
import type { FigureScene } from '../../lib/figure/scene3d/figureScene';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props {
  lang: Locale;
  modelUrl: string;
  spec: SmithSquatSpec;
  fallbackImages: string[];
}

type Status = 'loading' | 'ready' | 'unavailable';
type Arrow = ReturnType<FigureScene['arrow']>;

const PLAY_ORDER = [0, 1, 2, 0];
const SEGMENT_MS = 1200;

export default function FigureViewer({ lang, modelUrl, spec, fallbackImages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>('loading');
  const [size, setSize] = useState<[number, number]>([600, 800]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [arrow, setArrow] = useState<Arrow>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      try {
        const canvas = canvasRef.current!;
        const width = canvas.clientWidth || 600;
        const height = Math.round((width * 4) / 3);
        const [{ mountFigure }, { OrbitControls }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        const scene = await mountFigure(canvas, { width, height, modelUrl, spec, pixelRatio: Math.min(window.devicePixelRatio, 2) });
        if (cancelled) {
          scene.dispose();
          return;
        }
        const controls = new OrbitControls(scene.stage.camera, canvas);
        const [tx, ty, tz] = scene.view.targetCm;
        controls.target.set(tx / 100, ty / 100, tz / 100);
        controls.enablePan = false;
        controls.minDistance = 1.5;
        controls.maxDistance = 9;
        controls.update();
        controls.saveState();
        controls.addEventListener('change', () => {
          scene.render();
          setArrow(null);
        });
        resetRef.current = () => {
          controls.reset();
          scene.render();
        };
        sceneRef.current = scene;
        cleanup = () => {
          controls.dispose();
          scene.dispose();
        };
        setSize([width, height]);
        setStatus('ready');
      } catch (err) {
        console.warn('3D figure unavailable:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (status !== 'ready' || !scene || playing) return;
    scene.showFrame(frame);
    scene.render();
    setArrow(scene.arrow(frame));
  }, [status, frame, playing]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!playing || !scene) return;
    setArrow(null);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const total = (now - start) / SEGMENT_MS;
      const seg = Math.floor(total) % (PLAY_ORDER.length - 1);
      const eased = 0.5 - Math.cos(Math.PI * (total - Math.floor(total))) / 2;
      scene.showBetween(PLAY_ORDER[seg]!, PLAY_ORDER[seg + 1]!, eased);
      scene.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const labels = spec.frames.map((f) => f.label[lang]);
  const paths = arrow ? arrowPaths(arrow.from, arrow.to) : null;

  if (status === 'unavailable') {
    return (
      <div class="figure-viewer" data-figure-status={status}>
        <p role="status">{t(lang, 'figure.noWebgl')}</p>
        <div class="figure-fallback-grid">
          {fallbackImages.map((src, i) => (
            <figure>
              <img src={src} alt={`${spec.name[lang]} — ${labels[i]}`} width={900} height={1200} loading="lazy" />
              <figcaption>{labels[i]}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="figure-viewer" data-figure-status={status}>
      <div class="figure-stage">
        <canvas ref={canvasRef} class="figure-canvas" aria-label={`${spec.name[lang]} — ${labels[frame]}`} />
        {paths && (
          <svg class="figure-overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            <path d={paths.line} stroke="#1f6feb" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d={paths.head} fill="#1f6feb" />
          </svg>
        )}
      </div>
      <div class="figure-controls" role="group" aria-label={spec.name[lang]}>
        {labels.map((label, i) => (
          <button
            type="button"
            aria-pressed={!playing && frame === i}
            disabled={status !== 'ready'}
            onClick={() => {
              setPlaying(false);
              setFrame(i);
            }}
          >
            {`${i + 1}. ${label}`}
          </button>
        ))}
        <button type="button" disabled={status !== 'ready'} onClick={() => setPlaying((p) => !p)}>
          {playing ? t(lang, 'figure.pause') : t(lang, 'figure.play')}
        </button>
        <button type="button" disabled={status !== 'ready'} onClick={() => resetRef.current()}>
          {t(lang, 'figure.resetView')}
        </button>
      </div>
      {status === 'loading' && <p role="status">{t(lang, 'figure.loading')}</p>}
      <p class="figure-note">
        {t(lang, 'figure.dragHint')} · {t(lang, 'figure.illustrative')}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Write the static frames and checks components**

`src/components/figure/FigureFrames.astro`:
```astro
---
import type { SmithSquatSpec } from '../../lib/figure/pose/smithSquat';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props { lang: Locale; spec: SmithSquatSpec; images: string[] }
const { lang, spec, images } = Astro.props;
---
<ol class="figure-frames">
  {spec.frames.map((f, i) => (
    <li>
      <figure>
        <img src={images[i]} alt={`${spec.name[lang]} — ${f.label[lang]}`} width="900" height="1200" loading="lazy" decoding="async" />
        <figcaption><strong>{i + 1}. {f.label[lang]}</strong><span>{f.cue[lang]}</span></figcaption>
      </figure>
    </li>
  ))}
</ol>
```

`src/components/figure/SpikeChecks.astro`:
```astro
---
import skeletonJson from '../../lib/figure/pose/skeleton.json';
import type { SkeletonDef } from '../../lib/figure/pose/skeleton';
import { solveSmithSquat } from '../../lib/figure/pose/smithSquat';
import { jointAngles, validateSmithSquat } from '../../lib/figure/pose/validate';
import { ILLUSTRATIVE_SMITH } from '../../lib/figure/geometry/smith';
import { SMITH_SQUAT } from '../../lib/figure/fixtures/smith-squat';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props { lang: Locale }
const { lang } = Astro.props;
const sk = skeletonJson as unknown as SkeletonDef;
const STATURES = [150, 165, 175, 190, 200];
const rows = STATURES.flatMap((statureCm) =>
  SMITH_SQUAT.frames.map((frame) => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
    const a = jointAngles(sol.world, 'l');
    return {
      statureCm,
      label: frame.label[lang],
      findings: validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH }),
      angles: `${t(lang, 'angle.trunk')} ${sol.trunkDeg.toFixed(0)}° · ${t(lang, 'angle.hip')} ${a.hipFlexDeg.toFixed(0)}° · ${t(lang, 'angle.knee')} ${a.kneeFlexDeg.toFixed(0)}° · ${t(lang, 'angle.elbow')} ${a.elbowFlexDeg.toFixed(0)}°`,
    };
  }),
);
---
<table class="spike-checks">
  <thead>
    <tr>
      <th>{t(lang, 'spike.check.stature')}</th>
      <th>{t(lang, 'spike.check.frame')}</th>
      <th>{t(lang, 'spike.check.angles')}</th>
      <th>{t(lang, 'spike.check.result')}</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((r) => (
      <tr>
        <td>{r.statureCm} cm</td>
        <td>{r.label}</td>
        <td>{r.angles}</td>
        <td>
          {r.findings.length === 0
            ? <span class="pass">✓ {t(lang, 'spike.check.pass')}</span>
            : <span class="fail">✗ {t(lang, 'spike.check.fail')}: {r.findings.map((f) => f.check).join(', ')}</span>}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

- [ ] **Step 7: Write the page**

`src/pages/[lang]/dev/figure-spike.astro`:
```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import FigureViewer from '../../../components/figure/FigureViewer';
import FigureFrames from '../../../components/figure/FigureFrames.astro';
import SpikeChecks from '../../../components/figure/SpikeChecks.astro';
import { SMITH_SQUAT } from '../../../lib/figure/fixtures/smith-squat';
import { isLocale, localeStaticPaths, t } from '../../../lib/i18n';
import { withBase } from '../../../lib/site';

export function getStaticPaths() {
  return localeStaticPaths();
}
const { lang } = Astro.params;
if (!isLocale(lang)) throw new Error(`Unknown locale: ${lang}`);
const images = SMITH_SQUAT.frames.map((_, i) => withBase(`figures/${SMITH_SQUAT.id}/frame-${i}.webp`));
---
<BaseLayout lang={lang} title={t(lang, 'spike.title')} noindex>
  <h1>{t(lang, 'spike.title')}</h1>
  <p class="lead">{t(lang, 'spike.intro')}</p>
  <h2>{t(lang, 'spike.viewer')}</h2>
  <FigureViewer client:only="preact" lang={lang} modelUrl={withBase('models/human.glb')} spec={SMITH_SQUAT} fallbackImages={images} />
  <h2>{t(lang, 'spike.frames')}</h2>
  <FigureFrames lang={lang} spec={SMITH_SQUAT} images={images} />
  <h2>{t(lang, 'spike.checks')}</h2>
  <SpikeChecks lang={lang} />
</BaseLayout>
```

- [ ] **Step 8: Run everything**

```bash
npm run render:figures
npm run check && npm run lint && npm test
npm run test:e2e
```
Expected: `0 errors`; lint clean; all unit tests pass; all e2e tests pass, including 3 spike tests and the WebGL-off fallback test. Also open `npm run dev` → `http://localhost:4321/ai_health/en/dev/figure-spike/` and try the frame buttons, ▶ Play, drag-to-rotate and Reset view.

- [ ] **Step 9: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'feat(figures): add 3D figure spike page with viewer, frames and checks\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure spike page and viewer" \
  --body $'the spike page is live at https://tomqwu.github.io/ai_health/en/dev/figure-spike/ (and /zh/…) and its e2e tests pass in CI.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** the spike page is live at `https://tomqwu.github.io/ai_health/en/dev/figure-spike/` (and `/zh/…`) and its e2e tests pass in CI.

---

### Task 15: Figure pipeline docs

**Files:**
- Create: `docs/figure-pipeline.md`
- Modify: `docs/architecture.md` (link), `README.md` (commands)

- [ ] **Step 1: Write `docs/figure-pipeline.md`**

````markdown
# Figure pipeline

How exercise figures are produced. Spec: §8 of `docs/superpowers/specs/2026-09-29-fitness-platform-design.md`.

## Conventions

- Pose and geometry layers work in **centimetres**, with glTF axes: **+Y up, +Z = the figure's facing direction, +X = the figure's left**.
- The three.js scene works in metres (cm ÷ 100).
- Bones use the MPFB `game_engine` rig names (`pelvis`, `spine_01…03`, `neck_01`, `head`, `clavicle_l`, `upperarm_l`, `lowerarm_l`, `hand_l`, fingers `index_01_l…`, `thigh_l`, `calf_l`, `foot_l`, `ball_l`; `_r` mirrored).

## Layers

| Layer | Files | What it does |
|---|---|---|
| Math | `src/lib/figure/math` | Vectors and quaternions (three.js-compatible semantics) |
| Pose | `src/lib/figure/pose` | Skeleton from `skeleton.json`, forward kinematics, `PoseBuilder` (aim, two-bone IK), hand curl, per-exercise solvers, validators |
| Geometry | `src/lib/figure/geometry` | Equipment primitives built from parameters; `ILLUSTRATIVE_SMITH` holds labelled drawing defaults |
| 3D | `src/lib/figure/scene3d` | Stage (lights, floor, camera), equipment meshes, human loader and `applyPose`, `mountFigure` |
| Output | `scripts/render-figures.ts`, `FigureViewer.tsx` | Pre-rendered WebP frames; interactive viewer |

## Regenerating the human model

```bash
bash scripts/setup-mpfb.sh   # once per machine: installs MPFB into Blender, downloads and installs the CC0 asset pack
npm run build:human          # Blender → raw glb → optimise (meshopt + WebP) → public/models/human.glb → skeleton.json
npx vitest run tests/assets  # model budget, skeleton sync, and the real-rig Smith squat sweep
```

Change body shape or assets in `assets-src/human/human.config.json`. Skin colour is `SKIN_TONE` in `src/lib/figure/scene3d/human.ts`.

## Adding or tuning a pose

1. Frames are data (`src/lib/figure/fixtures/*.ts`): joint targets and anchors, never pixel art.
2. Run `npx vitest run src/lib/figure tests/assets` — every frame must pass the validators at 150–200 cm on both the synthetic and the real skeleton.
3. `npm run render:figures` and look at `public/figures/<id>/frame-*.webp`.

## Rendering

- `npm run render:figures` starts `astro dev`, opens `/render/figure/` in headless Chromium with software WebGL, screenshots each frame, composites the movement arrow, and writes WebP files. It fails if a frame looks blank.
- CI and the deploy workflow run it before building, so `public/figures/` is never committed.
````

- [ ] **Step 2: Link it**

Append to `docs/architecture.md`:
```markdown

## Figures

See [figure-pipeline.md](figure-pipeline.md) for the 3D figure layers, conventions and commands.
```
Add to the README command block:
```bash
npm run render:figures   # pre-render 3D exercise frames into public/figures/
npm run build:human      # regenerate the 3D human (needs Blender + MPFB; see docs/figure-pipeline.md)
```

- [ ] **Step 3: Commit, open the PR, merge when CI is green**

```bash
git add -A
git commit -m $'docs: document the figure pipeline\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure pipeline docs" \
  --body $'docs are merged and linked from the architecture page and README.\n\nCloses #<issue from the Task 0 table>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Wait for the PR's CI to pass (in the Claude desktop app, bind the PR with the `ccd_pr` tools rather than polling `gh`). Then:
```bash
gh pr merge --squash --delete-branch && git checkout main && git pull
```

**Done when:** docs are merged and linked from the architecture page and README.

---

### Task 16: Owner review — 3D figure look (gate)

**Files:** none unless changes are requested.

- [ ] **Step 1: Share the page**

Confirm the latest Deploy run succeeded, then send the owner both links:
`https://tomqwu.github.io/ai_health/en/dev/figure-spike/` and `https://tomqwu.github.io/ai_health/zh/dev/figure-spike/`.

- [ ] **Step 2: Ask for a decision on each point**

1. Overall realism of the figure (body, face, hair, clothing).
2. Skin tone (`SKIN_TONE`) and clothing (T-shirt + jeans from the CC0 pack) — keep, or change?
3. Machine look (frame, rails, bar, plates, catches, stops).
4. Camera angle and framing of the three frames.
5. Animation (▶) and rotate/zoom behaviour.
6. Anything mechanically wrong (bar position on the back, hand grip, foot placement).

- [ ] **Step 3: Record the outcome on the gate issue**

```bash
gh issue comment <gate issue> --repo tomqwu/ai_health --body "Owner review: <approved | changes requested: list>"
```
Changes are made as new issues under M1 and follow the normal TDD/PR loop. When the owner approves:
```bash
gh issue close <gate issue> --repo tomqwu/ai_health --comment "Approved by the owner."
M=$(gh api repos/tomqwu/ai_health/milestones --jq '.[] | select(.title=="M1 3D figure spike") | .number')
gh api -X PATCH repos/tomqwu/ai_health/milestones/$M -f state=closed
```

**Done when (M1 exit):** the owner has approved the 3D look on the gate issue. Next step: write the M2 plan (content model & engine) with `superpowers:writing-plans`.
