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
