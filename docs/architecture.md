# Architecture

See the design spec for the full picture: `docs/superpowers/specs/2026-09-29-fitness-platform-design.md`.

## Layers

| Layer | Where | Rules |
|---|---|---|
| Pages and components | `src/pages`, `src/components`, `src/layouts` | Astro; Preact islands only for interactive parts |
| Pure libraries | `src/lib/**` except `scene3d` | No DOM, no Astro, no three.js; unit-tested with Vitest |
| 3D rendering | `src/lib/figure/scene3d` | The only code that imports `three` |
| Build scripts | `scripts/` | Run with `tsx`; their pure parts live in `scripts/lib` with tests. `render-figures` also imports the pure figure layers |

## Conventions

- Routes are `/<lang>/…` for `en` and `zh`; build links with `localizedPath()` and assets with `withBase()`.
- UI strings live in `src/lib/i18n/{en,zh}.ts`; `zh` must define every key (type-checked).
- Areas (fitness today; nutrition and tracking later) are registered in `src/lib/areas.ts`; the header and home page read from it.
- Personal data never enters the repository; it stays in the visitor's browser.

## Figures

See [figure-pipeline.md](figure-pipeline.md) for the 3D figure layers, conventions and commands.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at `http://localhost:4321/ai_health/` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | Unit tests (`src/`, `scripts/`, `tests/assets/`) |
| `npx playwright install chromium` | One-time per machine: the browser Playwright and `render:figures` use |
| `npm run render:figures` | Pre-render the 3D exercise frames into `public/figures/` (git-ignored) |
| `npm run test:e2e` | Build, preview and run Playwright; run `render:figures` first locally |
| `npm run build:human` | Regenerate the 3D human (needs Blender and MPFB; see [figure-pipeline.md](figure-pipeline.md)) |
| `npm run check` / `npm run lint` | Type check / lint |

Astro 7 backgrounds `dev` and `preview` when it detects an AI agent. The scripts pass `--ignore-lock` to avoid that; stop a stray server with `npx astro dev stop`.

## Deploy

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: type check, lint, unit tests, `npm run render:figures`, build and the end-to-end tests. `.github/workflows/deploy.yml` runs only after CI succeeds for a push to `main`. It checks out the exact commit CI tested, installs Chromium, runs `npm run render:figures`, builds `dist/` and publishes it to GitHub Pages. It can also be started by hand (`workflow_dispatch`), which skips the wait for CI. CI never cancels a run on `main`, so every merge gets a deploy decision.
