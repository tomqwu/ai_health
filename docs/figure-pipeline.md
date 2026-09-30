# Figure pipeline

How exercise figures are produced. Spec: §8 of `docs/superpowers/specs/2026-09-29-fitness-platform-design.md`.

## Conventions

- Pose and geometry layers work in **centimetres**, with glTF axes: **+Y up, +Z = the figure's facing direction, +X = the figure's left**.
- The three.js scene works in metres (cm ÷ 100).
- Bones use the MPFB `game_engine` rig names (`pelvis`, `spine_01…03`, `neck_01`, `head`, `clavicle_l`, `upperarm_l`, `lowerarm_l`, `hand_l`, fingers `index_01_l…`, `thigh_l`, `calf_l`, `foot_l`, `ball_l`; `_r` mirrored). The rig's root bone is `Root`.
- The pure layers (`math`, `pose`, `geometry`) never import `three`, the DOM or Astro. Only `scene3d` imports `three`.

## Layers

| Layer | Files | What it does |
|---|---|---|
| Math | `src/lib/figure/math` | Vectors and quaternions (three.js-compatible semantics) |
| Pose | `src/lib/figure/pose` | Skeleton from `skeleton.json`, forward kinematics, `PoseBuilder` (aim, two-bone IK), hand curl, the Smith squat solver, validators |
| Geometry | `src/lib/figure/geometry` | Equipment primitives built from parameters; `ILLUSTRATIVE_SMITH` holds labelled drawing defaults (not measurements of anyone's machine) |
| Fixtures | `src/lib/figure/fixtures` | Exercise data: `SMITH_SQUAT` and the `FIGURES` registry the renderer reads |
| 3D | `src/lib/figure/scene3d` | Stage (lights, floor, camera), equipment meshes, human loader and `applyPose`, `mountFigure` |
| Output | `scripts/render-figures.ts`, `src/pages/render/figure.astro`, `src/components/figure/` | Pre-rendered WebP frames; the interactive `FigureViewer.tsx`; the spike page `/<lang>/dev/figure-spike/` |

## Regenerating the human model

Needs Blender 4.2 or newer. The scripts look for it at `/Applications/Blender.app/Contents/MacOS/Blender`; set `BLENDER` to use another path.

```bash
bash scripts/setup-mpfb.sh   # once per machine: installs MPFB 2.0.17 into Blender, downloads the CC0 asset pack
npm run build:human          # Blender → raw glb → optimise (meshopt + WebP) → public/models/human.glb → skeleton.json
npx vitest run tests/assets  # model budget, skeleton sync, and the real-rig Smith squat sweep
```

- `setup-mpfb.sh` pins both downloads by sha256 (the MPFB 2.0.17 extension zip, about 43 MB, and `makehuman_system_assets_cc0.zip`, about 267 MB), verifies each before use, and caches them in `.cache/` (git-ignored). The asset server is slow, so the first run takes a long time. Later runs reuse the cached, verified zips and skip installing MPFB if 2.0.17 is already there, but `install_assets.py` extracts the asset pack into MPFB's data folder again on every run. It fails if a different MPFB version is already installed. The pins are listed in `assets-src/human/README.md`.
- Change body shape or assets in `assets-src/human/human.config.json`. The `.blend` and `assets-src/human/build/` are never committed.
- `public/models/human.glb` is committed: about 0.67 MB (budget 8 MB), stature about 184 cm. `skeleton.json` records the glb's sha256, and `tests/assets` fails if the two drift apart, so always commit them together.
- The exported `Body` mesh has no material. `loadHuman` applies the skin at runtime from `SKIN_TONE` in `src/lib/figure/scene3d/human.ts`.
- The optimiser quantises vertex positions. Measure the body through `skeleton.json` and the posed bones, never by reading raw vertex positions.

## Adding or tuning a pose

1. Frames are data (`src/lib/figure/fixtures/*.ts`): joint targets and anchors, never pixel art. Register a new figure in `fixtures/index.ts` so the renderer finds it.
2. Run `npx vitest run src/lib/figure tests/assets`. Every frame must pass `validateSmithSquat` at 150–200 cm, on both the synthetic skeleton (`src/lib/figure/pose`) and the real one (`tests/assets`). The validator needs the fixture's `barRestOffsetCm`; its bar-on-rail check re-derives the bar from the posed body (`carriedBarCenter`), so it catches a bar that drifts off the rail.
3. `npm run render:figures` and look at `public/figures/<id>/frame-*.webp`, or open `/<lang>/dev/figure-spike/`, which shows the live viewer, the frames and the validator table for 150–200 cm.

## Rendering

- `npm run render:figures` starts `astro dev` on port 4329, opens `/render/figure/` in headless Chromium with software WebGL (`SOFTWARE_WEBGL_ARGS` in `scripts/lib/browser.ts`, shared with `playwright.config.ts`), screenshots each frame, composites the movement arrow, and writes WebP files. It fails if a frame looks blank or the page throws.
- Run `npx playwright install chromium` once per machine first.
- Astro 7 puts `dev` and `preview` in the background when it detects an AI agent. `render:figures` and the Playwright web server pass `--ignore-lock` so their servers stay in the foreground and are stopped cleanly. `npm run dev` and `npm run preview` do not; under an agent, add it yourself (`npm run dev -- --ignore-lock`). If a server is left running, stop it with `npx astro dev stop` (or `npx astro preview stop`).
- CI and the deploy workflow run `render:figures` before building, so `public/figures/` is never committed.
- `npm run test:e2e` builds the site and runs Playwright against `astro preview`. Locally, run `npm run render:figures` first: the spike page's frame images come from `public/figures/`.

## The interactive viewer

`FigureViewer.tsx` reports its state through `data-figure-status`:

| Status | Meaning |
|---|---|
| `loading` | Loading the model and three.js |
| `ready` | The 3D scene is drawing |
| `unavailable` | The browser has no WebGL; the pre-rendered frames are shown instead |
| `error` | The model or scene failed to load; the pre-rendered frames are shown with an error message |
