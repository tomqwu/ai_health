# Architecture

See the design spec for the full picture: `docs/superpowers/specs/2026-09-29-fitness-platform-design.md`.

## Layers

| Layer | Where | Rules |
|---|---|---|
| Pages and components | `src/pages`, `src/components`, `src/layouts` | Astro; Preact islands only for interactive parts |
| Content | `src/content/**/*.yaml`, `src/content.config.ts`, `src/catalog.ts` | Generic knowledge only, validated by the Zod schemas in `src/lib/content`. `loadCatalog()` in `src/catalog.ts` is the only reader for the engine and fails the build on a broken reference. See [content-authoring.md](content-authoring.md) |
| Pure libraries | `src/lib/**` except `scene3d` | No DOM, no Astro, no three.js; unit-tested with Vitest |
| 3D rendering | `src/lib/figure/scene3d` | The only code that imports `three` |
| Build scripts | `scripts/` | Run with `tsx`; their pure parts live in `scripts/lib` with tests. `render-figures` also imports the pure figure layers |

## Conventions

- Routes are `/<lang>/…` for `en` and `zh`; build links with `localizedPath()` and assets with `withBase()`.
- UI strings live in `src/lib/i18n/{en,zh}.ts`; `zh` must define every key (type-checked).
- Areas (fitness today; nutrition and tracking later) are registered in `src/lib/areas.ts`; the header and home page read from it.
- Personal data never enters the repository; it stays in the visitor's browser. `src/lib/profile` is the only code that touches `localStorage` (key `aih.profile`); everything else receives a `Profile` value. `ProfileStore.save` and `clear` return whether the change was persisted; `false` means it lives only in memory.
- Pure code returns `Message` objects (`src/lib/i18n/format.ts`), never finished strings; UI code formats them with `formatMessage(locale, message, { length })`.
- Profiles and content store metric values; `src/lib/units.ts` converts only for display and input. Cable stacks and owned loads keep their printed unit.

## Engine

`src/lib/engine` implements spec §7: `checkFeasibility` (capabilities, attachments, exclusions, geometry; feasible or infeasible), `buildWeek` (pattern slots, ranking, overrides, supersets, empty slots, assumptions), `estimateDay` / `fitToTime` and `shortSession`. Nothing waits on a measurement (spec D12): an unknown height poses at a typical 175 cm, an unknown ceiling is assumed to be 240 cm (exceeding it adds a "check overhead clearance" note; a measured ceiling that is too low makes the exercise infeasible), and unmeasured equipment uses its `illustrativeDefaults`. Heights are compared unrounded; a reason shows them rounded apart (the need up and the ceiling down; a bar past a stop and the stop each away from the other), so a refusal never reads as a fit. Geometry poses an exercise with a probe from `DEFAULT_PROBES` (the Smith squat, through `checkFigureFrame` on the typical machine); exercises without a probe use a conservative stature-based envelope until the M3 pose library, and Smith-bar exercises without a probe are never planned. Geometry fails safe: a stop or bench-fit value that cannot be resolved makes the exercise infeasible (`stopsUnknown`, `benchFitUnknown`) instead of skipping the check, and the catalog build prevents it for equipment the geometry checks depend on. Ties in ranking break by id in code-unit order (`compareIds`), never by the runtime locale. Tests use synthetic catalogs and profiles from `src/lib/engine/testing/fixtures.ts`; `scenarios.test.ts` runs the whole engine on four of them (the M2 exit criterion).

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

Astro 7 backgrounds `dev` and `preview` when it detects an AI agent. Only the Playwright web server and `render:figures` pass `--ignore-lock` to avoid that. When you run `npm run dev` or `npm run preview` under an agent, add it yourself (`npm run dev -- --ignore-lock`). Stop a stray server with `npx astro dev stop` or `npx astro preview stop`.

## Deploy

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: type check, lint, unit tests, `npm run render:figures`, build and the end-to-end tests. `.github/workflows/deploy.yml` runs only after CI succeeds for a push to `main`. It checks out the exact commit CI tested, installs Chromium, runs `npm run render:figures`, builds `dist/` and publishes it to GitHub Pages. It can also be started by hand (`workflow_dispatch`), which skips the wait for CI. CI never cancels a `main` run mid-run; runs queue, and a newer queued run supersedes an older one, so the newest commit on `main` always gets a deploy decision.
