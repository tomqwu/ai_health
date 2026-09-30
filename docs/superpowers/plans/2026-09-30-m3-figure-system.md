# M3 Figure System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: pre-approved by the owner (2026-09-30); revised after the plan review (2026-09-30).** Open choices are settled in [Controller decisions](#controller-decisions); the one genuine owner gate (the look of the new figures, Task 15) stays a gate, and it is a hard stop for the controller. Written against `main` after the M2 exit (2e6d71e, #81). Every code block below was dry-run in a scratch copy: see the [Self-review](#self-review).

**Goal:** Turn the M1 Smith-squat spike into a figure system: a generalized pose library that poses any exercise from data, 3D builders for every v1 equipment class and attachment, a viewer island for any figure, a cached pre-render pipeline in CI, and a figure sweep — so that the sweep is green and the viewer works with and without WebGL (spec §16, M3 exit).

**Architecture:** A figure is data (`PoseFigureSpec` in `src/lib/figure/fixtures/<id>.ts`): a fixed scene of parametric equipment plus three keyframes, each placing the hips relative to an anchor (floor, equipment or the posed body), leaning and bending the trunk, and giving every limb a goal (a grip point and how the hand holds, a foot contact and how the foot sits) that two-bone IK reaches with elbows and knees on their hinges. `validatePose` checks every spec §8.1 rule against body capsules and the same equipment primitives the 3D layer draws. A `FigureModel` interface wraps both the new pose figures and the unchanged M1 Smith squat, and is the only thing the renderer, the viewer island, the engine's probes and the sweep use. Pre-renders are cached by a content hash of everything they draw.

**Tech Stack:** TypeScript 6.0.3, Vitest 5.0.2, three.js 0.186.1 (only in `src/lib/figure/scene3d`), Astro 7.3.5 + Preact islands, Playwright 1.63.0 with software WebGL, sharp 0.35.5, GitHub Actions (`actions/cache@v6`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-fitness-platform-design.md` (§4, §5.3, §8, §9, §11, §14, §15, §16; decisions D11 and D12). This plan covers M3 only.

## Global Constraints

Copied from the spec unless marked *(plan)*. Every task's requirements include this section.

- Stack as installed: Astro **7.3.5**, TypeScript **6.0.3**, Vitest **5.0.2**, three **0.186.1**, @playwright/test **1.63.0**, Node ≥ 22.12.0. *(plan)* Add no dependency.
- §4.2: "`lib/engine`, `lib/figure/pose` and `lib/figure/geometry` are pure functions. They run at build time (static pages, figure sweep in CI) and in the browser (planner, viewer) unchanged." "`lib/figure/scene3d` is the only module that depends on three.js/WebGL. Swapping the renderer changes nothing else."
- §8.1: "Skeleton: bone hierarchy, rest offsets and bone names are **extracted from the human glTF rig at build time** into `skeleton.json`. … It is scaled uniformly to the stature." "Keyframes: partial joint rotations + anchors (`hands → smith-bar`, `feet → floor`, `hips → bench-seat`, `upper-back → smith-bar`)." "Solvers: two-bone IK for arms and legs with pole vectors; a rail constraint that adjusts trunk/hip angles so a Smith bar stays on its rail; floor contact for feet." "Range-of-motion limits: per-joint ranges (e.g. elbow flexion 0–145°)." "Hanging exercises use a bent-knee hang when the bar is below the user's standing overhead reach. The feet must clear the floor in the hang, and the head must clear the ceiling at the top."
- §8.1 validators (`error` fails CI, `warn` is reported): "Anchored parts within 1 cm of their targets (hands on grip, feet on floor) | error"; "Smith bar on its rail and within its stops | error"; "Bone lengths constant across frames | error"; "Joint angles within ROM limits | error"; "Head, hands and implements below the ceiling minus margin (profile only) | error"; "Feet clear the floor in hanging positions | error"; "Bench does not intersect rack parts; implements do not intersect the frame | error"; "Body proxies do not interpenetrate equipment except at declared contacts | warn".
- §8.2: "It turns equipment parameters into collision proxies (boxes, cylinders, capsules): uprights, rails, bar, plates, stops, catches, bench (seat + backrest at angle), cable column, pulleys, dumbbells and attachments. It also provides body capsules derived from the skeleton. The validators and `scene3d` both consume the same geometry, so what is checked is what is drawn."
- §8.3: "Equipment: meshes built from the same parameters as the geometry layer. Unmeasured values use `illustrativeDefaults`, and the view shows an "illustrative dimensions" label." "Look: studio lighting, soft contact shadows, neutral floor."
- §8.4: "Pre-render | Build (CI) | `scripts/render-figures.ts` drives headless Chromium (software WebGL) to render every exercise × 3 frames at the default stature (175 cm) with illustrative equipment. … Results are cached by a hash of skeleton, model, figure spec, equipment defaults and renderer version." "Interactive viewer | Exercise pages, planner | A lazy-loaded Preact island re-renders at the profile's stature and measurements, animates between frames (▶), and allows orbiting the camera. It falls back to the pre-renders without WebGL."
- §3 D11: "Movement arrows on figures | Composited into the pre-rendered WebP frames, not served as overlay JSON; the interactive viewer still draws them as an SVG overlay. Render caching by content hash is deferred to M3".
- §3 D12: "Equipment measurements (2026-09-30) | Never required. Plans and guides describe general movements and setups for each device type; geometry checks use typical (illustrative) dimensions, and a user can optionally enter their own."
- §5.3: "Frame phases fit the movement (e.g. setup / loaded / finish, or setup / hold / alignment check for isometrics). There are always exactly three." "`unilateral` exercises render the working side nearest the camera and show a "both sides" badge." "Cardio-machine sessions (treadmill, rower) may omit `figure`; every strength, core and mobility exercise has one."
- §7.1: "Unknown stature → pose at a typical adult stature (175 cm); figures and checks say "typical height"."
- §9: "Every route exists under `/en/` and `/zh/`. The base path is `/ai_health/`." §9.3: "No runtime third-party requests: no CDNs, web fonts or analytics." WCAG AA contrast and keyboard-accessible controls.
- §11: "WebGL unavailable or model fails to load | Pre-rendered frames".
- §12: "Exercises are only illustrated in configurations the equipment genuinely supports. No figure shows a bypassed stop, an unsupported attachment or equipment moved through structure."
- §13: "No personal data in the repository, issues, pull requests, commit messages, test fixtures or build logs." *(plan)* No brand or model names; equipment is described generically, every dimension is illustrative, and nothing copies a measurement the owner shared.
- §14: "Pose / geometry | Vitest | IK accuracy, rail solver, ROM limits, every validator (positive and negative fixtures)"; "Figure sweep | Vitest in CI | Every exercise × frame × stature {150, 165, 175, 190, 200} passes validators with illustrative equipment, or declares an expected infeasibility with a reason"; "End-to-end | Playwright | … WebGL-off fallback". "Visual approval of the 3D look is a human gate".
- §15: "`ci.yml` (pull requests): typecheck, lint, unit tests, content checks, figure sweep, build, Playwright." "`deploy.yml` (push to `main`): build, pre-render figures (cached), deploy to GitHub Pages".
- §16 M3: "Generalized pose library, all equipment builders, viewer island, pre-render pipeline in CI, figure sweep | Sweep green; viewer works with and without WebGL".
- *(plan, owner feedback)* Figures are realistic 3D renders of the rigged human with parametric equipment; never 2D vector art. New figures go to the owner for a look review (Task 15) before M5 builds on them.
- *(plan)* Out of scope: exercise YAML, text and pages for the new figures, and the remaining v1 equipment YAML (M5); the profile-driven stature and measurements in the viewer and print capture (M4).
- Git (as in M2): one branch + PR per issue (`m3/<issue#>-<slug>`), PR body contains `Closes #N`, squash-merge when CI is green. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Wait for CI with the app's PR tools, not by polling `gh`.

## Controller decisions

The owner pre-approved this plan; where the spec leaves a choice open, the controller chose as follows. Tasks refer to these by number.

1. **Figure data stays in typed modules.** Each figure is a `PoseFigureSpec` in `src/lib/figure/fixtures/<id>.ts`, and an exercise refers to it by id (`figure: { spec: <id> }`, M2 owner decision 2 kept). Frame labels and cues travel with the figure. Pose numbers are tuned against the solver and checked by the type checker and the sweep, which YAML could not do.
2. **Representative set.** M3 poses one figure per non-cardio movement pattern (spec §5.4), 20 in all, covering every station that needs figures (smith, cable, bench, floor, barbell):

   | Pattern | Figure | Station, equipment |
   |---|---|---|
   | horizontal-push | `smith-bench-press` | smith: Smith bar, flat bench inside the rack |
   | incline-push | `db-incline-press` | bench at 30°, dumbbells |
   | vertical-push | `db-shoulder-press` | bench at 90°, dumbbells (seated) |
   | horizontal-pull | `cable-seated-row` | cable: low pulley, close-grip handle, row footplate |
   | vertical-pull | `pull-up` | smith (M2 owner decision 11): pull-up bar, bent-knee hang |
   | squat | `smith-squat` | the M1 figure, unchanged |
   | lunge | `db-split-squat` | floor, dumbbells (unilateral) |
   | hip-hinge | `barbell-romanian-deadlift` | barbell with bumper plates |
   | hip-extension | `glute-bridge` | floor |
   | knee-flexion | `nordic-curl` | roller hold-down (its Nordic-curl use) |
   | calf | `db-calf-raise` | floor, dumbbells |
   | elbow-flexion | `db-curl` | floor, dumbbells |
   | elbow-extension | `cable-triceps-pushdown` | cable: high pulley, rope |
   | shoulder-abduction | `db-lateral-raise` | floor, dumbbells |
   | rear-delt | `band-pull-apart` | resistance band |
   | core-anti-extension | `ab-wheel-rollout` | ab wheel, kneeling |
   | core-anti-rotation | `cable-pallof-press` | cable: chest pulley, single handle (unilateral) |
   | core-flexion | `ball-crunch` | exercise ball |
   | core-lateral | `side-plank` | floor, forearm (unilateral) |
   | mobility | `half-kneeling-hip-flexor-stretch` | floor, half-kneeling (unilateral) |

   M5 poses the other v1 exercises with the same library and writes all exercise YAML and text. Cardio machines get 3D models and stills but no exercise figure (spec §5.3 allows it). Unilateral figures work the left side, with the camera on the left.
3. **Issue #47 (elbow twist), default option (b).** `solvePose` always rolls the upper arm and the thigh with `twoBoneIK`'s `bendSide`, so every new figure bends elbows and knees on their hinges and gets the signed elbow and knee limits. The M1 Smith squat keeps option (a), its magnitude-only elbow check, so its approved look does not change. Option (c), twist bones in the human model, is taken only if the owner's look review (Task 15) rejects the sleeve fold at the shoulder; it then becomes a follow-up issue, since it needs Blender on the owner's machine. Option (a) for the new figures is one flag away: `ArmGoal.hinge: false` lets the arm swing the shortest way (no `bendSide`) and checks that elbow by magnitude only, so the controller can show the owner the difference.
4. **Pose model.** Points are `PointRef`s: an anchor (`floor`, an equipment anchor such as `bench.hinge` or `pullup.bar`, or a posed-body anchor such as `body.shoulder_l`), plus a fixed offset in cm, plus an offset written for 175 cm that scales with stature, optionally measured from the floor. A pose built only from body offsets is the same pose at every stature; fixed equipment heights are where statures differ, which is exactly what the sweep tests. Hands on a bar are oriented from the handle axis and the forearm: the fingers point along the forearm projected across the bar, so the wrist stays straight, and the authored palm direction only picks which side the palm faces (overhand or underhand); feet from toe and sole directions; body contacts are declared per frame. Body capsules use typical segment half-thicknesses at 175 cm (pelvis 10, abdomen 10.5, chest 11.5, head 9, upper arm 4.5, forearm 3.2, hand 1.4, thigh 7.5, shank 5.2, foot 2.5 cm); trunk capsules sit a little in front of the spine and limb capsules stop short of the narrow distal joints.
5. **Validator values.** 1 cm for every contact (grips, feet, declared body contacts; a `loose` contact such as thighs on a bench seat is only excused from the overlap warning). Wrists: the hand's direction against its rest direction, both measured in the forearm's frame, within 30° when holding something, 25° when pressing (`seat: 'palm'`) and 85° when flat on a surface (a push-up or catch position); a bar grip keeps the wrist straight by construction, bending only as far as the forearm leans along the bar. The authored spine stays within flexion −10…45°, side bend ±20° and twist ±30°, the neck within flexion −30…45° and turn ±60°. 2 cm of air under a hanging body. Held implements may touch the floor or equipment by at most 0.5 cm; against the body (hands and forearms excepted) more than 2 cm is a warning and more than 4 cm an error, unless the frame declares the touch. A body part sinking more than 2 cm into fixed equipment it does not rest on is a warning, and the sweep treats any warning as a failure. The Smith bar must stay above the safety catches it is drawn with (spec §12). The hip now reads 0 when standing (as the ankle does), is measured about its hinge only (spreading the legs does not read as extension), and may extend to −20° (typical active hip extension is about 10–20°); the Smith squat shares this limit, and its results do not change.
6. **In-between poses** (the viewer's Play, and the sweep) turn directions along the shorter arc, swing a hand placed from a shoulder around it, and settle the body back onto the first measured contact both keyframes declare, with a secant search of at most 5 steps to 0.05 cm; a part lying `along` a surface (the side plank's forearm) settles on the mean of its two end gaps, which is smooth, so the search converges (the validator still checks both ends). Play poses without validating (`pose(…, { validate: false })`), and each figure's scene is built once per set of equipment dimensions. Play's cost is budgeted in solver runs, not milliseconds, so the test does not depend on the runner: every posed figure reports `solves`, and the sweep fails an unvalidated in-between pose that needs more than 5 (a search that runs out of steps needs 8; in the dry run no figure needed more than 4, about 0.5–2 ms locally). A loose 100 ms wall-clock bound stays as a sanity check. Consecutive keyframes must measure each point from the same anchor (enforced).
7. **The M1 Smith squat is wrapped, not rewritten.** `smithSquatFigure` adapts its solver, validator, arrow and catches to the common `FigureModel`; its scene stays the bare Smith machine, so its pre-rendered frames do not change (in the dry run one frame was byte-identical and the other two differed only by edge noise of at most a few colour levels). `SMITH_SQUAT`, `checkFigureFrame` and `validateSmithSquat` keep their APIs.
8. **Generic equipment.** The Smith machine + functional trainer gains a pulley carriage on each front upright (settings in words: high 195, chest 125, low 22 cm), a weight stack beside each side, a pull-up bar across the front (210 cm, the content's typical value), and optional J-hooks, spotter arms, roller hold-down (pad top 30 cm, on a front upright) and row footplate (at a column's base). The bench, free weights, accessories, cardio machines and attachments are built from typical proportions. All are illustrative (D12). Each model states the typical values it draws (`drawsWith`), and the catalog fails the build if content's `illustrativeDefaults` disagree.
9. **Viewer and pages.** `FigureViewer` takes serializable figure metadata, loads three.js, the solver and the figure only when it mounts, poses at a `statureCm` prop (175 cm, "typical height", until M4 passes the profile's), offers a height picker on review pages, and shows the "both sides" badge. M3 replaces the M1 spike page with unlisted review pages, `/[lang]/dev/figures/` (every figure and equipment still) and `/[lang]/dev/figures/[id]/` (viewer, frames, sweep table). The public exercise pages of spec §9 are built in M5 from these components.
10. **Render cache.** The key of each image is the renderer's fingerprint (its source files; the versions of three.js, Playwright, its Chromium build and sharp; the human model's sha256; the render settings) plus everything it draws (camera, fixed equipment, each frame's bone rotations, root, props and arrow at 175 cm), rounded to 1e-6. Images live in `.cache/figures/<key>/`; CI restores that folder with `actions/cache@v6`, keyed on the list of keys (`figure-keys.txt`) with a prefix fallback, so only changed figures render. Equipment stills are rendered too, for the look review and M5's equipment pages. The CI job gets `timeout-minutes: 40` and the deploy build 30, room for a cold render (about 4–8 min with software WebGL on a hosted runner) plus the rest.
11. **Engine probes (#74).** Every library figure is a probe; the engine passes the resolved pull-up bar height (measured, else typical) into it, so hanging figures move with the bar and fail when the feet would touch the floor. The overhead-reach and pull-up estimates remain only for exercises without a figure. The synthetic engine fixture `db-shoulder-press` (a standing press in the M2 tests) is pointed at a non-library figure id so those tests keep exercising the stature envelope; the library's seated press is tested separately. The `buildCatalog` `figureIds` option gets its test.
12. **Content changes in M3** are limited to `model3d` on the three existing equipment files and the seven attachments. The other ten v1 equipment YAML files come with their guides in M5; their models already exist.
13. **Owner check-ins.** After Task 8 is deployed, the controller sends the owner the dumbbell-curl page and the 20 equipment stills for an early, non-blocking look (Task 8, step 7), and carries on with Tasks 9–13, which are pose data only. Task 15 is the blocking gate, with its own `gate:user-review` issue; #47 is decided there, with options (a), (b) and (c) put to the owner explicitly.

## Owner gates

- **Task 15: look review of the new figures and equipment** (`gate:user-review`, its own issue). **Controller only — never dispatched to a subagent; a hard stop.** The controller posts the review link and the #47 question to the owner in chat, ends its turn, and continues only on the owner's reply in chat. Changes the owner asks for become issues before M5 builds on the figures.
- **Task 8, step 7: an early look** at the dumbbell curl and the equipment stills, sent by the controller. Non-blocking: work continues, and anything the owner says is folded in before Task 15.
- The safety-screening answers (spec §17) gate M5 program content, not M3. The plan is otherwise pre-approved.

## File Map

```
src/lib/figure/math/quat.ts (+ math.test.ts)             fromTwoPairs: an orientation from two directions (Task 1)
src/lib/figure/geometry/primitives.ts (+ test)           rotated boxes, capped spheres, surface kinds, signed distance, penetration (Task 1)
src/lib/figure/scene3d/equipment.ts (+ equipment.test)   createEquipment: meshes from shared unit shapes, moved by id (Task 1)
src/lib/figure/geometry/built.ts                         Built (prims + anchors + surfaces), placement, merge (Task 2)
src/lib/figure/geometry/implements.ts                    dumbbell, barbell, ab wheel, band, foam roller, massage ball, exercise ball, balance trainer; cable attachments (Task 2)
src/lib/figure/geometry/cardio.ts                        treadmill, rowing machine, exercise bike (Task 2)
src/lib/figure/geometry/implements.test.ts               (Task 2)
src/lib/figure/geometry/trainer.ts                       Smith machine + functional trainer: pulleys, stacks, pull-up bar, J-hooks, spotter arms, hold-down, footplate (Task 3)
src/lib/figure/geometry/bench.ts                         adjustable bench at its locking angles (Task 3)
src/lib/figure/geometry/scene.ts                         SceneSpec, buildScene, illustrative scene parameters (Task 3)
src/lib/figure/geometry/models.ts                        EQUIPMENT_MODELS: every v1 equipment and attachment by model3d id, framed views, drawsWith (Task 3)
src/lib/figure/geometry/stations.test.ts                 (Task 3)
src/lib/figure/pose/poseSpec.ts                          the generalized pose data: PointRef, TrunkPose, ArmGoal, LegGoal, contacts, props, mirroring (Task 4)
src/lib/figure/pose/body.ts                              body capsules, grip and foot points, contact gaps, body anchors (Task 4)
src/lib/figure/pose/solvePose.ts (+ test)                solvePose: trunk, hinge-rolled IK limbs, hands, feet, props placement (Task 4)
src/lib/figure/pose/props.ts                             moving props of a solved frame (Task 4)
src/lib/figure/pose/testing/frames.ts                    a standing test frame for the synthetic skeleton (Task 4)
src/lib/figure/pose/validate.ts (+ test)                 new finding kinds; hip from standing, about its hinge; hip limit −20° (Task 4)
src/lib/figure/pose/validatePose.ts (+ test)             every §8.1 validator for pose figures; wrists by grip, spine and neck, implements against the body (Task 5)
src/lib/figure/pose/interpolate.ts (+ test)              in-between frames (Task 6)
src/lib/figure/figures.ts (+ figures.test.ts)            FigureModel, poseFigure, smithSquatFigure, figureMeta (Task 6)
src/lib/figure/fixtures/index.ts                         POSE_SPECS and FIGURES (Task 6, grows in Tasks 9–13)
src/lib/figure/fixtures/<id>.ts                          one pose spec per figure (Tasks 6, 9–13)
src/lib/figure/fixtures/coverage.test.ts                 one figure per non-cardio pattern (Tasks 9–13)
tests/assets/figure-sweep.test.ts                        the figure sweep on the real rig (Task 6)
src/lib/figure/scene3d/figureScene.ts, layout.ts, stage.ts   mountFigure for any FigureModel, mountEquipment (Task 6)
src/components/figure/FigureViewer.tsx, FigureFrames.astro   the island and frames for any figure (Task 6)
src/pages/render/[figure].astro                          one-page render harness (Task 6 adapts, Task 7 rewrites)
scripts/render-figures.ts, scripts/lib/figureKeys.ts (+ test)   cached pre-rendering of frames and equipment stills (Task 7)
package.json, .gitignore, .github/workflows/{ci,deploy}.yml     figures:keys, the cache step, CI time cap 40 min (Task 7)
src/pages/[lang]/dev/figures/{index,[id]}.astro          review pages; FigureChecks.astro; the spike page and SpikeChecks go (Task 8)
tests/e2e/figure-viewer.spec.ts (was figure-spike), figure-fallback.spec.ts, smoke.spec.ts   (Task 8)
src/lib/engine/probes.ts (+ test), geometry.ts, testing/fixtures.ts   figureProbe, DEFAULT_PROBES for every figure, pull-up bar height (Task 14)
src/lib/content/catalog.ts (+ test), schemas.ts, src/content/**/*.yaml   model3d checks, drawn defaults (Task 14)
src/lib/i18n/{en,zh}.ts                                  viewer strings (Task 6), review-page strings (Task 8)
docs/figure-pipeline.md, docs/architecture.md            (Tasks 7, 14, 16)
README.md                                                preview link to the review pages (Task 8); the figure system shipped (Task 16)
```

Dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9–13 (any order, one at a time: each edits `fixtures/index.ts` and `coverage.test.ts`) → 14 (needs 9 and 12) → 15 (controller only; waits for the owner) → 16. After 8 is deployed, the controller sends the owner an early look (Task 8, Step 7) without waiting.

---

### Task 0: GitHub tracking

No code. The milestone "M3 Figure system" and its epic (#18) exist. Issue #74 (M3 follow-ups from M2) is closed by Task 14. Task 15, the owner's look review, gets its own gate issue; issue #47 (elbow twist) stays a separate issue, decided and closed in Task 15 with the option the owner picks.

| Task | Issue title | Labels | Issue # |
|---|---|---|---|
| 1 | Figure primitives, signed distances and the mesh builder | area:figures, type:feature | #82 |
| 2 | Equipment builders: free weights, accessories, cardio machines, attachments | area:figures, type:feature | #83 |
| 3 | Equipment builders: trainer, bench, scenes and the model registry | area:figures, type:feature | #84 |
| 4 | Pose library: pose data and solver | area:figures, type:feature | #85 |
| 5 | Pose library: validators | area:figures, type:feature | #86 |
| 6 | Figure models, sweep and a viewer for any figure | area:figures, type:feature | #87 |
| 7 | Cached pre-render pipeline in CI | area:figures, area:platform, type:feature | #88 |
| 8 | Figure review pages and end-to-end tests | area:figures, type:feature | #89 |
| 9 | Figures: bench and Smith presses | area:figures, type:content | #90 |
| 10 | Figures: standing free weights | area:figures, type:content | #91 |
| 11 | Figures: cable station | area:figures, type:content | #92 |
| 12 | Figures: hanging and kneeling | area:figures, type:content | #93 |
| 13 | Figures: floor and ball | area:figures, type:content | #94 |
| 14 | Engine probes from the pose library; 3D model checks | area:fitness, area:figures, type:feature | #74 |
| 15 | Owner review: the look of the M3 figures (controller only) | area:figures, gate:user-review | #95 |
| 15 | Elbow twist: the owner's choice of option (a), (b) or (c) | area:figures | #47 |
| 16 | Figure docs and M3 exit | area:figures, type:docs | #96 |

- [ ] **Step 1: Create one issue per "new" row**

For each row marked "new" (body = the task's goal and its "Done when" line):
```bash
gh issue create --repo tomqwu/ai_health --title "<Issue title>" --label "<labels comma-separated>" --milestone "M3 Figure system" \
  --body $'Plan: docs/superpowers/plans/2026-09-30-m3-figure-system.md — Task <N>\nPart of #18\n\nDone when: <acceptance line>'
```
Write each printed number into the table. Add a comment to #74 and #47 pointing at Tasks 14 and 15. The Task 15 gate issue's body also says: "Controller only. Closed only on the owner's sign-off in chat."

- [ ] **Step 2: Commit the plan with the issue numbers**

Run this in the worktree that has `docs/m3-plan` checked out (`../ai_health-m3plan`); `git checkout docs/m3-plan` fails in the main checkout while that worktree exists.

```bash
cd ../ai_health-m3plan && git pull
git add docs/superpowers/plans/2026-09-30-m3-figure-system.md
git commit -m $'docs(plans): add the M3 issue numbers\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push
gh pr create --repo tomqwu/ai_health --title "docs: M3 figure system plan" --body $'The M3 implementation plan.\n\nPart of #18\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
Merge when CI is green: `gh pr merge --squash`, then in the main checkout `git worktree remove ../ai_health-m3plan && git branch -D docs/m3-plan && git checkout main && git pull`.

**Every later task** starts with `git checkout main && git pull && git checkout -b m3/<issue>-<slug>` and ends with the commit/PR/merge step shown in it; replace `<issue>` with the number from the table.

---
### Task 1: Figure primitives, signed distances and the mesh builder

The geometry layer so far draws axis-aligned boxes and cylinders. Benches need rotated boxes (the backrest at an angle), balls and the balance trainer need spheres (a dome is a sphere with its bottom cut off), and the validators of Task 5 need exact signed distances and "how deep does this reach into that". New surface kinds give the upholstery, rubber, grips, cables, rope, foam, bands and plastic their own materials. The 3D layer builds every mesh from one shared unit shape per kind, so a moving part (a dumbbell, a handle) is updated by setting its transform instead of rebuilding geometry every animation frame. `fromTwoPairs` orients a hand or foot from two anatomical directions.

**Files:**
- Modify: `src/lib/figure/math/quat.ts`, `src/lib/figure/math/math.test.ts`
- Replace: `src/lib/figure/geometry/primitives.ts`, `src/lib/figure/scene3d/equipment.ts`
- Modify: `src/lib/figure/geometry/primitives.test.ts`
- Create: `src/lib/figure/scene3d/equipment.test.ts`

**Interfaces:**
- Consumes: `Vec3` helpers (`math/vec3.ts`), `Quat` helpers (`math/quat.ts`), `CM` (`scene3d/units.ts`).
- Produces:
  - `fromTwoPairs(from: Vec3, fromSide: Vec3, to: Vec3, toSide: Vec3): Quat` — `from` → `to` exactly, `fromSide` as close to `toSide` as possible; throws "parallel" when a side has no part across its direction.
  - `SurfaceKind` adds `'pad' | 'rubber' | 'grip' | 'cable' | 'rope' | 'foam' | 'band' | 'ball' | 'dome' | 'plastic' | 'belt'`.
  - `Primitive` = box `{ kind: 'box'; id; center; size; surface; rotation?: Quat }` | cylinder (unchanged) | sphere `{ kind: 'sphere'; id; center; radius; surface; capBelowY?: number }`.
  - `aabbOf`, `aabbOverlap` (unchanged names), `signedDistance(p: Primitive, point: Vec3): number`, `surfaceSamples(p): Vec3[]`, `penetrationDepth(a, b): number`.
  - `createEquipment(name: string): EquipmentMeshes` with `{ group: THREE.Group; update(prims: readonly Primitive[]): void; dispose(): void }`; `buildEquipment(prims)` and `setBarHeight(group, cm)` keep working.

- [ ] **Step 1: Branch, and keep a baseline of the M1 frames**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-primitives
npm run render:figures
mkdir -p .cache/m1-baseline && cp public/figures/smith-squat/frame-*.webp .cache/m1-baseline/
```
(`.cache/` is git-ignored. Render before changing anything, so the baseline really is `main`.)

- [ ] **Step 2: Write the failing tests**

**Edit `src/lib/figure/math/math.test.ts`** (2 changes):

1. Replace

```ts
import { add, angleBetweenDeg, cross, distance, dot, lerp, midpoint, normalize, scale, sub, X_AXIS, Y_AXIS, Z_AXIS, type Vec3 } from './vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, rotate, slerp, type Quat } from './quat';

```

   with

```ts
import { add, angleBetweenDeg, cross, distance, dot, lerp, midpoint, normalize, scale, sub, X_AXIS, Y_AXIS, Z_AXIS, type Vec3 } from './vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, fromTwoPairs, fromUnitVectors, IDENTITY, multiply, rotate, slerp, type Quat } from './quat';

```

2. Replace

```ts
    expect(angleBetweenQuatsDeg(IDENTITY, fromAxisAngle([1, 2, 3], degToRad(70)))).toBeCloseTo(70);
  });
});
```

   with

```ts
    expect(angleBetweenQuatsDeg(IDENTITY, fromAxisAngle([1, 2, 3], degToRad(70)))).toBeCloseTo(70);
  });
});

describe('fromTwoPairs', () => {
  it('maps the first direction exactly and turns the side as close as it can', () => {
    const q = fromTwoPairs([0, 0, 1], [0, -1, 0], [1, 0, 0], [0, 0, -1]);
    close(rotate(q, [0, 0, 1]), [1, 0, 0]);
    close(rotate(q, [0, -1, 0]), [0, 0, -1]);
  });
  it('uses only the part of the side across the direction', () => {
    const q = fromTwoPairs(X_AXIS, Y_AXIS, Z_AXIS, [0, 1, 5]);
    close(rotate(q, X_AXIS), Z_AXIS);
    close(rotate(q, Y_AXIS), Y_AXIS);
  });
  it('throws when a side is parallel to its direction', () => {
    expect(() => fromTwoPairs(X_AXIS, [2, 0, 0], Y_AXIS, Z_AXIS)).toThrow(/parallel/);
    expect(() => fromTwoPairs(X_AXIS, Y_AXIS, Z_AXIS, [0, 0, -3])).toThrow(/parallel/);
  });
});
```


**Replace `src/lib/figure/geometry/primitives.test.ts` with:**

```ts
import { describe, expect, it } from 'vitest';
import { fromAxisAngle } from '../math/quat';
import { aabbOf, aabbOverlap, type Aabb, penetrationDepth, type Primitive, signedDistance } from './primitives';

const box = (center: [number, number, number], size: [number, number, number]): Primitive => ({
  kind: 'box',
  id: 'b',
  center,
  size,
  surface: 'frame',
});
const cyl = (start: [number, number, number], end: [number, number, number], radius: number): Primitive => ({
  kind: 'cylinder',
  id: 'c',
  start,
  end,
  radius,
  surface: 'chrome',
});

describe('aabbOf', () => {
  it('bounds a box by its half sizes', () => {
    const a = aabbOf(box([1, 2, 3], [2, 4, 6]));
    expect(a.min).toEqual([0, 0, 0]);
    expect(a.max).toEqual([2, 4, 6]);
  });
  it('bounds a vertical cylinder', () => {
    const a = aabbOf(cyl([0, 10, 0], [0, 50, 0], 2));
    expect(a.min).toEqual([-2, 10, -2]);
    expect(a.max).toEqual([2, 50, 2]);
  });
  it('adds no extent along the axis of an X-axis cylinder', () => {
    const a = aabbOf(cyl([-10, 5, 0], [10, 5, 0], 2));
    expect(a.min).toEqual([-10, 3, -2]);
    expect(a.max).toEqual([10, 7, 2]);
  });
  it('adds r*sqrt(1-d^2) per axis for a 45 degree cylinder in the XY plane', () => {
    const e = 2 * Math.SQRT1_2;
    const a = aabbOf(cyl([0, 0, 0], [10, 10, 0], 2));
    expect(a.min[0]).toBeCloseTo(-e);
    expect(a.min[1]).toBeCloseTo(-e);
    expect(a.min[2]).toBeCloseTo(-2);
    expect(a.max[0]).toBeCloseTo(10 + e);
    expect(a.max[1]).toBeCloseTo(10 + e);
    expect(a.max[2]).toBeCloseTo(2);
  });
});

describe('aabbOverlap', () => {
  const unit: Aabb = { min: [0, 0, 0], max: [1, 1, 1] };
  it('is true for overlapping boxes', () => {
    expect(aabbOverlap(unit, { min: [0.5, 0.5, 0.5], max: [2, 2, 2] })).toBe(true);
  });
  it('is false for separated boxes', () => {
    expect(aabbOverlap(unit, { min: [2, 0, 0], max: [3, 1, 1] })).toBe(false);
  });
  it('is false when only faces touch', () => {
    expect(aabbOverlap(unit, { min: [1, 0, 0], max: [2, 1, 1] })).toBe(false);
  });
});

describe('rotated boxes, capped spheres and distances', () => {
  const tilted: Primitive = { kind: 'box', id: 't', center: [0, 0, 0], size: [2, 2, 2], surface: 'pad', rotation: fromAxisAngle([0, 0, 1], Math.PI / 4) };
  const dome: Primitive = { kind: 'sphere', id: 'd', center: [0, 0, 0], radius: 10, surface: 'dome', capBelowY: 4 };

  it('bounds a rotated box by its corners', () => {
    const a = aabbOf(tilted);
    expect(a.max[0]).toBeCloseTo(Math.SQRT2);
    expect(a.max[2]).toBeCloseTo(1);
  });
  it('bounds a capped sphere from its cut', () => {
    expect(aabbOf(dome).min[1]).toBe(4);
    expect(aabbOf(dome).max[1]).toBe(10);
  });
  it('gives signed distances: negative inside, positive outside', () => {
    expect(signedDistance(box([0, 0, 0], [2, 2, 2]), [0, 0, 0])).toBeCloseTo(-1);
    expect(signedDistance(box([0, 0, 0], [2, 2, 2]), [3, 0, 0])).toBeCloseTo(2);
    expect(signedDistance(tilted, [Math.SQRT2 + 1, 0, 0])).toBeCloseTo(1);
    expect(signedDistance(cyl([0, 0, 0], [0, 10, 0], 2), [5, 5, 0])).toBeCloseTo(3);
    expect(signedDistance(cyl([0, 0, 0], [0, 10, 0], 2), [0, 13, 0])).toBeCloseTo(3);
    expect(signedDistance(dome, [0, 2, 0])).toBeCloseTo(2);
    expect(signedDistance(dome, [0, 12, 0])).toBeCloseTo(2);
  });
  it('measures how deep one primitive reaches into another', () => {
    expect(penetrationDepth(box([0, 0, 0], [2, 2, 2]), box([1.5, 0, 0], [2, 2, 2]))).toBeCloseTo(0.5);
    expect(penetrationDepth(box([0, 0, 0], [2, 2, 2]), box([5, 0, 0], [2, 2, 2]))).toBe(0);
  });
});
```

**Create `src/lib/figure/scene3d/equipment.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../math/vec3';
import type { Primitive, SurfaceKind } from '../geometry/primitives';
import { createEquipment } from './equipment';

// Node-only: three's scene graph needs no WebGL.

const box = (id: string, center: Vec3, size: Vec3, surface: SurfaceKind): Primitive => ({ kind: 'box', id, center, size, surface });
const cyl = (id: string, start: Vec3, end: Vec3, radius: number, surface: SurfaceKind): Primitive => ({ kind: 'cylinder', id, start, end, radius, surface });
const sphere = (id: string, center: Vec3, radius: number, surface: SurfaceKind, capBelowY?: number): Primitive => ({ kind: 'sphere', id, center, radius, surface, ...(capBelowY !== undefined && { capBelowY }) });

describe('createEquipment', () => {
  it('builds one mesh per primitive, sized from shared unit shapes (metres)', () => {
    const eq = createEquipment('props');
    eq.update([box('a', [0, 50, 0], [10, 20, 30], 'pad'), cyl('b', [0, 0, 0], [0, 100, 0], 2, 'chrome'), sphere('c', [0, 30, 0], 30, 'ball'), sphere('d', [0, 0, 0], 30, 'dome', 5)]);
    const [a, b, c, d] = eq.group.children as Array<import('three').Mesh>;
    expect(a!.scale.toArray()).toEqual([0.1, 0.2, 0.3]);
    expect(b!.position.y).toBeCloseTo(0.5);
    expect(b!.scale.y).toBeCloseTo(1);
    expect(c!.scale.x).toBeCloseTo(0.3);
    expect(d!.geometry).not.toBe(c!.geometry); // a capped sphere has its own shape
    eq.update([box('e', [0, 0, 0], [1, 1, 1], 'pad')]);
    expect((eq.group.children[4] as import('three').Mesh).geometry).toBe(a!.geometry);
  });
  it('moves existing meshes by id and hides the ones no longer listed', () => {
    const eq = createEquipment('props');
    eq.update([cyl('bar', [-10, 100, 0], [10, 100, 0], 1.5, 'chrome'), box('plate', [20, 100, 0], [2, 40, 40], 'plate')]);
    const bar = eq.group.getObjectByName('bar')!;
    eq.update([cyl('bar', [-10, 60, 0], [10, 60, 0], 1.5, 'chrome')]);
    expect(eq.group.getObjectByName('bar')).toBe(bar);
    expect(bar.position.y).toBeCloseTo(0.6);
    expect(eq.group.getObjectByName('plate')!.visible).toBe(false);
    eq.dispose();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/figure/math src/lib/figure/geometry/primitives.test.ts src/lib/figure/scene3d/equipment.test.ts`
Expected: FAIL — `fromTwoPairs`, `signedDistance`, `penetrationDepth` and `createEquipment` are not exported.

- [ ] **Step 4: Implement**

**Edit `src/lib/figure/math/quat.ts`** (1 change):

1. Replace

```ts
  return radToDeg(2 * Math.acos(Math.min(1, d)));
}
```

   with

```ts
  return radToDeg(2 * Math.acos(Math.min(1, d)));
}

/**
 * The rotation taking direction `from` onto `to` exactly, and turning about `to` so that `fromSide`
 * lands as close as possible to `toSide` (their parts perpendicular to `from` / `to`). Builds a body
 * part's orientation from two anatomical directions, e.g. where the fingers point and where the palm
 * faces. Throws when a side is parallel to its direction (it then picks no turn).
 */
export function fromTwoPairs(from: Vec3, fromSide: Vec3, to: Vec3, toSide: Vec3): Quat {
  const f = normalize(from);
  const t = normalize(to);
  const perp = (v: Vec3, axis: Vec3, name: string): Vec3 => {
    const d = dot(v, axis);
    const p: Vec3 = [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
    const l = Math.hypot(p[0], p[1], p[2]);
    if (!(l > 1e-9 * Math.max(1, Math.hypot(v[0], v[1], v[2])))) throw new Error(`fromTwoPairs: ${name} is parallel to its direction`);
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  const swing = fromUnitVectors(f, t);
  const have = perp(rotate(swing, perp(fromSide, f, 'fromSide')), t, 'fromSide');
  const want = perp(toSide, t, 'toSide');
  const turn = Math.atan2(dot(cross(have, want), t), dot(have, want));
  return normalizeQuat(multiply(fromAxisAngle(t, turn), swing));
}
```


**Replace `src/lib/figure/geometry/primitives.ts` with:**

```ts
import { type Vec3, add, cross, dot, length, normalize, scale, sub } from '../math/vec3';
import { conjugate, type Quat, rotate } from '../math/quat';

/** Surface kinds; the 3D layer maps each to a material. */
export type SurfaceKind =
  | 'frame'
  | 'chrome'
  | 'plate'
  | 'stop'
  | 'catch'
  | 'carriage'
  /** Upholstered pads (bench, hold-down, rower seat). */
  | 'pad'
  /** Black rubber: bumper plates, dumbbell heads, feet, wheels. */
  | 'rubber'
  /** Knurled or foam handle grips. */
  | 'grip'
  /** Steel cable. */
  | 'cable'
  /** Braided rope (the rope attachment). */
  | 'rope'
  | 'foam'
  | 'band'
  | 'ball'
  | 'dome'
  /** Housings and consoles of cardio machines. */
  | 'plastic'
  | 'belt';

export type Primitive =
  /** `rotation` turns the box about its centre (default: axis-aligned). */
  | { kind: 'box'; id: string; center: Vec3; size: Vec3; surface: SurfaceKind; rotation?: Quat }
  | { kind: 'cylinder'; id: string; start: Vec3; end: Vec3; radius: number; surface: SurfaceKind }
  /** `capBelowY`: the part below this height is cut off, leaving a dome with a flat base. */
  | { kind: 'sphere'; id: string; center: Vec3; radius: number; surface: SurfaceKind; capBelowY?: number };

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

function boxCorners(p: Extract<Primitive, { kind: 'box' }>): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        const local: Vec3 = [sx * p.size[0], sy * p.size[1], sz * p.size[2]];
        out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
      }
    }
  }
  return out;
}

export function aabbOf(p: Primitive): Aabb {
  if (p.kind === 'box') {
    if (!p.rotation) {
      const h: Vec3 = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
      return {
        min: [p.center[0] - h[0], p.center[1] - h[1], p.center[2] - h[2]],
        max: [p.center[0] + h[0], p.center[1] + h[1], p.center[2] + h[2]],
      };
    }
    const c = boxCorners(p);
    return {
      min: [0, 1, 2].map((i) => Math.min(...c.map((v) => v[i]!))) as unknown as Vec3,
      max: [0, 1, 2].map((i) => Math.max(...c.map((v) => v[i]!))) as unknown as Vec3,
    };
  }
  if (p.kind === 'sphere') {
    const r = p.radius;
    const floor = Math.max(p.center[1] - r, p.capBelowY ?? -Infinity);
    return { min: [p.center[0] - r, floor, p.center[2] - r], max: [p.center[0] + r, p.center[1] + r, p.center[2] + r] };
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

/**
 * Signed distance from a point to a primitive's surface (cm): negative inside, positive outside. Exact
 * for boxes, capped cylinders and spheres; a capped sphere is the sphere cut by the plane at `capBelowY`.
 */
export function signedDistance(p: Primitive, point: Vec3): number {
  if (p.kind === 'box') {
    const local = sub(point, p.center);
    const q = p.rotation ? rotate(conjugate(p.rotation), local) : local;
    const d = [0, 1, 2].map((i) => Math.abs(q[i]!) - p.size[i]! / 2);
    const outside = Math.hypot(...d.map((v) => Math.max(v, 0)));
    return outside + Math.min(Math.max(d[0]!, d[1]!, d[2]!), 0);
  }
  if (p.kind === 'sphere') {
    const ball = length(sub(point, p.center)) - p.radius;
    return p.capBelowY === undefined ? ball : Math.max(ball, p.capBelowY - point[1]);
  }
  const axis = sub(p.end, p.start);
  const h = length(axis);
  const u = scale(axis, 1 / h);
  const rel = sub(point, p.start);
  const along = dot(rel, u);
  const radial = length(sub(rel, scale(u, along)));
  const dr = radial - p.radius;
  const dh = Math.abs(along - h / 2) - h / 2;
  return Math.min(Math.max(dr, dh), 0) + Math.hypot(Math.max(dr, 0), Math.max(dh, 0));
}

/**
 * Points on a primitive's surface (its corners, rims and caps), for overlap checks that must be tighter
 * than bounding boxes: a primitive overlaps another when one of its samples is inside it.
 */
export function surfaceSamples(p: Primitive): Vec3[] {
  if (p.kind === 'box') {
    const out = boxCorners(p);
    for (const [i, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as const) {
      const local: Vec3 = [0, 0, 0].map((_, k) => (k === i ? (s * p.size[k]!) / 2 : 0)) as unknown as Vec3;
      out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
    }
    return out;
  }
  if (p.kind === 'sphere') {
    const out: Vec3[] = [add(p.center, [0, p.radius, 0]), add(p.center, [0, -p.radius, 0])];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      for (const el of [-Math.PI / 4, 0, Math.PI / 4]) {
        out.push(add(p.center, scale([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], p.radius)));
      }
    }
    return p.capBelowY === undefined ? out : out.filter((v) => v[1] >= p.capBelowY!);
  }
  const axis = normalize(sub(p.end, p.start));
  const ref: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, ref));
  const v = cross(axis, u);
  const out: Vec3[] = [];
  for (const t of [0, 0.5, 1]) {
    const c = add(p.start, scale(sub(p.end, p.start), t));
    out.push(c);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      out.push(add(c, add(scale(u, Math.cos(a) * p.radius), scale(v, Math.sin(a) * p.radius))));
    }
  }
  return out;
}

/** How deep `a` reaches into `b` (cm, ≥ 0), from `a`'s surface samples. */
export function penetrationDepth(a: Primitive, b: Primitive): number {
  return Math.max(0, ...surfaceSamples(a).map((s) => -signedDistance(b, s)));
}
```

**Replace `src/lib/figure/scene3d/equipment.ts` with:**

```ts
import * as THREE from 'three';
import type { Primitive, SurfaceKind } from '../geometry/primitives';
import { CM } from './units';

const SURFACES: Record<SurfaceKind, THREE.MeshStandardMaterialParameters> = {
  frame: { color: '#2b2d31', roughness: 0.55, metalness: 0.35 },
  chrome: { color: '#d7dade', roughness: 0.18, metalness: 0.9 },
  plate: { color: '#34363b', roughness: 0.8 },
  stop: { color: '#c0392b', roughness: 0.6 },
  catch: { color: '#e0a13a', roughness: 0.6 },
  carriage: { color: '#55585e', roughness: 0.5, metalness: 0.4 },
  pad: { color: '#1f2023', roughness: 0.7 },
  rubber: { color: '#26272a', roughness: 0.9 },
  grip: { color: '#3a3b3f', roughness: 0.75, metalness: 0.2 },
  cable: { color: '#9ea2a8', roughness: 0.35, metalness: 0.8 },
  rope: { color: '#2d2f33', roughness: 0.95 },
  foam: { color: '#3f4a5a', roughness: 0.95 },
  band: { color: '#4f8a5b', roughness: 0.65 },
  ball: { color: '#7c8a99', roughness: 0.45 },
  dome: { color: '#5a7fa8', roughness: 0.55 },
  plastic: { color: '#3b3e44', roughness: 0.5, metalness: 0.1 },
  belt: { color: '#18191b', roughness: 0.95 },
};

/** Radial segments of every cylinder (rails, bars, plates) and of spheres. */
const CYLINDER_SEGMENTS = 32;

/** Parts that travel with the Smith bar; all are built centred at the bar height. */
const MOVING = /^(bar$|plate-|carriage-)/;

/**
 * Meshes are built from shared unit shapes (a 1 cm box, cylinder and sphere scaled per primitive), so a
 * moving part is updated by setting its transform — no geometry is rebuilt while the figure animates.
 */
export interface EquipmentMeshes {
  group: THREE.Group;
  update(prims: readonly Primitive[]): void;
  dispose(): void;
}

export function createEquipment(name: string): EquipmentMeshes {
  const group = new THREE.Group();
  group.name = name;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<SurfaceKind, THREE.Material>();
  const geometry = (key: string, make: () => THREE.BufferGeometry) => {
    let g = geometries.get(key);
    if (!g) geometries.set(key, (g = make()));
    return g;
  };
  const material = (k: SurfaceKind) => {
    let m = materials.get(k);
    if (!m) materials.set(k, (m = new THREE.MeshStandardMaterial(SURFACES[k])));
    return m;
  };
  const shapeKey = (p: Primitive) => (p.kind === 'sphere' && p.capBelowY !== undefined ? `sphere-cap-${((p.capBelowY - p.center[1]) / p.radius).toFixed(3)}` : p.kind);
  const make = (p: Primitive): THREE.BufferGeometry => {
    if (p.kind === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (p.kind === 'cylinder') return new THREE.CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS);
    if (p.capBelowY === undefined) return new THREE.SphereGeometry(1, CYLINDER_SEGMENTS, CYLINDER_SEGMENTS / 2);
    const cut = Math.acos(Math.min(1, Math.max(-1, (p.capBelowY - p.center[1]) / p.radius)));
    return new THREE.SphereGeometry(1, CYLINDER_SEGMENTS * 2, CYLINDER_SEGMENTS, 0, 2 * Math.PI, 0, cut);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.Mesh, p: Primitive) => {
    if (p.kind === 'box') {
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
      mesh.quaternion.set(...(p.rotation ?? ([0, 0, 0, 1] as const)));
      mesh.scale.set(p.size[0] * CM, p.size[1] * CM, p.size[2] * CM);
    } else if (p.kind === 'cylinder') {
      const a = new THREE.Vector3(...p.start).multiplyScalar(CM);
      const b = new THREE.Vector3(...p.end).multiplyScalar(CM);
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      mesh.scale.set(p.radius * CM, a.distanceTo(b), p.radius * CM);
    } else {
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
      mesh.quaternion.identity();
      mesh.scale.setScalar(p.radius * CM);
    }
  };
  const meshes = new Map<string, THREE.Mesh>();
  return {
    group,
    update(prims) {
      const seen = new Set<string>();
      for (const p of prims) {
        seen.add(p.id);
        let mesh = meshes.get(p.id);
        const key = shapeKey(p);
        if (!mesh || mesh.userData.shape !== key || mesh.material !== material(p.surface)) {
          if (mesh) group.remove(mesh);
          mesh = new THREE.Mesh(geometry(key, () => make(p)), material(p.surface));
          mesh.name = p.id;
          mesh.userData.shape = key;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          meshes.set(p.id, mesh);
          group.add(mesh);
        }
        place(mesh, p);
        mesh.visible = true;
      }
      for (const [id, mesh] of meshes) if (!seen.has(id)) mesh.visible = false;
    },
    dispose() {
      for (const g of geometries.values()) g.dispose();
      for (const m of materials.values()) m.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}

/** Build a static group of equipment (kept for callers that do not animate it). */
export function buildEquipment(prims: readonly Primitive[]): THREE.Group {
  const eq = createEquipment('equipment');
  eq.update(prims);
  return eq.group;
}

/** Move the bar, plates and carriages to a new bar height without rebuilding. */
export function setBarHeight(group: THREE.Group, barHeightCm: number): void {
  for (const child of group.children) if (MOVING.test(child.name)) child.position.y = barHeightCm * CM;
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/figure && npm run lint && npm run check`
Expected: every figure test passes (math 28, primitives 11, scene3d equipment 2, and the M1 files unchanged — `human.test.ts` still covers `buildEquipment` and `setBarHeight`); 0 lint and type errors.

- [ ] **Step 6: Check the M1 frames did not change**

```bash
npm run render:figures
node -e '
const sharp = require("sharp");
(async () => {
  let bad = 0;
  for (const i of [0, 1, 2]) {
    const a = await sharp(`.cache/m1-baseline/frame-${i}.webp`).raw().toBuffer();
    const b = await sharp(`public/figures/smith-squat/frame-${i}.webp`).raw().toBuffer();
    let over = 0, max = 0;
    for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d > 8) over++; if (d > max) max = d; }
    const share = a.length === b.length ? over / a.length : 1;
    console.log(`frame-${i}: max ${max}, ${(share * 100).toFixed(3)}% of values off by more than 8`);
    if (share > 0.001) bad++;
  }
  process.exit(bad);
})();'
```
Expected: exit 0 — the unit-shape meshes draw the same geometry, so at most 0.1% of the channel values (edge pixels) differ by more than 8 levels. (Dry run, through Task 14: frame 0 max 15 and 0.012%, frame 1 max 6, frame 2 identical.) Task 6 runs the same check again.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/math src/lib/figure/geometry/primitives.ts src/lib/figure/geometry/primitives.test.ts src/lib/figure/scene3d/equipment.ts src/lib/figure/scene3d/equipment.test.ts
git commit -m $'feat(figure): add rotated boxes, spheres, signed distances and a reusable mesh builder\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure primitives, signed distances and the mesh builder" \
  --body $'Adds the primitive shapes and distance queries the equipment builders and validators need, and builds meshes from shared unit shapes so moving props are updated by transform.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** boxes can be rotated, spheres capped, signed distances and penetration depths are exact on the tested shapes, meshes update by id without rebuilding, and the M1 Smith-squat frames are unchanged.

---
### Task 2: Equipment builders — free weights, accessories, cardio machines, attachments

Every v1 equipment class and attachment needs a builder (spec §5.1, §5.2, §8.2). This task adds the ones that are self-contained: hand-held implements built where the pose puts them (a centre and an axis), floor accessories built at the origin and placed, cardio machines, and the cable attachments built between the hands and the cable. A builder returns a `Built`: its primitives, named anchors poses can refer to (`exercise-ball.top`) and named surfaces a body can rest on (`exercise-ball`). All dimensions are typical drawing values (D12), not anyone's equipment.

**Files:**
- Create: `src/lib/figure/geometry/built.ts`, `src/lib/figure/geometry/implements.ts`, `src/lib/figure/geometry/cardio.ts`
- Test: `src/lib/figure/geometry/implements.test.ts`

**Interfaces:**
- Consumes: Task 1 `Primitive`, `SurfaceKind`, `aabbOf`; `fromAxisAngle`, `rotate`, `multiply`.
- Produces:
  - `built.ts`: `Surface` (`{ kind: 'plane'; point; normal; primitive? }` | `{ kind: 'sphere'; center; radius; primitive? }`), `Built { prims; anchors: Record<string, Vec3>; surfaces: Record<string, Surface> }`, `Placement { at: Vec3; yawDeg? }`, `emptyBuilt()`, `box()`, `cyl()`, `sphere()`, `cylAlong()`, `placeBuilt(b, placement)`, `mergeBuilt(...parts)` (throws on duplicate ids), `FLOOR`.
  - `implements.ts`: `DUMBBELL`, `buildDumbbell(id, center, axis)`, `BARBELL`, `buildBarbell(id, center, axis?)`, `AB_WHEEL`, `AB_WHEEL_GRIP_OFFSET_CM`, `buildAbWheel(id, center)`, `buildBand(id, path)`, `FOAM_ROLLER`/`buildFoamRoller()`, `MASSAGE_BALL`/`buildMassageBall()`, `EXERCISE_BALL`/`buildExerciseBall()` (anchors `exercise-ball.top`, `exercise-ball.center`; surface `exercise-ball`), `BALANCE_TRAINER`/`buildBalanceTrainer()`, `cableLine(id, pulley, attach)`, `attachPoint(grips, pulley, reachCm)`, `ROPE`, `buildRope(id, grips, pulley)`, `buildSingleHandle(id, grip, across, pulley)`, `buildCloseGripHandle(id, grips, across, pulley)`, `buildLatBar(id, grips, pulley)`, `buildAnkleStrap(id, ankle, along, pulley)` — the four attachment builders return `{ prims; attach }`.
  - `cardio.ts`: `TREADMILL`/`buildTreadmill()`, `ROWER`/`buildRowingMachine()`, `BIKE`/`buildExerciseBike()`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-equipment-free-weights
```

- [ ] **Step 2: Write the failing test**

**Create `src/lib/figure/geometry/implements.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { box, mergeBuilt, placeBuilt } from './built';
import { buildExerciseBike, buildRowingMachine, buildTreadmill } from './cardio';
import {
  AB_WHEEL,
  AB_WHEEL_GRIP_OFFSET_CM,
  BARBELL,
  buildAbWheel,
  buildBalanceTrainer,
  buildBand,
  buildBarbell,
  buildDumbbell,
  buildExerciseBall,
  buildRope,
  DUMBBELL,
  ROPE,
} from './implements';
import { aabbOf, type Primitive } from './primitives';

const ids = (prims: readonly Primitive[]) => prims.map((p) => p.id);
const unique = (prims: readonly Primitive[]) => new Set(ids(prims)).size === prims.length;
const lowest = (prims: readonly Primitive[]) => Math.min(...prims.map((p) => aabbOf(p).min[1]));

describe('placeBuilt and mergeBuilt', () => {
  const b = { prims: [box('b', [10, 5, 0], [2, 2, 2], 'frame')], anchors: { 'x.a': [10, 5, 0] as const }, surfaces: { 'x.s': { kind: 'plane' as const, point: [0, 5, 0] as const, normal: [1, 0, 0] as const } } };
  it('turns about +Y, then moves, prims, anchors and surfaces alike', () => {
    const p = placeBuilt(b, { at: [0, 0, 100], yawDeg: 90 });
    expect(p.anchors['x.a']![0]).toBeCloseTo(0);
    expect(p.anchors['x.a']![2]).toBeCloseTo(90);
    const s = p.surfaces['x.s']!;
    expect(s.kind === 'plane' && s.normal[2]).toBeCloseTo(-1);
  });
  it('refuses duplicate ids', () => {
    expect(() => mergeBuilt(b, b)).toThrow(/duplicate primitive "b"/);
  });
});

describe('implements', () => {
  it('builds a dumbbell centred on the grip along the handle', () => {
    const d = buildDumbbell('d', [0, 50, 0], [0, 0, 1]);
    const a = aabbOf(d.find((p) => p.id === 'd-head-a')!);
    expect(a.max[2]).toBeCloseTo(DUMBBELL.handleLengthCm / 2 + DUMBBELL.headLengthCm);
  });
  it('builds a 2.2 m barbell whose plates reach the floor when it rests on it', () => {
    const b = buildBarbell('b', [0, BARBELL.plateRadiusCm, 0]);
    expect(lowest(b)).toBeCloseTo(0);
    expect(Math.max(...b.map((p) => aabbOf(p).max[0]))).toBeCloseTo(BARBELL.lengthCm / 2);
  });
  it('puts the ab wheel handles where the hands hold them', () => {
    const w = buildAbWheel('w', [0, AB_WHEEL.wheelRadiusCm, 0]);
    expect(lowest(w)).toBeCloseTo(0);
    const grip = w.find((p) => p.id === 'w-grip-a')!;
    expect(grip.kind === 'cylinder' && (grip.start[0] + grip.end[0]) / 2).toBeCloseTo(AB_WHEEL_GRIP_OFFSET_CM);
  });
  it('hangs the rope from a ring toward the pulley', () => {
    const { prims, attach } = buildRope('r', [[10, 100, 0], [-10, 100, 0]], [0, 200, 0]);
    expect(attach[1]).toBeCloseTo(100 + Math.sqrt(ROPE.strandCm ** 2 - 100));
    expect(prims.filter((p) => p.id.startsWith('r-strand'))).toHaveLength(2);
  });
  it('draws a band as two strands per segment and skips zero-length segments', () => {
    expect(buildBand('b', [[0, 0, 0], [0, 0, 0], [10, 0, 0]])).toHaveLength(2);
  });
  it('rests the balls on the floor', () => {
    expect(lowest(buildExerciseBall().prims)).toBeCloseTo(0);
    expect(lowest(buildBalanceTrainer().prims)).toBeCloseTo(0);
  });
});

describe('cardio machines', () => {
  it.each([buildTreadmill, buildRowingMachine, buildExerciseBike].map((f) => [f.name, f] as const))('%s has unique ids and stands on the floor', (_n, build) => {
    const b = build();
    expect(unique(b.prims)).toBe(true);
    expect(lowest(b.prims)).toBeGreaterThanOrEqual(-0.01);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/geometry/implements.test.ts`
Expected: FAIL — `Failed to resolve import "./built"`.

- [ ] **Step 4: Implement**

**Create `src/lib/figure/geometry/built.ts`:**

```ts
import { type Vec3, add, scale, sub } from '../math/vec3';
import { degToRad, fromAxisAngle, multiply, type Quat, rotate } from '../math/quat';
import type { Primitive, SurfaceKind } from './primitives';

/**
 * A flat or spherical surface a body part can rest on (floor, bench pad, ball). `primitive` names the
 * primitive it belongs to, so a declared contact is not also reported as the body sinking into it.
 */
export type Surface =
  | { kind: 'plane'; point: Vec3; normal: Vec3; primitive?: string }
  | { kind: 'sphere'; center: Vec3; radius: number; primitive?: string };

/**
 * What an equipment builder returns: its primitives, named points poses can refer to (`anchors`,
 * e.g. `bench.seat`) and named surfaces contacts can refer to. Ids and names are prefixed by the model.
 */
export interface Built {
  prims: Primitive[];
  anchors: Record<string, Vec3>;
  surfaces: Record<string, Surface>;
}

/** Where a model stands: a floor point (cm) and a turn about +Y (deg, + toward the figure's left). */
export interface Placement {
  at: Vec3;
  yawDeg?: number;
}

export const emptyBuilt = (): Built => ({ prims: [], anchors: {}, surfaces: {} });

export const box = (id: string, center: Vec3, size: Vec3, surface: SurfaceKind, rotation?: Quat): Primitive =>
  rotation ? { kind: 'box', id, center, size, surface, rotation } : { kind: 'box', id, center, size, surface };
export const cyl = (id: string, start: Vec3, end: Vec3, radius: number, surface: SurfaceKind): Primitive => ({ kind: 'cylinder', id, start, end, radius, surface });
export const sphere = (id: string, center: Vec3, radius: number, surface: SurfaceKind, capBelowY?: number): Primitive =>
  capBelowY === undefined ? { kind: 'sphere', id, center, radius, surface } : { kind: 'sphere', id, center, radius, surface, capBelowY };

/** Move a model built at the origin to its placement (turn about +Y, then translate). */
export function placeBuilt(b: Built, placement: Placement): Built {
  const q = fromAxisAngle([0, 1, 0], degToRad(placement.yawDeg ?? 0));
  const P = (v: Vec3): Vec3 => add(rotate(q, v), placement.at);
  const D = (v: Vec3): Vec3 => rotate(q, v);
  const prims = b.prims.map((p): Primitive => {
    if (p.kind === 'box') return box(p.id, P(p.center), p.size, p.surface, placement.yawDeg ? multiply(q, p.rotation ?? [0, 0, 0, 1]) : p.rotation);
    if (p.kind === 'cylinder') return cyl(p.id, P(p.start), P(p.end), p.radius, p.surface);
    const c = P(p.center);
    return sphere(p.id, c, p.radius, p.surface, p.capBelowY === undefined ? undefined : p.capBelowY + (c[1] - p.center[1]));
  });
  const anchors = Object.fromEntries(Object.entries(b.anchors).map(([k, v]) => [k, P(v)]));
  const surfaces = Object.fromEntries(
    Object.entries(b.surfaces).map(([k, s]): [string, Surface] => [
      k,
      s.kind === 'plane' ? { ...s, point: P(s.point), normal: D(s.normal) } : { ...s, center: P(s.center) },
    ]),
  );
  return { prims, anchors, surfaces };
}

/** Combine models into one scene; throws on a duplicate primitive id, anchor or surface. */
export function mergeBuilt(...parts: Built[]): Built {
  const out = emptyBuilt();
  for (const part of parts) {
    for (const p of part.prims) {
      if (out.prims.some((q) => q.id === p.id)) throw new Error(`mergeBuilt: duplicate primitive "${p.id}"`);
      out.prims.push(p);
    }
    for (const [k, v] of Object.entries(part.anchors)) {
      if (k in out.anchors) throw new Error(`mergeBuilt: duplicate anchor "${k}"`);
      out.anchors[k] = v;
    }
    for (const [k, v] of Object.entries(part.surfaces)) {
      if (k in out.surfaces) throw new Error(`mergeBuilt: duplicate surface "${k}"`);
      out.surfaces[k] = v;
    }
  }
  return out;
}

/** A cylinder from `center - axis·len/2` to `center + axis·len/2` (`axis` must be a unit vector). */
export const cylAlong = (id: string, center: Vec3, axis: Vec3, len: number, radius: number, surface: SurfaceKind): Primitive =>
  cyl(id, sub(center, scale(axis, len / 2)), add(center, scale(axis, len / 2)), radius, surface);

/** The floor: y = 0, facing up. Every scene has it. */
export const FLOOR: Surface = { kind: 'plane', point: [0, 0, 0], normal: [0, 1, 0] };
```

**Create `src/lib/figure/geometry/implements.ts`:**

```ts
import { type Vec3, add, cross, distance, length, midpoint, normalize, scale, sub } from '../math/vec3';
import { type Built, cyl, cylAlong, sphere } from './built';
import type { Primitive } from './primitives';

/**
 * Hand-held implements and floor accessories (cm). Drawing defaults only — NOT anyone's equipment (D12).
 * Implements are built where the pose puts them: a centre and a unit axis (the handle's length).
 */

export const DUMBBELL = { handleLengthCm: 13, handleRadiusCm: 1.6, headRadiusCm: 5.8, headLengthCm: 6.5 } as const;

/** A round rubber dumbbell centred on the grip, its handle along `axis`. */
export function buildDumbbell(id: string, center: Vec3, axis: Vec3): Primitive[] {
  const u = normalize(axis);
  const off = DUMBBELL.handleLengthCm / 2 + DUMBBELL.headLengthCm / 2;
  return [
    cylAlong(`${id}-handle`, center, u, DUMBBELL.handleLengthCm + 1, DUMBBELL.handleRadiusCm, 'grip'),
    cylAlong(`${id}-head-a`, add(center, scale(u, off)), u, DUMBBELL.headLengthCm, DUMBBELL.headRadiusCm, 'rubber'),
    cylAlong(`${id}-head-b`, add(center, scale(u, -off)), u, DUMBBELL.headLengthCm, DUMBBELL.headRadiusCm, 'rubber'),
  ];
}

/** Olympic barbell (2.2 m) with one bumper plate per side. */
export const BARBELL = { lengthCm: 220, shaftHalfCm: 65.5, shaftRadiusCm: 1.4, sleeveRadiusCm: 2.5, plateRadiusCm: 22.5, plateThicknessCm: 6.5 } as const;

export function buildBarbell(id: string, center: Vec3, axis: Vec3 = [1, 0, 0]): Primitive[] {
  const u = normalize(axis);
  const at = (d: number) => add(center, scale(u, d));
  const out: Primitive[] = [cyl(`${id}-shaft`, at(-BARBELL.shaftHalfCm), at(BARBELL.shaftHalfCm), BARBELL.shaftRadiusCm, 'chrome')];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'a' : 'b';
    out.push(cyl(`${id}-collar-${tag}`, at(s * BARBELL.shaftHalfCm), at(s * (BARBELL.shaftHalfCm + 3)), 3.4, 'chrome'));
    out.push(cyl(`${id}-sleeve-${tag}`, at(s * (BARBELL.shaftHalfCm + 3)), at((s * BARBELL.lengthCm) / 2), BARBELL.sleeveRadiusCm, 'chrome'));
    const p0 = BARBELL.shaftHalfCm + 4;
    out.push(cyl(`${id}-plate-${tag}`, at(s * p0), at(s * (p0 + BARBELL.plateThicknessCm)), BARBELL.plateRadiusCm, 'rubber'));
  }
  return out;
}

/** Ab wheel: a wheel on an axle with a handle each side. */
export const AB_WHEEL = { wheelRadiusCm: 9, wheelWidthCm: 6, handleLengthCm: 11, handleRadiusCm: 1.7 } as const;
/** Distance from the wheel's centre to the middle of each handle. */
export const AB_WHEEL_GRIP_OFFSET_CM = AB_WHEEL.wheelWidthCm / 2 + 1.5 + AB_WHEEL.handleLengthCm / 2;

export function buildAbWheel(id: string, center: Vec3): Primitive[] {
  const u: Vec3 = [1, 0, 0];
  const g = AB_WHEEL_GRIP_OFFSET_CM;
  return [
    cylAlong(`${id}-wheel`, center, u, AB_WHEEL.wheelWidthCm, AB_WHEEL.wheelRadiusCm, 'rubber'),
    cylAlong(`${id}-hub`, center, u, AB_WHEEL.wheelWidthCm + 0.6, 4, 'plastic'),
    cylAlong(`${id}-axle`, center, u, 2 * g + AB_WHEEL.handleLengthCm, 0.8, 'chrome'),
    cylAlong(`${id}-grip-a`, add(center, [g, 0, 0]), u, AB_WHEEL.handleLengthCm, AB_WHEEL.handleRadiusCm, 'grip'),
    cylAlong(`${id}-grip-b`, add(center, [-g, 0, 0]), u, AB_WHEEL.handleLengthCm, AB_WHEEL.handleRadiusCm, 'grip'),
  ];
}

/** A flat resistance band stretched along a path (two thin strands, as a loop band looks side on). */
export function buildBand(id: string, path: readonly Vec3[]): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (distance(a, b) < 0.5) continue;
    const d = normalize(sub(b, a));
    const side = normalize(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    for (const s of [0.8, -0.8]) out.push(cyl(`${id}-${i}-${s > 0 ? 'a' : 'b'}`, add(a, scale(side, s)), add(b, scale(side, s)), 0.55, 'band'));
  }
  return out;
}

/** A floor accessory's own primitives and anchors, built at the origin (see `placeBuilt`). */
export const FOAM_ROLLER = { radiusCm: 7.5, lengthCm: 90 } as const;
export function buildFoamRoller(): Built {
  const r = FOAM_ROLLER.radiusCm;
  return {
    prims: [cylAlong('foam-roller', [0, r, 0], [1, 0, 0], FOAM_ROLLER.lengthCm, r, 'foam')],
    anchors: { 'foam-roller.top': [0, 2 * r, 0] },
    surfaces: { 'foam-roller': { kind: 'plane', point: [0, 2 * r, 0], normal: [0, 1, 0], primitive: 'foam-roller' } },
  };
}

export const MASSAGE_BALL = { radiusCm: 3.5 } as const;
export function buildMassageBall(): Built {
  const r = MASSAGE_BALL.radiusCm;
  return { prims: [sphere('massage-ball', [0, r, 0], r, 'rubber')], anchors: { 'massage-ball.top': [0, 2 * r, 0] }, surfaces: {} };
}

export const EXERCISE_BALL = { radiusCm: 32.5 } as const;
export function buildExerciseBall(): Built {
  const r = EXERCISE_BALL.radiusCm;
  return {
    prims: [sphere('exercise-ball', [0, r, 0], r, 'ball')],
    anchors: { 'exercise-ball.top': [0, 2 * r, 0], 'exercise-ball.center': [0, r, 0] },
    surfaces: { 'exercise-ball': { kind: 'sphere', center: [0, r, 0], radius: r, primitive: 'exercise-ball' } },
  };
}

/** Half-dome balance trainer: a platform with an inflated dome (a sphere cap) on top. */
export const BALANCE_TRAINER = { baseRadiusCm: 31, platformCm: 4, domeHeightCm: 21 } as const;
export function buildBalanceTrainer(): Built {
  const { baseRadiusCm: a, platformCm: t, domeHeightCm: h } = BALANCE_TRAINER;
  const R = (a * a + h * h) / (2 * h);
  const cy = t + h - R;
  return {
    prims: [cyl('balance-trainer-platform', [0, 0, 0], [0, t, 0], a + 1, 'rubber'), sphere('balance-trainer-dome', [0, cy, 0], R, 'dome', t)],
    anchors: { 'balance-trainer.top': [0, t + h, 0] },
    surfaces: { 'balance-trainer': { kind: 'sphere', center: [0, cy, 0], radius: R, primitive: 'balance-trainer-dome' } },
  };
}

// ── Cable attachments (built between the grips and the cable) ─────────────────

/** Steel cable from the pulley to where the attachment hooks on. */
export const cableLine = (id: string, pulley: Vec3, attach: Vec3): Primitive => cyl(id, pulley, attach, 0.35, 'cable');

/** Where a two-handed attachment hooks on: from the middle of the grips, `reach` cm toward the pulley. */
export function attachPoint(grips: readonly Vec3[], pulley: Vec3, reachCm: number): Vec3 {
  const mid = grips.length === 1 ? grips[0]! : midpoint(grips[0]!, grips[1]!);
  const toward = sub(pulley, mid);
  return length(toward) < 1e-6 ? mid : add(mid, scale(normalize(toward), reachCm));
}

/** Rope: two strands from a ring to a knob beyond each grip. Returns the ring position too. */
export const ROPE = { strandCm: 34, radiusCm: 1.3 } as const;
export function buildRope(id: string, grips: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const half = distance(grips[0], grips[1]) / 2;
  const attach = attachPoint(grips, pulley, Math.sqrt(Math.max(4, ROPE.strandCm ** 2 - half * half)));
  const prims: Primitive[] = [sphere(`${id}-ring`, attach, 1.8, 'chrome')];
  grips.forEach((g, i) => {
    const d = normalize(sub(g, attach));
    const knob = add(g, scale(d, 4.5));
    prims.push(cyl(`${id}-strand-${i}`, attach, knob, ROPE.radiusCm, 'rope'));
    prims.push(sphere(`${id}-knob-${i}`, knob, 2.4, 'rubber'));
  });
  return { prims, attach };
}

/** Single D-handle: a grip across the hand and a frame to the cable. `across` is the hand's width axis. */
export function buildSingleHandle(id: string, grip: Vec3, across: Vec3, pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(across);
  const attach = attachPoint([grip], pulley, 10);
  const ends = [add(grip, scale(u, 6.5)), add(grip, scale(u, -6.5))];
  return {
    prims: [cylAlong(`${id}-grip`, grip, u, 12, 1.7, 'grip'), ...ends.map((e, i) => cyl(`${id}-side-${i}`, e, attach, 0.7, 'chrome')), sphere(`${id}-ring`, attach, 1.4, 'chrome')],
    attach,
  };
}

/** Close-grip (parallel) row handle: two neutral grips side by side, joined and hooked to the cable. */
export function buildCloseGripHandle(id: string, grips: readonly [Vec3, Vec3], across: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const attach = attachPoint(grips, pulley, 16);
  const prims: Primitive[] = [];
  grips.forEach((g, i) => {
    const u = normalize(across[i]!);
    prims.push(cylAlong(`${id}-grip-${i}`, g, u, 11, 1.7, 'grip'));
    for (const s of [1, -1]) prims.push(cyl(`${id}-frame-${i}-${s > 0 ? 'a' : 'b'}`, add(g, scale(u, s * 6)), attach, 0.9, 'frame'));
  });
  prims.push(sphere(`${id}-ring`, attach, 1.4, 'chrome'));
  return { prims, attach };
}

/** Lat pulldown bar: straight between the grips, with ends angled down, hooked on at its middle. */
export function buildLatBar(id: string, grips: readonly [Vec3, Vec3], pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(sub(grips[0], grips[1]));
  const mid = midpoint(grips[0], grips[1]);
  const half = distance(grips[0], grips[1]) / 2 + 12;
  const up = normalize(sub(pulley, mid));
  const down = scale(up, -1);
  const endA = add(mid, scale(u, half));
  const endB = add(mid, scale(u, -half));
  const attach = add(mid, scale(up, 6));
  return {
    prims: [
      cyl(`${id}-bar`, endA, endB, 1.4, 'chrome'),
      cyl(`${id}-end-a`, endA, add(add(endA, scale(u, 10)), scale(down, 9)), 1.4, 'chrome'),
      cyl(`${id}-end-b`, endB, add(add(endB, scale(u, -10)), scale(down, 9)), 1.4, 'chrome'),
      cyl(`${id}-hook`, mid, attach, 0.9, 'chrome'),
    ],
    attach,
  };
}

/** Ankle strap: a cuff around the ankle (`along` = the shank direction) with a D-ring toward the cable. */
export function buildAnkleStrap(id: string, ankle: Vec3, along: Vec3, pulley: Vec3): { prims: Primitive[]; attach: Vec3 } {
  const u = normalize(along);
  const attach = attachPoint([ankle], pulley, 8);
  return { prims: [cylAlong(`${id}-cuff`, add(ankle, scale(u, 4)), u, 7, 5.2, 'band'), cyl(`${id}-ring`, add(ankle, scale(u, 4)), attach, 0.6, 'chrome')], attach };
}
```

**Create `src/lib/figure/geometry/cardio.ts`:**

```ts
import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl, cylAlong } from './built';

/**
 * Cardio machines (cm), built at the origin facing +z (the user faces +z). Drawing defaults only — NOT
 * anyone's machine (D12). v1 poses no figure on them (spec §5.3); they appear in equipment views.
 */

export const TREADMILL = { lengthCm: 185, widthCm: 80, deckTopCm: 22, beltWidthCm: 50, beltLengthCm: 150 } as const;

/** Anchors: `treadmill.belt` (top centre of the belt). */
export function buildTreadmill(): Built {
  const { lengthCm: L, widthCm: W, deckTopCm: top, beltWidthCm: bw, beltLengthCm: bl } = TREADMILL;
  const back = -L / 2;
  const hoodZ = L / 2 - 16;
  const tilt = fromAxisAngle([1, 0, 0], degToRad(-25));
  const prims = [
    box('treadmill-deck', [0, top / 2 - 1, -8], [W - 6, top - 2, L - 34], 'plastic'),
    box('treadmill-belt', [0, top + 0.5, -8], [bw, 1, bl], 'belt'),
    box('treadmill-hood', [0, top + 4, hoodZ], [W, 16, 32], 'plastic'),
    box('treadmill-console', [0, 132, hoodZ + 12], [W - 10, 8, 28], 'plastic', tilt),
  ];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'left' : 'right';
    prims.push(box(`treadmill-rail-${tag}`, [s * (bw / 2 + 7), top + 1, -8], [13, 2, bl], 'rubber'));
    prims.push(cyl(`treadmill-upright-${tag}`, [s * (W / 2 - 6), top + 6, hoodZ], [s * (W / 2 - 6), 128, hoodZ + 10], 3.2, 'frame'));
    prims.push(cyl(`treadmill-handrail-${tag}`, [s * (W / 2 - 6), 106, hoodZ + 6], [s * (W / 2 - 6), 104, hoodZ - 34], 1.8, 'grip'));
    prims.push(box(`treadmill-foot-${tag}`, [s * (W / 2 - 8), 2, back + 6], [8, 4, 8], 'rubber'));
  }
  return { prims, anchors: { 'treadmill.belt': [0, top + 1, -8] }, surfaces: { 'treadmill.belt': { kind: 'plane', point: [0, top + 1, -8], normal: [0, 1, 0], primitive: 'treadmill-belt' } } };
}

export const ROWER = { railTopCm: 38, fanRadiusCm: 30, fanZCm: 105, rearZCm: -135 } as const;

/** Air rower. Anchors: `rower.seat` (top of the seat at the catch), `rower.handle` (handle centre at rest), `rower.footplates`. */
export function buildRowingMachine(): Built {
  const { railTopCm: top, fanRadiusCm: fr, fanZCm: fz, rearZCm: rz } = ROWER;
  const fanY = fr + 14;
  const footTilt = fromAxisAngle([1, 0, 0], degToRad(-40));
  const prims = [
    box('rower-rail', [0, top - 4, (rz + fz - 30) / 2], [9, 8, fz - 30 - rz], 'chrome'),
    cylAlong('rower-fan', [0, fanY, fz], [1, 0, 0], 28, fr, 'plastic'),
    cylAlong('rower-fan-hub', [0, fanY, fz], [1, 0, 0], 32, 6, 'frame'),
    box('rower-front-frame', [0, (top + fanY) / 2, fz - 26], [12, fanY - top + 20, 10], 'frame'),
    cylAlong('rower-front-foot', [0, 3, fz + 10], [1, 0, 0], 60, 3, 'frame'),
    box('rower-rear-leg', [0, top / 2, rz + 4], [8, top, 8], 'frame'),
    cylAlong('rower-rear-foot', [0, 3, rz + 4], [1, 0, 0], 50, 3, 'frame'),
    box('rower-seat', [0, top + 3, -10], [30, 6, 28], 'pad'),
    cylAlong('rower-handle', [0, fanY + 4, fz - 38], [1, 0, 0], 52, 1.6, 'grip'),
    cyl('rower-chain', [0, fanY + 4, fz - 38], [0, fanY, fz - fr + 2], 0.5, 'cable'),
  ];
  for (const s of [1, -1]) prims.push(box(`rower-footplate-${s > 0 ? 'left' : 'right'}`, [s * 9, top + 6, fz - 60], [14, 3, 30], 'plastic', footTilt));
  return {
    prims,
    anchors: { 'rower.seat': [0, top + 6, -10], 'rower.handle': [0, fanY + 4, fz - 38], 'rower.footplates': [0, top + 6, fz - 60] },
    surfaces: { 'rower.seat': { kind: 'plane', point: [0, top + 6, -10], normal: [0, 1, 0], primitive: 'rower-seat' } },
  };
}

export const BIKE = { saddleTopCm: 100, flywheelRadiusCm: 23 } as const;

/** Indoor exercise bike. Anchors: `bike.saddle`, `bike.handlebars`, `bike.crank`. */
export function buildExerciseBike(): Built {
  const { saddleTopCm: saddle, flywheelRadiusCm: fw } = BIKE;
  const crank: [number, number, number] = [0, 32, 2];
  const prims = [
    cylAlong('bike-flywheel', [0, fw + 8, 42], [1, 0, 0], 5, fw, 'chrome'),
    box('bike-flywheel-guard', [0, fw + 18, 42], [9, 22, 30], 'plastic'),
    cylAlong('bike-front-foot', [0, 3, 55], [1, 0, 0], 52, 3, 'frame'),
    cylAlong('bike-rear-foot', [0, 3, -50], [1, 0, 0], 52, 3, 'frame'),
    cyl('bike-base', [0, 5, -50], [0, 5, 55], 3, 'frame'),
    cyl('bike-down-tube', [0, 5, 30], [0, 98, 30], 3.5, 'frame'),
    cyl('bike-seat-tube', [0, 5, -30], [0, saddle - 6, -24], 3.5, 'frame'),
    cyl('bike-top-tube', [0, 70, -26], [0, 80, 30], 3, 'frame'),
    box('bike-saddle', [0, saddle - 2.5, -22], [16, 5, 27], 'pad'),
    cylAlong('bike-handlebar', [0, 108, 36], [1, 0, 0], 46, 1.6, 'grip'),
    cyl('bike-stem', [0, 98, 30], [0, 108, 36], 2.5, 'frame'),
    cylAlong('bike-crank-axle', crank, [1, 0, 0], 16, 2, 'chrome'),
  ];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'left' : 'right';
    const pedal: [number, number, number] = [s * 11, crank[1] - s * 14, crank[2] + s * 5];
    prims.push(cyl(`bike-crank-${tag}`, [s * 8, crank[1], crank[2]], pedal, 1.2, 'chrome'));
    prims.push(box(`bike-pedal-${tag}`, [s * 14, pedal[1], pedal[2]], [9, 2.5, 11], 'rubber'));
  }
  return { prims, anchors: { 'bike.saddle': [0, saddle, -22], 'bike.handlebars': [0, 108, 36], 'bike.crank': crank }, surfaces: {} };
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/figure/geometry && npm run lint && npm run check`
Expected: `implements.test.ts` 11 passed; the other geometry tests still pass; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/geometry/built.ts src/lib/figure/geometry/implements.ts src/lib/figure/geometry/cardio.ts src/lib/figure/geometry/implements.test.ts
git commit -m $'feat(figure): build free weights, accessories, cardio machines and cable attachments\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Equipment builders: free weights, accessories, cardio machines, attachments" \
  --body $'Parametric builders for the hand-held implements, floor accessories, cardio machines and cable attachments, with anchors and surfaces for poses.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** every free weight, accessory, cardio machine and cable attachment builds with unique ids, rests on the floor where it should, and exposes the anchors and surfaces its poses use.

---
### Task 3: Equipment builders — trainer, bench, scenes and the model registry

The Smith machine + functional trainer grows from the M1 Smith rack into the full generic all-in-one (controller decision 8): pulley carriages with high/chest/low settings, side weight stacks, a pull-up bar, and the optional J-hooks, spotter arms, roller hold-down and row footplate. `buildSmith` and `ILLUSTRATIVE_SMITH` stay as they are; the trainer calls them. The adjustable bench locks at the content's backrest angles. A figure's fixed equipment is a `SceneSpec`; `buildScene` merges it with the floor. `EQUIPMENT_MODELS` is the registry content `model3d` ids refer to: one entry per v1 equipment class and attachment, each drawn alone with illustrative dimensions for equipment views and stills, framed automatically, and stating the typical values it draws.

**Files:**
- Create: `src/lib/figure/geometry/trainer.ts`, `src/lib/figure/geometry/bench.ts`, `src/lib/figure/geometry/scene.ts`, `src/lib/figure/geometry/models.ts`
- Test: `src/lib/figure/geometry/stations.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Built`, builders), Task 1 (`Primitive`, `aabbOf`), M1 `buildSmith`, `catchHeightFor`, `ILLUSTRATIVE_SMITH`, `SmithParams`.
- Produces:
  - `trainer.ts`: `PulleyHeight = 'high' | 'chest' | 'low'`, `ColumnSide = 'left' | 'right'`, `TrainerParams extends SmithParams` (+ `pullUpBarHeightCm`, `pullUpBarForwardCm`, `pullUpBarRadiusCm`, `pulleyHeightsCm`, `pulleyRadiusCm`, `holdDownPadTopCm`), `ILLUSTRATIVE_TRAINER`, `TrainerState` (`barHeightCm?`, `catchHeightCm?`, `pulleys?`, `jHookHeightCm?`, `spotterArmHeightCm?`, `holdDown?`, `footplate?`), `uprightX`, `frontZ`, `pulleyPoint(p, side, height)`, `smithPart(p)`, `smithMovingParts(p, barHeightCm)`, `trainerProblems(p)`, `buildTrainer(p, state)` — anchors `smith.rail`, `smith.bar`, `pullup.bar`, `cable.<side>.<height>`, `hold-down.pad`, `hold-down.roller`, `footplate`; surfaces `hold-down.pad`, `footplate`.
  - `bench.ts`: `BenchParams`, `ILLUSTRATIVE_BENCH`, `BENCH_ANGLES_DEG`, `benchProblems(p, angle)`, `buildBench(p, angleDeg)` — anchors `bench.seat`, `bench.hinge`, `bench.back`, `bench.head`; surfaces `bench.seat`, `bench.back`.
  - `scene.ts`: `FLOOR_ITEMS`, `FloorItem`, `SceneSpec { trainer?: TrainerState; bench?: { at; yawDeg?; angleDeg }; items? }`, `SceneParams { trainer; bench }`, `ILLUSTRATIVE_SCENE`, `sceneParamsWith(over)`, `buildScene(spec, params?)` (anchor `floor`, surface `floor` always).
  - `models.ts`: `ModelView`, `EquipmentModel { id; kind: 'equipment' | 'attachment'; build(); view; drawsWith? }`, `fitView(b, azimuthDeg?, elevationDeg?)`, `EQUIPMENT_MODELS`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-equipment-stations
```

- [ ] **Step 2: Write the failing test**

**Create `src/lib/figure/geometry/stations.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { buildBench, benchProblems, ILLUSTRATIVE_BENCH } from './bench';
import { EQUIPMENT_MODELS } from './models';
import { aabbOf, type Primitive } from './primitives';
import { buildScene, ILLUSTRATIVE_SCENE, sceneParamsWith } from './scene';
import { buildTrainer, ILLUSTRATIVE_TRAINER, pulleyPoint, smithMovingParts, trainerProblems } from './trainer';

const ids = (prims: readonly Primitive[]) => prims.map((p) => p.id);
const unique = (prims: readonly Primitive[]) => new Set(ids(prims)).size === prims.length;
const lowest = (prims: readonly Primitive[]) => Math.min(...prims.map((p) => aabbOf(p).min[1]));

describe('trainer', () => {
  const t = buildTrainer(ILLUSTRATIVE_TRAINER, { barHeightCm: 120, catchHeightCm: 80, holdDown: true, footplate: true, jHookHeightCm: 130, spotterArmHeightCm: 70 });
  it('has unique ids and stands on the floor', () => {
    expect(unique(t.prims)).toBe(true);
    expect(lowest(t.prims)).toBeGreaterThanOrEqual(0);
  });
  it('puts the pull-up bar at its height, in front of the rack', () => {
    const bar = t.anchors['pullup.bar']!;
    expect(bar[1] + ILLUSTRATIVE_TRAINER.pullUpBarRadiusCm).toBeCloseTo(ILLUSTRATIVE_TRAINER.pullUpBarHeightCm);
    expect(bar[2]).toBeGreaterThan(ILLUSTRATIVE_TRAINER.rackInnerDepthCm / 2);
  });
  it('names a pulley for each column and setting, rising from low to high', () => {
    for (const side of ['left', 'right'] as const) {
      const [low, chest, high] = (['low', 'chest', 'high'] as const).map((h) => t.anchors[`cable.${side}.${h}`]![1]);
      expect(low!).toBeLessThan(chest!);
      expect(chest!).toBeLessThan(high!);
      expect(t.anchors[`cable.${side}.chest`]).toEqual(pulleyPoint(ILLUSTRATIVE_TRAINER, side, 'chest'));
    }
  });
  it('gives the hold-down and the footplate surfaces to rest on', () => {
    expect(t.surfaces['hold-down.pad']).toMatchObject({ kind: 'plane', normal: [0, 1, 0], primitive: 'hold-down-pad' });
    expect(t.anchors['hold-down.pad']![1]).toBe(ILLUSTRATIVE_TRAINER.holdDownPadTopCm);
    expect(t.surfaces.footplate?.kind).toBe('plane');
  });
  it('leaves the Smith bar out unless a bar height is given; the moving parts follow it', () => {
    const still = buildTrainer(ILLUSTRATIVE_TRAINER);
    expect(ids(still.prims)).not.toContain('bar');
    expect(ids(smithMovingParts(ILLUSTRATIVE_TRAINER, 100)).sort()).toEqual(['bar', 'carriage-left', 'carriage-right', 'plate-left', 'plate-right']);
  });
  it('reports impossible settings', () => {
    expect(trainerProblems({ ...ILLUSTRATIVE_TRAINER, pulleyHeightsCm: { low: 150, chest: 120, high: 195 } })).toContain('pulley heights must rise from low to chest to high');
    expect(() => buildTrainer({ ...ILLUSTRATIVE_TRAINER, pullUpBarHeightCm: 60 })).toThrow(/pull-up bar at 60 cm/);
  });
});

describe('bench', () => {
  it('puts the seat at its height and raises the backrest with the angle', () => {
    const flat = buildBench(ILLUSTRATIVE_BENCH, 0);
    const upright = buildBench(ILLUSTRATIVE_BENCH, 90);
    expect(flat.anchors['bench.seat']![1]).toBe(ILLUSTRATIVE_BENCH.seatHeightCm);
    expect(flat.anchors['bench.head']![1]).toBeCloseTo(ILLUSTRATIVE_BENCH.seatHeightCm);
    expect(upright.anchors['bench.head']![1]).toBeCloseTo(ILLUSTRATIVE_BENCH.seatHeightCm + ILLUSTRATIVE_BENCH.backrestLengthCm);
    const back = upright.surfaces['bench.back']!;
    expect(back.kind === 'plane' && back.normal[2]).toBeCloseTo(1);
    expect(unique(flat.prims) && lowest(flat.prims) >= 0).toBe(true);
  });
  it('only locks at the listed angles', () => {
    expect(benchProblems(ILLUSTRATIVE_BENCH, 20)).toEqual(['backrest angle 20° is not one the bench locks at (0, 15, 30, 45, 60, 75, 90)']);
    expect(() => buildBench(ILLUSTRATIVE_BENCH, 20)).toThrow(/20°/);
  });
});

describe('the model registry', () => {
  it('has a model for every v1 equipment class and attachment (spec §5.1, §5.2)', () => {
    const equipment = ['smith-functional-trainer', 'adjustable-bench', 'dumbbells', 'barbell', 'resistance-bands', 'treadmill', 'rowing-machine', 'exercise-bike', 'foam-roller', 'massage-ball', 'ab-wheel', 'exercise-ball', 'balance-trainer'];
    const attachments = ['rope', 'close-grip-row-handle', 'single-handle', 'lat-bar', 'ankle-strap', 'row-footplate', 'roller-hold-down'];
    expect(Object.values(EQUIPMENT_MODELS).filter((m) => m.kind === 'equipment').map((m) => m.id).sort()).toEqual([...equipment].sort());
    expect(Object.values(EQUIPMENT_MODELS).filter((m) => m.kind === 'attachment').map((m) => m.id).sort()).toEqual([...attachments].sort());
  });
  it.each(Object.keys(EQUIPMENT_MODELS))('%s builds with unique ids and a view that frames it', (id) => {
    const m = EQUIPMENT_MODELS[id]!;
    const b = m.build();
    expect(b.prims.length).toBeGreaterThan(0);
    expect(unique(b.prims)).toBe(true);
    expect(m.view.distanceCm).toBeGreaterThan(20);
  });
});

describe('buildScene', () => {
  it('always has the floor, and places the bench and floor items', () => {
    const s = buildScene({ bench: { at: [0, 0, 50], angleDeg: 30 }, items: [{ model: 'exercise-ball', at: [100, 0, 0] }] });
    expect(s.surfaces.floor).toMatchObject({ kind: 'plane', normal: [0, 1, 0] });
    expect(s.anchors['bench.hinge']![2]).toBe(50);
    expect(s.anchors['exercise-ball.top']).toEqual([100, 65, 0]);
  });
  it('draws with illustrative dimensions unless some are replaced', () => {
    expect(sceneParamsWith().trainer).toEqual(ILLUSTRATIVE_SCENE.trainer);
    const s = buildScene({ trainer: {} }, sceneParamsWith({ trainer: { pullUpBarHeightCm: 205 } }));
    expect(s.anchors['pullup.bar']![1] + ILLUSTRATIVE_TRAINER.pullUpBarRadiusCm).toBeCloseTo(205);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/geometry/stations.test.ts`
Expected: FAIL — `Failed to resolve import "./bench"`.

- [ ] **Step 4: Implement**

**Create `src/lib/figure/geometry/trainer.ts`:**

```ts
import type { Vec3 } from '../math/vec3';
import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl } from './built';
import type { Primitive } from './primitives';
import { buildSmith, catchHeightFor, ILLUSTRATIVE_SMITH, type SmithParams } from './smith';

/** Pulley settings, in words (spec §5.1: no hole numbers). */
export type PulleyHeight = 'high' | 'chest' | 'low';
export type ColumnSide = 'left' | 'right';

/**
 * The Smith machine + functional trainer (cm): the Smith rack of `SmithParams` plus a pulley carriage on
 * each front upright, a weight stack beside each side, a pull-up bar across the front, and the optional
 * J-hooks, spotter arms, roller hold-down and seated-row footplate.
 */
export interface TrainerParams extends SmithParams {
  /** Floor to the top of the pull-up bar (content parameter `pullUpBarHeightCm`). */
  pullUpBarHeightCm: number;
  /** How far the pull-up bar sits in front of the front uprights' centre line. */
  pullUpBarForwardCm: number;
  pullUpBarRadiusCm: number;
  /** Height of the pulley wheel's centre for each setting. */
  pulleyHeightsCm: Readonly<Record<PulleyHeight, number>>;
  pulleyRadiusCm: number;
  /** Top of the roller hold-down's kneeling pad. */
  holdDownPadTopCm: number;
}

/**
 * Drawing defaults — NOT measurements of anyone's machine (D12). The Smith part is `ILLUSTRATIVE_SMITH`;
 * the pull-up bar height equals the content's illustrative `pullUpBarHeightCm` (210).
 */
export const ILLUSTRATIVE_TRAINER: TrainerParams = {
  ...ILLUSTRATIVE_SMITH,
  pullUpBarHeightCm: 210,
  pullUpBarForwardCm: 16,
  pullUpBarRadiusCm: 1.6,
  pulleyHeightsCm: { high: 195, chest: 125, low: 22 },
  pulleyRadiusCm: 5,
  holdDownPadTopCm: 30,
};

export interface TrainerState {
  /** Draw the Smith bar, plates and carriages at this bar-centre height; omit to leave them to the pose (moving props). */
  barHeightCm?: number;
  /** Bar height at which the safety catches stop the bar; omit to draw no catches. */
  catchHeightCm?: number;
  /** Where each pulley carriage is set (default: both low). */
  pulleys?: Partial<Record<ColumnSide, PulleyHeight>>;
  jHookHeightCm?: number;
  spotterArmHeightCm?: number;
  holdDown?: boolean;
  footplate?: boolean;
}

/** X of the front uprights' centre lines, left (+X) and right (−X). */
export const uprightX = (p: SmithParams): number => p.rackInnerWidthCm / 2 + p.uprightSizeCm / 2;
/** Z of the front uprights' centre line. */
export const frontZ = (p: SmithParams): number => p.rackInnerDepthCm / 2 + p.uprightSizeCm / 2;
const sideSign = (s: ColumnSide) => (s === 'left' ? 1 : -1);

/** Centre of the pulley wheel of one column at a setting (it hangs in front of the upright). */
export function pulleyPoint(p: TrainerParams, side: ColumnSide, height: PulleyHeight): Vec3 {
  return [sideSign(side) * uprightX(p), p.pulleyHeightsCm[height], frontZ(p) + p.uprightSizeCm / 2 + 7];
}

const MOVING = /^(bar$|plate-|carriage-)/;

/** The Smith machine's own dimensions out of a trainer description (what `buildSmith` checks and draws). */
export function smithPart(p: SmithParams): SmithParams {
  return Object.fromEntries((Object.keys(ILLUSTRATIVE_SMITH) as Array<keyof SmithParams>).map((k) => [k, p[k]])) as unknown as SmithParams;
}

/** The Smith bar, plates and carriages at a bar height (the parts that move with the bar). */
export function smithMovingParts(p: SmithParams, barHeightCm: number): Primitive[] {
  return buildSmith(smithPart(p), { barHeightCm }).filter((q) => MOVING.test(q.id));
}

/** Everything wrong with a trainer description, as sentences (empty when it can be drawn). */
export function trainerProblems(p: TrainerParams): string[] {
  const out: string[] = [];
  const top = p.rackHeightCm - p.uprightSizeCm;
  if (!(p.pullUpBarHeightCm >= 100 && p.pullUpBarHeightCm <= p.rackHeightCm + 20)) {
    out.push(`pull-up bar at ${p.pullUpBarHeightCm} cm must be between 100 cm and 20 cm above the rack top`);
  }
  for (const [k, h] of Object.entries(p.pulleyHeightsCm)) {
    if (!(h - p.pulleyRadiusCm > 0 && h + p.pulleyRadiusCm < top)) out.push(`pulley "${k}" at ${h} cm must sit on the upright (0–${top} cm)`);
  }
  if (!(p.pulleyHeightsCm.low < p.pulleyHeightsCm.chest && p.pulleyHeightsCm.chest < p.pulleyHeightsCm.high)) out.push('pulley heights must rise from low to chest to high');
  if (!(p.holdDownPadTopCm >= 20 && p.holdDownPadTopCm <= 90)) out.push(`hold-down pad at ${p.holdDownPadTopCm} cm must be between 20 and 90 cm`);
  return out;
}

/**
 * The trainer's primitives, anchors and surfaces. Anchors: `smith.rail` (floor point on the bar path),
 * `smith.bar` (bar centre, when drawn), `smith.catch` (the bar height the catches stop, when drawn), `pullup.bar` (bar centre), `cable.<side>.<height>` (pulley wheel
 * centres), `hold-down.pad` (top centre of the pad), `hold-down.roller` (roller axis centre), `footplate`
 * (plate face centre). Surfaces: `hold-down.pad`, `footplate`.
 */
export function buildTrainer(p: TrainerParams, state: TrainerState = {}): Built {
  const problems = trainerProblems(p);
  if (problems.length) throw new Error(`buildTrainer: ${problems.join('; ')}`);
  const bar = state.barHeightCm ?? (p.lowestBarHeightCm + p.highestBarHeightCm) / 2;
  const smith = buildSmith(smithPart(p), { barHeightCm: bar, catchHeightCm: state.catchHeightCm });
  const prims = state.barHeightCm === undefined ? smith.filter((q) => !MOVING.test(q.id)) : smith;
  const u = p.uprightSizeCm;
  const X = uprightX(p);
  const Z = frontZ(p);
  const anchors: Record<string, Vec3> = { 'smith.rail': [0, 0, p.railZCm] };
  if (state.barHeightCm !== undefined) anchors['smith.bar'] = [0, bar, p.railZCm];
  if (state.catchHeightCm !== undefined) anchors['smith.catch'] = [0, state.catchHeightCm, p.railZCm];

  // Pull-up bar across the front, on two brackets from the front top beam.
  const pz = Z + p.pullUpBarForwardCm;
  const py = p.pullUpBarHeightCm - p.pullUpBarRadiusCm;
  prims.push(cyl('pullup-bar', [X + u / 2, py, pz], [-X - u / 2, py, pz], p.pullUpBarRadiusCm, 'chrome'));
  for (const s of [1, -1]) {
    prims.push(box(`pullup-bracket-${s > 0 ? 'left' : 'right'}`, [s * X, (py + p.rackHeightCm - u / 2) / 2, (Z + pz) / 2], [u * 0.6, p.rackHeightCm - u / 2 - py + 4, pz - Z], 'frame'));
  }
  anchors['pullup.bar'] = [0, py, pz];

  // A pulley carriage on each front upright, and a weight stack beside each side.
  for (const side of ['left', 'right'] as const) {
    const s = sideSign(side);
    const height = state.pulleys?.[side] ?? 'low';
    const wheel = pulleyPoint(p, side, height);
    prims.push(box(`pulley-carriage-${side}`, [wheel[0], wheel[1] + 3, Z + u / 2 + 2.5], [u + 2, 16, 5], 'carriage'));
    prims.push(cyl(`pulley-${side}`, [wheel[0] - 1.4, wheel[1], wheel[2]], [wheel[0] + 1.4, wheel[1], wheel[2]], p.pulleyRadiusCm, 'chrome'));
    prims.push(box(`pulley-fork-${side}`, [wheel[0], wheel[1] + p.pulleyRadiusCm + 1, (Z + u / 2 + wheel[2]) / 2], [4, 2, wheel[2] - Z - u / 2 + 1], 'frame'));
    for (const h of ['high', 'chest', 'low'] as const) anchors[`cable.${side}.${h}`] = pulleyPoint(p, side, h);
    const sx = s * (X + u / 2 + 22);
    const stackTop = p.rackHeightCm - 25;
    for (const dz of [-16, 16]) prims.push(box(`stack-post-${side}-${dz > 0 ? 'front' : 'back'}`, [sx, stackTop / 2, dz], [5, stackTop, 5], 'frame'));
    prims.push(box(`stack-top-${side}`, [sx, stackTop + 2.5, 0], [8, 5, 37], 'frame'));
    prims.push(box(`stack-base-${side}`, [sx, 2.5, 0], [30, 5, 45], 'frame'));
    prims.push(box(`stack-plates-${side}`, [sx, 5 + 32, 0], [26, 64, 12], 'plate'));
    for (const dz of [-8, 8]) prims.push(cyl(`stack-rod-${side}-${dz > 0 ? 'front' : 'back'}`, [sx, 5, dz], [sx, stackTop, dz], 1, 'chrome'));
    prims.push(box(`stack-arm-${side}`, [(sx + s * (X + u / 2)) / 2, stackTop + 2.5, 0], [Math.abs(sx) - X - u / 2, 5, 6], 'frame'));
  }

  if (state.jHookHeightCm !== undefined) {
    for (const s of [1, -1]) prims.push(box(`jhook-${s > 0 ? 'left' : 'right'}`, [s * (X - u / 2 - 2), state.jHookHeightCm, Z], [4, 8, 6], 'rubber'));
  }
  if (state.spotterArmHeightCm !== undefined) {
    for (const s of [1, -1]) {
      prims.push(box(`spotter-${s > 0 ? 'left' : 'right'}`, [s * (X - u / 2 - 4), state.spotterArmHeightCm, 0], [5, 5, 2 * Z + 20], 'frame'));
    }
  }

  const surfaces: Built['surfaces'] = {};
  if (state.holdDown) {
    // Fixed kneeling pad pinned to a front upright (the right one here), sticking out forward; rollers over its back end.
    const x = -X + u / 2 + 14;
    const top = p.holdDownPadTopCm;
    const zBack = Z + u / 2 + 18;
    const len = 54;
    const rollerZ = zBack + 1;
    const rollerY = top + 15;
    prims.push(box('hold-down-sleeve', [-X, top - 6, Z], [u + 3, 22, u + 3], 'frame'));
    prims.push(box('hold-down-arm', [(x - X) / 2, top - 10, Z + u / 2 + 3], [x + X + 6, 6, 6], 'frame'));
    prims.push(box('hold-down-rail', [x, top - 10, (Z + u / 2 + zBack + len) / 2], [6, 6, zBack + len - Z - u / 2], 'frame'));
    prims.push(box('hold-down-pad', [x, top - 3.5, zBack + len / 2], [32, 7, len], 'pad'));
    prims.push(box('hold-down-post', [x, (top + rollerY) / 2 - 3, rollerZ - 7], [4, rollerY - top + 12, 4], 'frame'));
    prims.push(box('hold-down-roller-arm', [x, rollerY, rollerZ - 3.5], [4, 4, 11], 'frame'));
    prims.push(cyl('hold-down-roller', [x - 15, rollerY, rollerZ], [x + 15, rollerY, rollerZ], 4.5, 'pad'));
    anchors['hold-down.pad'] = [x, top, zBack + len / 2];
    anchors['hold-down.roller'] = [x, rollerY, rollerZ];
    surfaces['hold-down.pad'] = { kind: 'plane', point: [x, top, zBack + len / 2], normal: [0, 1, 0], primitive: 'hold-down-pad' };
  }
  if (state.footplate) {
    // Seated-row footplate at the base of a column (the left one here), leaning back 20°; the cable runs through its notch.
    const tilt = fromAxisAngle([1, 0, 0], degToRad(-20));
    const c: Vec3 = [X - 2, 17, Z + u / 2 + 9];
    prims.push(box('footplate', c, [38, 30, 2.5], 'frame', tilt));
    prims.push(box('footplate-base', [X - 2, 2, Z + u / 2 + 6], [38, 4, 14], 'frame'));
    const normal: Vec3 = [0, Math.sin(degToRad(20)), Math.cos(degToRad(20))];
    const face: Vec3 = [c[0] + normal[0] * 1.25, c[1] + normal[1] * 1.25, c[2] + normal[2] * 1.25];
    anchors['footplate'] = face;
    surfaces['footplate'] = { kind: 'plane', point: face, normal, primitive: 'footplate' };
  }
  return { prims, anchors, surfaces };
}

/** Catch height for a set whose lowest bar position is `lowestRepBarCm` (re-exported for scenes). */
export { catchHeightFor };
```

**Create `src/lib/figure/geometry/bench.ts`:**

```ts
import { type Vec3, add, scale } from '../math/vec3';
import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl } from './built';

/**
 * Adjustable bench (cm). Built at the origin: the hinge between seat and backrest is at z = 0, the seat
 * runs toward +z, and the backrest lies toward −z when flat and rises toward +y as `angleDeg` grows
 * (0 = flat, 90 = upright). Seat height is the content parameter `seatHeightCm`.
 */
export interface BenchParams {
  seatHeightCm: number;
  seatLengthCm: number;
  backrestLengthCm: number;
  padWidthCm: number;
  padThicknessCm: number;
}

/** Drawing defaults — NOT anyone's bench (D12); seat height and backrest length equal the content's illustrative defaults. */
export const ILLUSTRATIVE_BENCH: BenchParams = { seatHeightCm: 43, seatLengthCm: 38, backrestLengthCm: 80, padWidthCm: 27, padThicknessCm: 7 };

/** Backrest angles the bench locks at (content parameter `backrestAnglesDeg`). */
export const BENCH_ANGLES_DEG = [0, 15, 30, 45, 60, 75, 90] as const;

export function benchProblems(p: BenchParams, angleDeg: number): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) if (!(Number.isFinite(v) && v > 0)) out.push(`${k} must be positive (got ${v})`);
  if (!(BENCH_ANGLES_DEG as readonly number[]).includes(angleDeg)) out.push(`backrest angle ${angleDeg}° is not one the bench locks at (${BENCH_ANGLES_DEG.join(', ')})`);
  if (p.seatHeightCm - p.padThicknessCm < 25) out.push(`seat height ${p.seatHeightCm} cm leaves no room for the frame`);
  return out;
}

/**
 * Anchors: `bench.seat` (top centre of the seat pad), `bench.hinge` (top of the pads at the hinge),
 * `bench.back` (top centre of the backrest pad), `bench.head` (top of the backrest's far end).
 * Surfaces: `bench.seat`, `bench.back`.
 */
export function buildBench(p: BenchParams, angleDeg: number): Built {
  const problems = benchProblems(p, angleDeg);
  if (problems.length) throw new Error(`buildBench: ${problems.join('; ')}`);
  const top = p.seatHeightCm;
  const t = p.padThicknessCm;
  const a = degToRad(angleDeg);
  const dir: Vec3 = [0, Math.sin(a), -Math.cos(a)];
  const normal: Vec3 = [0, Math.cos(a), Math.sin(a)];
  const hinge: Vec3 = [0, top, 0];
  const L = p.backrestLengthCm;
  const beamY = 26;
  const rearZ = -0.62 * L;
  const frontZ = p.seatLengthCm + 6;
  const strutTop = add(hinge, add(scale(dir, 0.42 * L), scale(normal, -t)));
  const prims = [
    box('bench-seat', [0, top - t / 2, p.seatLengthCm / 2], [p.padWidthCm, t, p.seatLengthCm], 'pad'),
    box('bench-back', add(hinge, add(scale(dir, L / 2), scale(normal, -t / 2))), [p.padWidthCm - 1, t, L], 'pad', fromAxisAngle([1, 0, 0], a)),
    box('bench-beam', [0, beamY, (rearZ + frontZ) / 2], [7, 7, frontZ - rearZ], 'frame'),
    box('bench-seat-post', [0, (beamY + top - t) / 2, p.seatLengthCm / 2], [6, top - t - beamY, 6], 'frame'),
    box('bench-rear-leg', [0, beamY / 2, rearZ + 4], [6, beamY, 6], 'frame'),
    box('bench-front-leg', [0, beamY / 2, frontZ - 4], [6, beamY, 6], 'frame'),
    cyl('bench-rear-foot', [-24, 3, rearZ], [24, 3, rearZ], 3, 'frame'),
    cyl('bench-front-foot', [-17, 3, frontZ], [17, 3, frontZ], 3, 'frame'),
    cyl('bench-strut', [0, beamY, rearZ + 18], strutTop, 1.8, 'chrome'),
  ];
  for (const s of [1, -1]) {
    prims.push(cyl(`bench-wheel-${s > 0 ? 'left' : 'right'}`, [s * 24.5, 4, rearZ - 3], [s * 27.5, 4, rearZ - 3], 4, 'rubber'));
    prims.push(box(`bench-foot-cap-${s > 0 ? 'left' : 'right'}`, [s * 16, 1.5, frontZ], [5, 3, 7], 'rubber'));
  }
  return {
    prims,
    anchors: {
      'bench.seat': [0, top, p.seatLengthCm / 2],
      'bench.hinge': hinge,
      'bench.back': add(hinge, scale(dir, L / 2)),
      'bench.head': add(hinge, scale(dir, L)),
    },
    surfaces: {
      'bench.seat': { kind: 'plane', point: hinge, normal: [0, 1, 0], primitive: 'bench-seat' },
      'bench.back': { kind: 'plane', point: hinge, normal, primitive: 'bench-back' },
    },
  };
}
```

**Create `src/lib/figure/geometry/scene.ts`:**

```ts
import type { Vec3 } from '../math/vec3';
import { type BenchParams, buildBench, ILLUSTRATIVE_BENCH } from './bench';
import { type Built, emptyBuilt, FLOOR, mergeBuilt, placeBuilt } from './built';
import { buildBalanceTrainer, buildExerciseBall, buildFoamRoller, buildMassageBall } from './implements';
import { buildTrainer, ILLUSTRATIVE_TRAINER, type TrainerParams, type TrainerState } from './trainer';

/** Floor accessories a figure can place (they stay put during the exercise). */
export const FLOOR_ITEMS = { 'foam-roller': buildFoamRoller, 'massage-ball': buildMassageBall, 'exercise-ball': buildExerciseBall, 'balance-trainer': buildBalanceTrainer } as const;
export type FloorItem = keyof typeof FLOOR_ITEMS;

/**
 * The fixed equipment of a figure: what stands still while the body moves. Moving parts (the Smith bar
 * in a press, dumbbells, handles, cables) are props of each frame (see `props.ts`).
 */
export interface SceneSpec {
  /** The Smith machine + functional trainer, with its settings. */
  trainer?: TrainerState;
  /** The adjustable bench: floor point under the hinge, turn, and backrest angle. */
  bench?: { at: Vec3; yawDeg?: number; angleDeg: number };
  items?: ReadonlyArray<{ model: FloorItem; at: Vec3; yawDeg?: number }>;
}

/** Equipment dimensions a scene is drawn with. */
export interface SceneParams {
  trainer: TrainerParams;
  bench: BenchParams;
}

/** Typical dimensions (D12): what generic pages and pre-renders draw, labelled "illustrative". */
export const ILLUSTRATIVE_SCENE: SceneParams = { trainer: ILLUSTRATIVE_TRAINER, bench: ILLUSTRATIVE_BENCH };

/** Illustrative dimensions with some values replaced (e.g. the profile's pull-up bar height). */
export function sceneParamsWith(over: { trainer?: Partial<TrainerParams>; bench?: Partial<BenchParams> } = {}): SceneParams {
  return { trainer: { ...ILLUSTRATIVE_TRAINER, ...over.trainer }, bench: { ...ILLUSTRATIVE_BENCH, ...over.bench } };
}

/** The scene's fixed primitives, anchors (`floor` = the origin) and surfaces (`floor` always). */
export function buildScene(spec: SceneSpec, params: SceneParams = ILLUSTRATIVE_SCENE): Built {
  const parts: Built[] = [{ prims: [], anchors: { floor: [0, 0, 0] }, surfaces: { floor: FLOOR } }];
  if (spec.trainer) parts.push(buildTrainer(params.trainer, spec.trainer));
  if (spec.bench) parts.push(placeBuilt(buildBench(params.bench, spec.bench.angleDeg), { at: spec.bench.at, yawDeg: spec.bench.yawDeg }));
  for (const item of spec.items ?? []) parts.push(placeBuilt(FLOOR_ITEMS[item.model](), { at: item.at, yawDeg: item.yawDeg }));
  return parts.length ? mergeBuilt(...parts) : emptyBuilt();
}
```

**Create `src/lib/figure/geometry/models.ts`:**

```ts
import type { Vec3 } from '../math/vec3';
import { buildBench, ILLUSTRATIVE_BENCH } from './bench';
import { type Built, cyl, cylAlong } from './built';
import { buildExerciseBike, buildRowingMachine, buildTreadmill } from './cardio';
import {
  buildAbWheel,
  buildAnkleStrap,
  buildBalanceTrainer,
  buildBand,
  buildBarbell,
  buildCloseGripHandle,
  buildDumbbell,
  buildExerciseBall,
  buildFoamRoller,
  buildLatBar,
  buildMassageBall,
  buildRope,
  buildSingleHandle,
  AB_WHEEL,
  BARBELL,
  DUMBBELL,
} from './implements';
import { aabbOf, type Primitive } from './primitives';
import { buildTrainer, ILLUSTRATIVE_TRAINER } from './trainer';

/** How an equipment view looks at its model (cm; target is the orbit centre). */
export interface ModelView {
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

/**
 * A parametric model that content refers to by id (`model3d` on equipment and attachments). `build`
 * draws it alone with illustrative dimensions, for equipment views and pre-rendered stills.
 */
export interface EquipmentModel {
  id: string;
  kind: 'equipment' | 'attachment';
  build(): Built;
  view: ModelView;
  /**
   * Content parameters this model draws, with the value it uses. The catalog requires the equipment's
   * illustrative defaults to match, so pages, figures and the engine all use the same typical values (D12).
   */
  drawsWith?: Readonly<Record<string, number | boolean>>;
}

const only = (prims: Primitive[]): Built => ({ prims, anchors: {}, surfaces: {} });
const PULLEY: Vec3 = [0, 150, -30];
const pulleyStub = (): Primitive[] => [cylAlong('still-pulley', PULLEY, [1, 0, 0], 3, 5, 'chrome'), cyl('still-pulley-post', [0, 150, -36], [0, 170, -36], 3, 'frame')];

/** Vertical field of view of the stage camera (deg) and the portrait 3:4 frame it renders into. */
const FOV_DEG = 30;
const ASPECT = 3 / 4;

/** A view that frames the whole model: aimed at its bounding box's centre, far enough back for its bounding sphere to fit. */
export function fitView(b: Built, azimuthDeg = 35, elevationDeg = 15): ModelView {
  const boxes = b.prims.map(aabbOf);
  const min = [0, 1, 2].map((i) => Math.min(...boxes.map((x) => x.min[i]!)));
  const max = [0, 1, 2].map((i) => Math.max(...boxes.map((x) => x.max[i]!)));
  const radius = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  const halfFov = Math.atan(Math.tan((FOV_DEG * Math.PI) / 360) * ASPECT);
  return { azimuthDeg, elevationDeg, distanceCm: Math.ceil(radius / Math.sin(halfFov)), targetCm: [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2] };
}

const model = (id: string, kind: EquipmentModel['kind'], build: () => Built, azimuthDeg = 35, elevationDeg = 15, drawsWith?: EquipmentModel['drawsWith']): EquipmentModel => ({
  id,
  kind,
  build,
  view: fitView(build(), azimuthDeg, elevationDeg),
  ...(drawsWith && { drawsWith }),
});
const T = ILLUSTRATIVE_TRAINER;

const LIST: EquipmentModel[] = [
  model('smith-functional-trainer', 'equipment', () => buildTrainer(ILLUSTRATIVE_TRAINER, { barHeightCm: 140, catchHeightCm: 70, pulleys: { left: 'chest', right: 'high' }, jHookHeightCm: 135, spotterArmHeightCm: 70 }), 35, 15, {
    smithLowestBarHeightCm: T.lowestBarHeightCm,
    smithHighestBarHeightCm: T.highestBarHeightCm,
    rackInnerDepthCm: T.rackInnerDepthCm,
    rackInnerWidthCm: T.rackInnerWidthCm,
    rackHeightCm: T.rackHeightCm,
    pullUpBarHeightCm: T.pullUpBarHeightCm,
  }),
  model('adjustable-bench', 'equipment', () => buildBench(ILLUSTRATIVE_BENCH, 30), 35, 15, { seatHeightCm: ILLUSTRATIVE_BENCH.seatHeightCm, backrestLengthCm: ILLUSTRATIVE_BENCH.backrestLengthCm }),
  model('dumbbells', 'equipment', () => only([...buildDumbbell('dumbbell-a', [-12, DUMBBELL.headRadiusCm, 0], [0, 0, 1]), ...buildDumbbell('dumbbell-b', [12, DUMBBELL.headRadiusCm, 0], [0, 0, 1])])),
  model('barbell', 'equipment', () => only(buildBarbell('barbell', [0, BARBELL.plateRadiusCm, 0]))),
  model('resistance-bands', 'equipment', () => only(buildBand('band', loop([0, 60, 0], 14, 45)))),
  model('treadmill', 'equipment', () => buildTreadmill()),
  model('rowing-machine', 'equipment', () => buildRowingMachine()),
  model('exercise-bike', 'equipment', () => buildExerciseBike()),
  model('foam-roller', 'equipment', () => buildFoamRoller()),
  model('massage-ball', 'equipment', () => buildMassageBall()),
  model('ab-wheel', 'equipment', () => only(buildAbWheel('ab-wheel', [0, AB_WHEEL.wheelRadiusCm, 0]))),
  model('exercise-ball', 'equipment', () => buildExerciseBall()),
  model('balance-trainer', 'equipment', () => buildBalanceTrainer()),
  model('rope', 'attachment', () => only([...pulleyStub(), ...buildRope('rope', [[9, 104, -30], [-9, 104, -30]], PULLEY).prims])),
  model('close-grip-row-handle', 'attachment', () => only([...pulleyStub(), ...buildCloseGripHandle('close-grip', [[3.5, 118, -30], [-3.5, 118, -30]], [[0, 1, 0], [0, 1, 0]], PULLEY).prims])),
  model('single-handle', 'attachment', () => only([...pulleyStub(), ...buildSingleHandle('single-handle', [0, 124, -30], [1, 0, 0], PULLEY).prims])),
  model('lat-bar', 'attachment', () => only([...pulleyStub(), ...buildLatBar('lat-bar', [[30, 130, -30], [-30, 130, -30]], PULLEY).prims])),
  model('ankle-strap', 'attachment', () => only([...pulleyStub(), ...buildAnkleStrap('ankle-strap', [0, 120, -30], [0, 1, 0], PULLEY).prims])),
  model('row-footplate', 'attachment', () => part(buildTrainer(ILLUSTRATIVE_TRAINER, { footplate: true }), /^(footplate|upright-front-left|base-left)/), 50),
  model('roller-hold-down', 'attachment', () => part(buildTrainer(ILLUSTRATIVE_TRAINER, { holdDown: true }), /^(hold-down|upright-front-right|base-right)/), -50),
];

/** Every model by id. Content `model3d` ids must be keys here (checked by the catalog). */
export const EQUIPMENT_MODELS: Readonly<Record<string, EquipmentModel>> = Object.fromEntries(LIST.map((m) => [m.id, m]));

function loop(center: Vec3, halfWidth: number, halfHeight: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    pts.push([center[0] + halfWidth * Math.cos(a), center[1] + halfHeight * Math.sin(a), center[2]]);
  }
  return pts;
}

function part(b: Built, keep: RegExp): Built {
  return { prims: b.prims.filter((p) => keep.test(p.id)), anchors: {}, surfaces: {} };
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/figure && npm run lint && npm run check`
Expected: `stations.test.ts` 31 passed (20 of them one per model); the M1 Smith tests unchanged; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/geometry/trainer.ts src/lib/figure/geometry/bench.ts src/lib/figure/geometry/scene.ts src/lib/figure/geometry/models.ts src/lib/figure/geometry/stations.test.ts
git commit -m $'feat(figure): build the trainer, the bench, figure scenes and the 3D model registry\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Equipment builders: trainer, bench, scenes and the model registry" \
  --body $'The generic Smith machine + functional trainer, the adjustable bench, figure scenes and EQUIPMENT_MODELS: one model per v1 equipment class and attachment.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the trainer and bench build with every option, scenes merge fixed equipment with the floor, and `EQUIPMENT_MODELS` holds exactly the 13 v1 equipment classes and 7 attachments, each framed.

---
### Task 4: Pose library — pose data and solver

The heart of M3 (spec §8.1): a pose is data, and one solver poses any of it at any stature. `poseSpec.ts` defines the data (controller decision 4); `solvePose` places the hips, leans the body (roll, then pitch, then yaw), bends the spine and neck, raises the shoulders, resolves the frame's bars, then reaches each hand and foot with two-bone IK. Hands on a bar point their fingers along the forearm, projected across the handle, so the wrist stays straight; the authored palm direction only picks overhand or underhand (three passes let the hand follow the solved forearm); feet from their toe and sole directions, with the toes laid flat for a raised heel. Upper arms and thighs are rolled with `bendSide`, so elbows and knees bend on their hinges (issue #47 option (b), controller decision 3); `hinge: false` on an arm gives option (a) for comparison. `body.ts` provides the body proxies, grip points and contact gaps; `props.ts` builds what the hands hold.

`validate.ts` changes in four places (controller decision 5): the new finding kinds; the hip measured about its hinge (a new `sagittalBendDeg`, which reads 0 rather than throwing when the thigh points sideways); the hip measured from standing, so standing reads 0 as the ankle does (its rest test changes from −2.88° to 0); and the hip limit (−15° → −20° from standing). The Smith squat shares the limit; its results do not change.

**Files:**
- Create: `src/lib/figure/pose/poseSpec.ts`, `src/lib/figure/pose/body.ts`, `src/lib/figure/pose/solvePose.ts`, `src/lib/figure/pose/props.ts`, `src/lib/figure/pose/testing/frames.ts`
- Modify: `src/lib/figure/pose/validate.ts`, `src/lib/figure/pose/validate.test.ts`
- Test: `src/lib/figure/pose/solvePose.test.ts`

**Interfaces:**
- Consumes: M1 `PoseBuilder` (`aim`, `twoBoneIK` with `bendSide`, `setWorldRotation`, `rotateWorld`), `curlFingers`, `palmNormal`, `Side`, `restPose`, `headTop`; Task 1 `fromTwoPairs`; Tasks 2–3 builders, `Built`, `SceneParams`, `pulleyPoint`, `smithMovingParts`, `AB_WHEEL_GRIP_OFFSET_CM`.
- Produces:
  - `poseSpec.ts`: `REFERENCE_STATURE_CM` (175), `PointRef { from?; cm?; bodyCm?; yFromFloor?: boolean | number }`, `TrunkPose { hips; pitchDeg?; yawDeg?; rollDeg?; spine?; head? }`, `Hold`, `HandPose` (`bar` with `axis`, `palm`, `seat?: 'fingers' | 'palm'`; `flat` with `palm`, `fingers`; `free` with `palm`, `fingers?`), `ArmGoal { to; elbow; hand; shrugDeg?; contact?; hinge?: boolean }` (`hinge: false` = #47 option (a)), `LegGoal { to; knee; sole; toes; contact: 'flat' | 'ball' | 'none'; on? }`, `BodyPart`, `BodyContact { part; on; along?; loose? }`, `PropTouch { part; prop }` (`PoseFrame.touches`: a held implement allowed to rest on the body), `FrameProps { smithBar?; barbell?; abWheel?; dumbbells?; cable?; band? }`, `TrackPoint`, `ArrowSpec { track; toward; offsetCm? }`, `PoseFrame`, `ExpectedFailure`, `PoseFigureSpec { kind: 'pose'; id; name; scene; camera; frames; playOrder?; unilateral?; expectedFailures? }`, `mirrorPoint`, `mirrorArm`, `mirrorLeg`, `bothArms`, `bothLegs`.
  - `body.ts`: `Capsule`, `CAPSULE_RADII_CM`, `GripKind` (`bar | press | flat | free`), `gripPoint(w, side, grip, k)`, `handAcross(w, side)`, `turnFromRest(sk, w, bone)`, `footPoints(sk, w, side, s, k)`, `bodyCapsules(sk, w, s, k)`, `closestOnSegment`, `capsuleGap(c, surface)`, `contactGap(c, surface, along?)`, `bodyTop`, `bodyBottom` (returns `{ part, y }`), `wristBendDeg(sk, w, side)` (the hand's direction against its rest direction, in the forearm's frame, degrees), `bodyAnchors(w)` (`body.hips`, `body.hip_l/r`, `body.chest`, `body.neck`, `body.head`, `body.shoulders`, `body.shoulder_l/r`).
  - `solvePose.ts`: `PoseContext { statureCm; scene: Built; railZCm?; settleCm? }`, `PoseSolution { frameId; scaleFactor; k; local; rootPosition; world; anchors; handTargets; footTargets; smithBar? }`, `resolvePoint(p, anchors, k)`, `trunkRotation(pitch?, yaw?, roll?)`, `gripKind(goal)`, `solvePose(sk, frame, ctx)`.
  - `props.ts`: `frameProps(frame, sol, params): Primitive[]`, `SOLID_PROP`, `SMITH_BAR_PART`.
  - `validate.ts`: `Finding['check']` adds `'floor' | 'hang-clearance' | 'bench-rack' | 'implement' | 'body-overlap'`; `ROM_LIMITS.hipFlexDeg.min` = −20 (0 = standing); `jointAngles` subtracts the rest hip reading.
  - `testing/frames.ts`: `STAND`, `stand(over)`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-pose-solver
```

- [ ] **Step 2: Write the failing test and its test frame**

**Create `src/lib/figure/pose/testing/frames.ts`:**

```ts
import { bothArms, bothLegs, type PoseFrame } from '../poseSpec';

const T = { en: 'Test', zh: '测试' };

/**
 * A standing frame for the synthetic skeleton (175 cm, `syntheticSkeleton()`): soft knees, feet flat,
 * a dumbbell grip in each hand at the sides. Tests change one thing at a time from here.
 */
export const STAND: PoseFrame = {
  id: 'stand',
  label: T,
  cue: T,
  trunk: { hips: { bodyCm: [0, 89.5, 0] } },
  arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [5, -52, 6] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }),
  legs: bothLegs({ to: { bodyCm: [10, 0, 14] }, knee: [0, 0, 1], sole: [0, -1, 0], toes: [0, 0, 1], contact: 'flat' }),
};

/** `STAND` with some fields replaced. */
export const stand = (over: Partial<PoseFrame>): PoseFrame => ({ ...STAND, ...over });
```

**Create `src/lib/figure/pose/solvePose.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { distance, midpoint, sub, type Vec3 } from '../math/vec3';
import { rotate } from '../math/quat';
import { buildScene } from '../geometry/scene';
import { footPoints, gripPoint } from './body';
import { palmNormal } from './hands';
import { bothArms, mirrorArm, mirrorLeg, mirrorPoint } from './poseSpec';
import { resolvePoint, solvePose, trunkRotation } from './solvePose';
import { syntheticSkeleton } from './synthetic';
import { STAND, stand } from './testing/frames';
import { jointAngles } from './validate';
import { wristBendDeg } from './body';

const scene = buildScene({});
const close = (a: Vec3, b: Vec3, cm = 0.01) => expect(distance(a, b)).toBeLessThan(cm);

describe('trunkRotation', () => {
  it('pitch leans forward, yaw turns left, roll tilts toward the left side', () => {
    close(rotate(trunkRotation(90), [0, 1, 0]), [0, 0, 1], 1e-9);
    close(rotate(trunkRotation(0, 90), [0, 0, 1]), [1, 0, 0], 1e-9);
    close(rotate(trunkRotation(0, 0, 90), [0, 1, 0]), [1, 0, 0], 1e-9);
    close(rotate(trunkRotation(-90), [0, 1, 0]), [0, 0, -1], 1e-9);
  });
});

describe('resolvePoint', () => {
  const anchors = { floor: [0, 0, 0], 'bench.seat': [0, 43, 20] } as const;
  it('adds fixed and stature-scaled offsets to an anchor', () => {
    expect(resolvePoint({ from: 'bench.seat', cm: [0, 1, 0], bodyCm: [0, 10, 0] }, anchors, 2)).toEqual([0, 64, 20]);
  });
  it('can measure height from the floor, also partly (in-between frames)', () => {
    expect(resolvePoint({ from: 'bench.seat', bodyCm: [0, 10, 0], yFromFloor: true }, anchors, 1)).toEqual([0, 10, 20]);
    expect(resolvePoint({ from: 'bench.seat', bodyCm: [0, 10, 0], yFromFloor: 0.5 }, anchors, 1)).toEqual([0, 31.5, 20]);
  });
  it('names the unknown anchor', () => {
    expect(() => resolvePoint({ from: 'bench.head' }, anchors, 1)).toThrow(/Unknown anchor "bench.head"/);
  });
});

describe('mirroring', () => {
  it('flips x and swaps left/right body anchors, but keeps scene anchors', () => {
    expect(mirrorPoint({ from: 'body.shoulder_l', bodyCm: [5, 1, 2], yFromFloor: true })).toEqual({ from: 'body.shoulder_r', bodyCm: [-5, 1, 2], yFromFloor: true });
    expect(mirrorPoint({ from: 'cable.left.high', cm: [3, 0, 0] })).toEqual({ from: 'cable.left.high', cm: [-3, 0, 0] });
    expect(mirrorArm({ to: { hold: 'barbell', alongCm: 20 }, elbow: [1, 0, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [1, 0, 1], seat: 'palm' } })).toEqual({
      to: { hold: 'barbell', alongCm: -20 },
      elbow: [-1, 0, 0],
      hand: { grip: 'bar', axis: [-1, 0, 0], palm: [-1, 0, 1], seat: 'palm' },
    });
    expect(mirrorLeg(STAND.legs.l).toes).toEqual([-0, 0, 1]);
  });
});

describe('solvePose (synthetic skeleton, 175 cm)', () => {
  const sk = syntheticSkeleton();
  const sol = solvePose(sk, STAND, { statureCm: 175, scene });
  const w = sol.world;

  it('puts the midpoint of the hip joints on its target', () => {
    close(midpoint(w.thigh_l!.position, w.thigh_r!.position), [0, 89.5, 0]);
  });
  it('reaches every limb goal and keeps bone lengths', () => {
    for (const side of ['l', 'r'] as const) {
      close(gripPoint(w, side, 'bar', 1), sol.handTargets[side]);
      close(footPoints(sk, w, side, 1, 1).ball, sol.footTargets[side]);
      expect(footPoints(sk, w, side, 1, 1).heel[1]).toBeCloseTo(0, 6);
    }
  });
  it('bends elbows and knees on their hinges (issue #47, option b): signed flexion is positive', () => {
    const a = jointAngles(sk, w, 'l');
    expect(a.elbowFlexDeg).toBeGreaterThan(0);
    expect(a.kneeFlexDeg).toBeGreaterThan(0);
  });
  it('keeps the wrist straight across the handle and turns the palm to the hinted side', () => {
    expect(palmNormal(w, 'l')[2]).toBeGreaterThan(0.5);
    expect(wristBendDeg(sk, w, 'l')).toBeLessThan(12);
    const under = solvePose(sk, stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] } }) }), { statureCm: 175, scene });
    expect(palmNormal(under.world, 'l')[2]).toBeLessThan(-0.5);
  });
  it('can leave the upper arm unrolled (issue #47, option a) and still reach the grip', () => {
    const plain = solvePose(sk, stand({ arms: bothArms({ ...STAND.arms.l, hinge: false }) }), { statureCm: 175, scene });
    close(gripPoint(plain.world, 'l', 'bar', 1), plain.handTargets.l);
    expect(plain.world.upperarm_l!.rotation).not.toEqual(w.upperarm_l!.rotation);
  });
  it('is the same pose, scaled, at another stature when only body offsets are used', () => {
    const tall = solvePose(sk, STAND, { statureCm: 200, scene });
    const k = 200 / 175;
    close(tall.world.head!.position, [w.head!.position[0] * k, w.head!.position[1] * k, w.head!.position[2] * k], 1e-6);
  });
  it('rotates the whole body and bends the spine', () => {
    const lean = solvePose(sk, stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, pitchDeg: 30, spine: { flexDeg: 20 } } }), { statureCm: 175, scene });
    const up = sub(lean.world.neck_01!.position, lean.world.pelvis!.position);
    expect(up[2]).toBeGreaterThan(0.6 * Math.hypot(...up));
  });
  it('holds a Smith bar on the rail at the frame height', () => {
    const trainer = buildScene({ trainer: {} });
    const grip = bothArms({ to: { hold: 'smith-bar', alongCm: 30 }, elbow: [1, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } });
    const s = solvePose(sk, stand({ arms: grip, props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 10, 0] } } }), { statureCm: 175, scene: trainer, railZCm: 7 });
    expect(s.smithBar![2]).toBe(7);
    close(s.handTargets.l, [30, s.smithBar![1], 7]);
    expect(() => solvePose(sk, stand({ arms: grip, props: { smithBar: {} } }), { statureCm: 175, scene: trainer })).toThrow(/no Smith machine/);
    expect(() => solvePose(sk, stand({ arms: grip }), { statureCm: 175, scene: trainer })).toThrow(/does not place/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/pose/solvePose.test.ts`
Expected: FAIL — `Failed to resolve import "./poseSpec"`.

- [ ] **Step 4: Implement**

**Create `src/lib/figure/pose/poseSpec.ts`:**

```ts
import type { Vec3 } from '../math/vec3';
import type { I18nText } from '../../i18n/locales';
import type { SceneSpec } from '../geometry/scene';
import type { ColumnSide, PulleyHeight } from '../geometry/trainer';
import type { Side } from './hands';

/**
 * Generalized pose data (spec §8.1): a figure is a fixed scene plus three keyframes. Every keyframe is
 * data — trunk placement and angles, a goal for each limb, declared contacts and moving props — and the
 * solver turns it into bone rotations at any stature. All vectors use the pose-layer axes: +Y up, +Z the
 * figure's default facing, +X the figure's left. Right-side goals are usually the mirror of the left
 * (see `mirrorArm`, `mirrorLeg`, `both`).
 */

/** The reference stature the `bodyCm` offsets are written for (spec §8.4: the default stature). */
export const REFERENCE_STATURE_CM = 175;

/**
 * A world point: a named anchor plus a fixed offset plus an offset that scales with stature. A pose that
 * refers only to body anchors and `bodyCm` offsets is the same pose, scaled, at every stature; offsets
 * from equipment anchors (`cm`) stay put, so fixed equipment heights are where statures differ.
 */
export interface PointRef {
  /**
   * `floor` (the origin, default), a scene anchor (`bench.seat`, `pullup.bar`, `smith.rail`,
   * `cable.left.high`…) or, for limb goals, a body anchor (`body.hips`, `body.chest`, `body.shoulder_l`…).
   */
  from?: string;
  /** Offset in cm, world axes, the same at every stature. */
  cm?: Vec3;
  /** Offset in cm at the 175 cm reference stature, world axes; scaled by stature ÷ 175. */
  bodyCm?: Vec3;
  /**
   * Measure height from the floor instead of from the anchor (e.g. a hand on the floor beside the shoulder).
   * In-between poses blend it as a number (0 = from the anchor, 1 = from the floor).
   */
  yFromFloor?: boolean | number;
}

export interface TrunkPose {
  /** Where the midpoint of the hip joints goes. */
  hips: PointRef;
  /** Lean of the whole body from standing: + forward (−90 = lying on the back, 90 = face down). */
  pitchDeg?: number;
  /** Turn about the vertical: + toward the figure's left. */
  yawDeg?: number;
  /** Tilt about the facing axis: + toward the figure's left (90 = lying on the left side). Applied first. */
  rollDeg?: number;
  /** Spine bend above the pelvis, spread over the three spine bones: flex + forward, side + toward the left, twist + toward the left. */
  spine?: { flexDeg?: number; sideDeg?: number; twistDeg?: number };
  /** Neck and head relative to the chest: flex + chin down, turn + toward the left. */
  head?: { flexDeg?: number; turnDeg?: number };
}

/** Bars and wheels a hand can hold; each frame places them (see `FrameProps`). */
export type Hold = 'smith-bar' | 'pullup-bar' | 'barbell' | 'ab-wheel';

/**
 * How the hand is held:
 * - `bar`: closed around a bar or handle lying along `axis`. The fingers point the way the forearm does
 *   (a straight wrist) as far as the axis allows, and the palm faces the side of the bar `palm` points to
 *   (overhand, underhand or neutral); the wrist bends only as far as the forearm leans along the bar. The
 *   bar sits in the fingers (pulling, hanging, carrying) or, with `seat: 'palm'`, low in the palm over
 *   the wrist (pressing).
 * - `flat`: flat on a surface, palm facing `palm`, fingers pointing along `fingers`.
 * - `free`: holding nothing; the palm faces `palm`, fingers along the forearm unless `fingers` is given.
 */
export type HandPose =
  | { grip: 'bar'; axis: Vec3; palm: Vec3; seat?: 'fingers' | 'palm' }
  | { grip: 'flat'; palm: Vec3; fingers: Vec3 }
  | { grip: 'free'; palm: Vec3; fingers?: Vec3 };

export interface ArmGoal {
  /** Where the hand's grip point goes: a point, or a spot on a held bar `alongCm` from its middle (body-scaled, +X for the left hand). */
  to: PointRef | { hold: Hold; alongCm: number };
  /** World direction the elbow points (the IK pole). */
  elbow: Vec3;
  hand: HandPose;
  /** Shoulder elevation (deg): raises the shoulder by turning the clavicle. */
  shrugDeg?: number;
  /**
   * Roll the upper arm so the elbow bends on its hinge (default true; issue #47 option b). `false` keeps
   * the shortest swing (option a); the validators then check that pose's elbows by bend magnitude only.
   */
  hinge?: boolean;
  /** Validate the grip point against its target (default: true for holds and flat hands, false otherwise). */
  contact?: boolean;
}

/**
 * How a foot is placed. `flat`: sole flat on the surface, `to` is the point under the ball of the foot.
 * `ball`: only the ball of the foot touches `to` (heel raised or toes tucked; the toes lie along the
 * surface). `none`: the foot is free and `to` is the ankle itself.
 */
export interface LegGoal {
  to: PointRef;
  /** World direction the knee points (the IK pole). */
  knee: Vec3;
  /** Direction the sole faces (down when standing flat). */
  sole: Vec3;
  /** Direction the toes point. */
  toes: Vec3;
  contact: 'flat' | 'ball' | 'none';
  /** Surface the foot rests on (default `floor`). */
  on?: string;
}

/** Body parts with a collision capsule (see `bodyCapsules`). */
export type BodyPart = 'pelvis' | 'abdomen' | 'chest' | 'head' | `${'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shank' | 'foot'}_${Side}`;

/**
 * A part of the body resting on a named scene surface (`floor`, `bench.back`, `hold-down.pad`…), checked
 * within 1 cm. By default the part's nearest point touches; `along` means it lies flat along the surface
 * (both ends touch), e.g. a forearm on the floor. A `loose` contact is not measured, only excused from
 * the overlap warning: soft tissue that rests on or presses into the surface (thighs on a bench seat).
 */
export interface BodyContact {
  part: BodyPart;
  on: string;
  along?: boolean;
  loose?: boolean;
}

/** A held implement a body part is meant to touch (a Smith bar on the chest): excused from the implement checks. */
export interface PropTouch {
  part: BodyPart;
  /** Primitive id prefix of the prop (`bar`, `dumbbell-l`, `barbell`). */
  prop: string;
}

/** Moving equipment in a frame. Bars are placed by the frame; hand-held implements follow the hands. */
export interface FrameProps {
  /** The Smith bar: only the height of this point counts (the bar runs on the rails). */
  smithBar?: PointRef;
  /** Barbell centre (the bar lies along X). */
  barbell?: PointRef;
  /** Ab wheel axle centre. */
  abWheel?: PointRef;
  /** A dumbbell in these hands, its handle across the palm. */
  dumbbells?: readonly Side[];
  /** A cable handle in the hands, on the cable from a pulley. `hand` picks who holds a single handle (default `l`). */
  cable?: { column: ColumnSide; pulley: PulleyHeight; handle: 'rope' | 'single-handle' | 'close-grip-row-handle' | 'lat-bar'; hand?: Side | 'both' };
  /** A loop band stretched between the hands. */
  band?: 'between-hands';
}

/** Points an arrow can follow. */
export type TrackPoint = 'hands' | 'hand_l' | 'hand_r' | 'bar' | 'hips' | 'chest' | 'head' | 'knees' | 'feet';

/**
 * Movement arrow drawn in a frame: it starts at the tracked point (plus `offsetCm`, body-scaled) and
 * points toward where that point is in frame `toward`.
 */
export interface ArrowSpec {
  track: TrackPoint;
  toward: number;
  offsetCm?: Vec3;
}

export interface PoseFrame {
  id: string;
  label: I18nText;
  cue: I18nText;
  trunk: TrunkPose;
  arms: Readonly<Record<Side, ArmGoal>>;
  legs: Readonly<Record<Side, LegGoal>>;
  contacts?: readonly BodyContact[];
  touches?: readonly PropTouch[];
  props?: FrameProps;
  /** The body hangs from its hands: every part must clear the floor. */
  hanging?: boolean;
  arrow?: ArrowSpec;
}

/** A statured case the figure cannot pose validly, declared with its reason; the figure sweep checks it still fails. */
export interface ExpectedFailure {
  statures: readonly number[];
  checks: readonly string[];
  reason: string;
}

export interface PoseFigureSpec {
  kind: 'pose';
  id: string;
  name: I18nText;
  scene: SceneSpec;
  /** One camera for all frames (spec §5.3); target and distance are written for 175 cm and scale with stature. */
  camera: { azimuthDeg: number; elevationDeg: number; distanceCm: number; target: PointRef };
  frames: readonly [PoseFrame, PoseFrame, PoseFrame];
  /** Keyframe order the viewer's Play loops through (default 0 → 1 → 2 → 0). */
  playOrder?: readonly number[];
  /** Exercise done one side at a time: the working side faces the camera and pages say "both sides". */
  unilateral?: boolean;
  expectedFailures?: readonly ExpectedFailure[];
}

// ── Mirroring ───────────────────────────────────────────────────────────────────

const mx = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
/** `body.shoulder_l` ↔ `body.shoulder_r`. Scene anchors keep their names. */
const swapSide = (s: string): string => s.replace(/_(l|r)$/, (_m, x: string) => (x === 'l' ? '_r' : '_l'));

/** Mirror across the figure's midline: x offsets change sign and `_l`/`_r` body anchors swap. */
export function mirrorPoint(p: PointRef): PointRef {
  return { ...p, ...(p.from !== undefined && { from: swapSide(p.from) }), ...(p.cm && { cm: mx(p.cm) }), ...(p.bodyCm && { bodyCm: mx(p.bodyCm) }) };
}

function mirrorHand(h: HandPose): HandPose {
  if (h.grip === 'bar') return { ...h, axis: mx(h.axis), palm: mx(h.palm) };
  if (h.grip === 'flat') return { grip: 'flat', palm: mx(h.palm), fingers: mx(h.fingers) };
  return { grip: 'free', palm: mx(h.palm), ...(h.fingers && { fingers: mx(h.fingers) }) };
}

/** The same arm goal for the other arm, mirrored across the body's midline (x → −x). */
export function mirrorArm(g: ArmGoal): ArmGoal {
  const to = 'hold' in g.to ? { hold: g.to.hold, alongCm: -g.to.alongCm } : mirrorPoint(g.to);
  return { ...g, to, elbow: mx(g.elbow), hand: mirrorHand(g.hand) };
}

export function mirrorLeg(g: LegGoal): LegGoal {
  return { ...g, to: mirrorPoint(g.to), knee: mx(g.knee), sole: mx(g.sole), toes: mx(g.toes) };
}

/** Left goal plus its mirror for the right. */
export function bothArms(left: ArmGoal): Record<Side, ArmGoal> {
  return { l: left, r: mirrorArm(left) };
}
export function bothLegs(left: LegGoal): Record<Side, LegGoal> {
  return { l: left, r: mirrorLeg(left) };
}
```

**Create `src/lib/figure/pose/body.ts`:**

```ts
import { type Vec3, add, angleBetweenDeg, dot, length, lerp, midpoint, normalize, scale, sub } from '../math/vec3';
import { conjugate, multiply, type Quat, rotate } from '../math/quat';
import type { Surface } from '../geometry/built';
import { palmNormal, type Side } from './hands';
import type { BodyPart } from './poseSpec';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';
import { headTop } from './validate';

/**
 * Body collision proxies (spec §8.2): one capsule per body segment, derived from the posed skeleton.
 * Radii are typical adult segment half-thicknesses at the 175 cm reference stature, scaled with stature.
 */
export interface Capsule {
  part: BodyPart;
  a: Vec3;
  b: Vec3;
  r: number;
}

export const CAPSULE_RADII_CM: Readonly<Record<string, number>> = {
  pelvis: 10,
  abdomen: 10.5,
  chest: 11.5,
  head: 9,
  upperarm: 4.5,
  forearm: 3.2,
  hand: 1.4,
  thigh: 7.5,
  shank: 5.2,
  foot: 2.5,
};

/** How far the grip point lies in front of the palm for each kind of grip (cm at 175 cm). */
const GRIP_DEPTH_CM = { bar: 2.6, press: 3.0, flat: 1.4, free: 0 } as const;
/** Where along wrist → middle knuckle the grip point sits. */
const GRIP_ALONG = { bar: 0.78, press: 0.4, flat: 0.55, free: 0.6 } as const;
/** `bar`: a bar in the fingers; `press`: a bar low in the palm; `flat`: the palm on a surface; `free`: nothing held. */
export type GripKind = keyof typeof GRIP_DEPTH_CM;

/**
 * The hand's grip point: the centre of a held bar for `bar` and `press`, the palm's contact point for
 * `flat`, the middle of the hand for `free`. `k` = stature ÷ 175.
 */
export function gripPoint(w: WorldPose, side: Side, grip: GripKind, k: number): Vec3 {
  const along = lerp(w[`hand_${side}`]!.position, w[`middle_01_${side}`]!.position, GRIP_ALONG[grip]);
  return add(along, scale(palmNormal(w, side), GRIP_DEPTH_CM[grip] * k));
}

/** Direction across the hand, index knuckle to little-finger knuckle (a held handle lies along it). */
export function handAcross(w: WorldPose, side: Side): Vec3 {
  return normalize(sub(w[`pinky_01_${side}`]!.position, w[`index_01_${side}`]!.position));
}

const restRotations = new WeakMap<SkeletonDef, WorldPose>();

/** How a bone has turned from its rest orientation (world). */
export function turnFromRest(sk: SkeletonDef, w: WorldPose, bone: string): Quat {
  let rest = restRotations.get(sk);
  if (!rest) restRotations.set(sk, (rest = restPose(sk, 1)));
  return multiply(w[bone]!.rotation, conjugate(rest[bone]!.rotation));
}

/**
 * Foot contact points, posed: under the ball of the foot and under the heel (on the floor at rest).
 * `s` is the skeleton scale factor, `k` = stature ÷ 175.
 */
export function footPoints(sk: SkeletonDef, w: WorldPose, side: Side, s: number, k: number): { ball: Vec3; heel: Vec3 } {
  const rest = restPose(sk, s);
  const foot = rest[`foot_${side}`]!.position;
  const ball = rest[`ball_${side}`]!.position;
  const turn = turnFromRest(sk, w, `foot_${side}`);
  const at = (p: Vec3) => add(w[`foot_${side}`]!.position, rotate(turn, sub(p, foot)));
  return { ball: at([ball[0], 0, ball[2]]), heel: at([foot[0], 0, foot[2] - 4 * k]) };
}

/** Capsules for the posed body. `s` is the skeleton scale factor, `k` = stature ÷ 175. */
export function bodyCapsules(sk: SkeletonDef, w: WorldPose, s: number, k: number): Capsule[] {
  const P = (n: string) => w[n]!.position;
  const R = (n: string) => CAPSULE_RADII_CM[n]! * k;
  const fwd = (bone: string, cm: number) => scale(rotate(turnFromRest(sk, w, bone), [0, 0, 1]), cm * k);
  const out: Capsule[] = [
    { part: 'pelvis', a: P('thigh_l'), b: P('thigh_r'), r: R('pelvis') },
    // The trunk's bulk lies in front of the spine: its capsules run a little forward of the spine bones.
    { part: 'abdomen', a: add(P('pelvis'), fwd('pelvis', 2)), b: add(P('spine_02'), fwd('spine_02', 2)), r: R('abdomen') },
    { part: 'chest', a: add(P('spine_02'), fwd('spine_02', 3)), b: add(lerp(P('spine_03'), P('neck_01'), 0.7), fwd('spine_03', 3)), r: R('chest') },
    { part: 'head', a: P('head'), b: lerp(P('head'), headTop(sk, w, s), 0.45), r: R('head') },
  ];
  for (const side of ['l', 'r'] as const) {
    const n = (b: string) => `${b}_${side}`;
    // Limbs narrow toward the elbow, wrist, knee and ankle, so each limb capsule stops short of its distal joint.
    out.push({ part: n('upperarm') as BodyPart, a: P(n('upperarm')), b: lerp(P(n('upperarm')), P(n('lowerarm')), 0.85), r: R('upperarm') });
    out.push({ part: n('forearm') as BodyPart, a: P(n('lowerarm')), b: lerp(P(n('lowerarm')), P(n('hand')), 0.85), r: R('forearm') });
    out.push({ part: n('hand') as BodyPart, a: P(n('hand')), b: P(n('middle_01')), r: R('hand') });
    out.push({ part: n('thigh') as BodyPart, a: P(n('thigh')), b: lerp(P(n('thigh')), P(n('calf')), 0.85), r: R('thigh') });
    out.push({ part: n('shank') as BodyPart, a: P(n('calf')), b: lerp(P(n('calf')), P(n('foot')), 0.85), r: R('shank') });
    // The foot capsule runs from above the heel to above the ball of the foot, touching the sole's plane.
    const { ball, heel } = footPoints(sk, w, side, s, k);
    const up = rotate(turnFromRest(sk, w, n('foot')), [0, 1, 0]);
    out.push({ part: n('foot') as BodyPart, a: add(heel, scale(up, R('foot'))), b: add(ball, scale(up, R('foot'))), r: R('foot') });
  }
  return out;
}

/** Closest point to `p` on the segment a–b. */
export function closestOnSegment(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return a;
  return add(a, scale(ab, Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2))));
}

/**
 * Gap between a capsule and a surface (cm): positive when it floats above, negative when it sinks in.
 * Planes are unbounded (a pad's edges are not modelled); spheres are exact.
 */
export function capsuleGap(c: Capsule, s: Surface): number {
  if (s.kind === 'plane') {
    const n = normalize(s.normal);
    return Math.min(dot(sub(c.a, s.point), n), dot(sub(c.b, s.point), n)) - c.r;
  }
  return length(sub(closestOnSegment(c.a, c.b, s.center), s.center)) - s.radius - c.r;
}

/** Gap of a contact: the nearest point for a resting part, the worse end for a part lying `along` the surface. */
export function contactGap(c: Capsule, s: Surface, along = false): number {
  if (!along) return capsuleGap(c, s);
  const ends = [capsuleGap({ ...c, b: c.a }, s), capsuleGap({ ...c, a: c.b }, s)];
  return Math.abs(ends[0]!) > Math.abs(ends[1]!) ? ends[0]! : ends[1]!;
}

/** Highest point of the body (cm): the top of the head or of any capsule. */
export function bodyTop(capsules: readonly Capsule[]): number {
  return Math.max(...capsules.map((c) => Math.max(c.a[1], c.b[1]) + c.r));
}

/** The lowest capsule and how low it reaches (cm). */
export function bodyBottom(capsules: readonly Capsule[]): { part: BodyPart; y: number } {
  let low = { part: capsules[0]!.part, y: Infinity };
  for (const c of capsules) {
    const y = Math.min(c.a[1], c.b[1]) - c.r;
    if (y < low.y) low = { part: c.part, y };
  }
  return low;
}

/** Named body points poses and arrows can refer to (after the trunk is posed). */
export function bodyAnchors(w: WorldPose): Record<string, Vec3> {
  const P = (n: string) => w[n]!.position;
  return {
    'body.hips': midpoint(P('thigh_l'), P('thigh_r')),
    'body.hip_l': P('thigh_l'),
    'body.hip_r': P('thigh_r'),
    'body.chest': lerp(P('spine_03'), P('neck_01'), 0.5),
    'body.neck': P('neck_01'),
    'body.head': P('head'),
    'body.shoulders': midpoint(P('upperarm_l'), P('upperarm_r')),
    'body.shoulder_l': P('upperarm_l'),
    'body.shoulder_r': P('upperarm_r'),
  };
}

/** How far the hand points away from its rest direction, measured in the forearm's frame (deg). */
export function wristBendDeg(sk: SkeletonDef, w: WorldPose, side: Side): number {
  const inForearm = (pose: WorldPose) =>
    rotate(conjugate(pose[`lowerarm_${side}`]!.rotation), sub(pose[`middle_01_${side}`]!.position, pose[`hand_${side}`]!.position));
  return angleBetweenDeg(inForearm(w), inForearm(restPose(sk, 1)));
}
```

**Create `src/lib/figure/pose/solvePose.ts`:**

```ts
import { type Vec3, add, cross, dot, length, midpoint, normalize, scale, sub, X_AXIS, Y_AXIS, Z_AXIS } from '../math/vec3';
import { conjugate, degToRad, fromAxisAngle, fromTwoPairs, multiply, type Quat, rotate } from '../math/quat';
import type { Built } from '../geometry/built';
import { AB_WHEEL_GRIP_OFFSET_CM } from '../geometry/implements';
import { PoseBuilder } from './builder';
import { bodyAnchors, type GripKind, gripPoint, turnFromRest } from './body';
import { curlFingers, palmNormal, type Side } from './hands';
import { type ArmGoal, type Hold, type LegGoal, type PointRef, type PoseFrame, REFERENCE_STATURE_CM } from './poseSpec';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';

/** Finger curl per hand pose (deg for segments 01/02/03), fingers then thumb. */
const CURL: Record<ArmGoal['hand']['grip'], { fingers: [number, number, number]; thumb: [number, number, number] }> = {
  bar: { fingers: [55, 65, 45], thumb: [15, 25, 20] },
  flat: { fingers: [4, 6, 4], thumb: [0, 5, 5] },
  free: { fingers: [18, 24, 16], thumb: [6, 10, 8] },
};

/** Spine bend shares of spine_01 / 02 / 03 (sum 1). */
const SPINE_SHARE = [0.3, 0.35, 0.35] as const;

/** Rest-pose side of the upper arm that faces the forearm when the elbow bends (forward), and of the thigh for the knee (backward). */
const ELBOW_BEND_SIDE: Vec3 = [0, 0, 1];
const KNEE_BEND_SIDE: Vec3 = [0, 0, -1];

export interface PoseContext {
  statureCm: number;
  /** The figure's fixed equipment (anchors and surfaces), built with the dimensions in use. */
  scene: Built;
  /** Smith rail position, for frames that move the Smith bar. */
  railZCm?: number;
  /** Raise (or lower) the hips by this much (cm) after placing them; used to settle in-between poses onto their contacts. */
  settleCm?: number;
}

export interface PoseSolution {
  frameId: string;
  /** Skeleton scale: stature ÷ the skeleton's native stature. */
  scaleFactor: number;
  /** stature ÷ 175: what `bodyCm` offsets are multiplied by. */
  k: number;
  local: Record<string, Quat>;
  rootPosition: Vec3;
  world: WorldPose;
  /** Resolved anchor positions: the scene's, the body's (after the trunk) and the frame's holds (`hold.<name>`). */
  anchors: Record<string, Vec3>;
  /** Where each hand's grip point was sent. */
  handTargets: Record<Side, Vec3>;
  /** Where each foot's contact point (or ankle, for free feet) was sent. */
  footTargets: Record<Side, Vec3>;
  /** Smith bar centre in this frame, when the frame moves it. */
  smithBar?: Vec3;
}

/** Resolve a point against the known anchors. */
export function resolvePoint(p: PointRef, anchors: Readonly<Record<string, Vec3>>, k: number): Vec3 {
  const from = p.from ?? 'floor';
  const base = anchors[from];
  if (!base) throw new Error(`Unknown anchor "${from}" (known: ${Object.keys(anchors).join(', ')})`);
  const at = add(add(base, p.cm ?? [0, 0, 0]), scale(p.bodyCm ?? [0, 0, 0], k));
  // yFromFloor may be blended between two frames (0..1): the anchor's height counts that much less.
  const fromFloor = p.yFromFloor === true ? 1 : typeof p.yFromFloor === 'number' ? p.yFromFloor : 0;
  return [at[0], at[1] - fromFloor * base[1], at[2]];
}

/** The body's orientation from pitch, yaw and roll (roll first, then pitch, then yaw). */
export function trunkRotation(pitchDeg = 0, yawDeg = 0, rollDeg = 0): Quat {
  const roll = fromAxisAngle(Z_AXIS, degToRad(-rollDeg));
  const pitch = fromAxisAngle(X_AXIS, degToRad(pitchDeg));
  const yaw = fromAxisAngle(Y_AXIS, degToRad(yawDeg));
  return multiply(yaw, multiply(pitch, roll));
}

/** Bend a bone about its parent's body axes (left, forward, up as turned from rest). */
function bendBone(b: PoseBuilder, sk: SkeletonDef, bone: string, flexDeg: number, sideDeg: number, twistDeg: number): void {
  const parent = b.def(bone).parent!;
  const turn = turnFromRest(sk, b.world(), parent);
  if (twistDeg) b.rotateWorld(bone, rotate(turn, Y_AXIS), degToRad(twistDeg));
  if (sideDeg) b.rotateWorld(bone, rotate(turn, Z_AXIS), degToRad(-sideDeg));
  if (flexDeg) b.rotateWorld(bone, rotate(turn, X_AXIS), degToRad(flexDeg));
}

/** Hand world rotation for a pose, given the current estimate of the forearm's direction. */
function handRotation(rest: WorldPose, side: Side, goal: ArmGoal, forearm: Vec3): Quat {
  const restFingers = normalize(sub(rest[`middle_01_${side}`]!.position, rest[`hand_${side}`]!.position));
  const restPalm = palmNormal(rest, side);
  const h = goal.hand;
  let fingers: Vec3;
  let palm: Vec3;
  if (h.grip === 'bar') {
    // The bar lies across the palm, so the fingers point along the forearm as far as the bar allows (the
    // wrist only deviates by the forearm's lean along the bar); the palm hint picks which way the palm faces.
    const axis = normalize(h.axis);
    const along = sub(forearm, scale(axis, dot(forearm, axis)));
    fingers = length(along) > 1e-6 ? normalize(along) : normalize(cross(axis, h.palm));
    const p = cross(axis, fingers);
    palm = dot(p, h.palm) >= 0 ? p : scale(p, -1);
  } else if (h.grip === 'flat' || h.fingers) {
    fingers = h.grip === 'flat' ? h.fingers : h.fingers!;
    palm = h.palm;
  } else {
    // A free hand keeps a straight wrist: the fingers follow the forearm, the palm turns as near the hint as it can.
    fingers = forearm;
    const across = (v: Vec3) => sub(v, scale(forearm, dot(v, forearm)));
    const hint = normalize(h.palm);
    palm = [hint, Y_AXIS, Z_AXIS].map(across).find((v) => length(v) > 0.2) ?? X_AXIS;
  }
  return multiply(fromTwoPairs(restFingers, restPalm, fingers, palm), rest[`hand_${side}`]!.rotation);
}

/**
 * Solve one keyframe (spec §8.1): place and bend the trunk, then reach every limb to its goal with
 * two-bone IK, rolling the upper arm and thigh so elbows and knees bend on their hinges (issue #47,
 * option b), then set hands and feet from their anatomical directions and curl the fingers.
 */
export function solvePose(sk: SkeletonDef, frame: PoseFrame, ctx: PoseContext): PoseSolution {
  const s = ctx.statureCm / sk.statureCm;
  const k = ctx.statureCm / REFERENCE_STATURE_CM;
  const b = new PoseBuilder(sk, s);
  const rest = restPose(sk, s);
  const P = (n: string) => rest[n]!.position;
  const anchors: Record<string, Vec3> = { ...ctx.scene.anchors };
  const t = frame.trunk;

  // 1. Whole-body orientation about the hips, then the hips to their target.
  const R = trunkRotation(t.pitchDeg, t.yawDeg, t.rollDeg);
  const root = sk.bones[0]!;
  const hipsRest = midpoint(P('thigh_l'), P('thigh_r'));
  b.local[root.name] = multiply(R, root.restLocalR);
  b.rootPosition = add(add(resolvePoint(t.hips, anchors, k), [0, ctx.settleCm ?? 0, 0]), rotate(R, sub(rest[root.name]!.position, hipsRest)));

  // 2. Spine and head.
  const sp = t.spine ?? {};
  ['spine_01', 'spine_02', 'spine_03'].forEach((bone, i) => bendBone(b, sk, bone, (sp.flexDeg ?? 0) * SPINE_SHARE[i]!, (sp.sideDeg ?? 0) * SPINE_SHARE[i]!, (sp.twistDeg ?? 0) * SPINE_SHARE[i]!));
  for (const bone of ['neck_01', 'head']) bendBone(b, sk, bone, (t.head?.flexDeg ?? 0) / 2, 0, (t.head?.turnDeg ?? 0) / 2);

  // 3. Shoulders, then the body anchors limb goals may refer to.
  for (const side of ['l', 'r'] as const) {
    const shrug = frame.arms[side].shrugDeg ?? 0;
    if (shrug) {
      const turn = turnFromRest(sk, b.world(), 'spine_03');
      b.rotateWorld(`clavicle_${side}`, rotate(turn, Z_AXIS), degToRad(side === 'l' ? shrug : -shrug));
    }
  }
  Object.assign(anchors, bodyAnchors(b.world()));

  // 4. Bars the frame places.
  let smithBar: Vec3 | undefined;
  const props = frame.props ?? {};
  if (props.smithBar) {
    if (ctx.railZCm === undefined) throw new Error(`frame "${frame.id}": moves the Smith bar but the scene has no Smith machine`);
    smithBar = [0, resolvePoint(props.smithBar, anchors, k)[1], ctx.railZCm];
    anchors['hold.smith-bar'] = smithBar;
  }
  if (props.barbell) anchors['hold.barbell'] = resolvePoint(props.barbell, anchors, k);
  if (props.abWheel) anchors['hold.ab-wheel'] = resolvePoint(props.abWheel, anchors, k);
  if (anchors['pullup.bar']) anchors['hold.pullup-bar'] = anchors['pullup.bar'];

  // 5. Arms: grip target → hand orientation → wrist target → IK; twice, so a bar grip's fingers follow the solved forearm.
  const handTargets = {} as Record<Side, Vec3>;
  for (const side of ['l', 'r'] as const) {
    const goal = frame.arms[side];
    const target = armTarget(goal, anchors, k, frame.id);
    handTargets[side] = target;
    const grip = goal.hand.grip;
    const gripRest = sub(gripPoint(rest, side, gripKind(goal), k), P(`hand_${side}`));
    const restHandRot = rest[`hand_${side}`]!.rotation;
    let forearm = normalize(sub(target, b.world()[`upperarm_${side}`]!.position));
    for (let pass = 0; pass < 3; pass++) {
      const handRot = handRotation(rest, side, goal, forearm);
      const turn = multiply(handRot, conjugate(restHandRot));
      const wrist = sub(target, rotate(turn, gripRest));
      b.twoBoneIK(`upperarm_${side}`, `lowerarm_${side}`, `hand_${side}`, wrist, goal.elbow, goal.hinge === false ? {} : { bendSide: ELBOW_BEND_SIDE });
      b.setWorldRotation(`hand_${side}`, handRot);
      const w = b.world();
      forearm = normalize(sub(w[`hand_${side}`]!.position, w[`lowerarm_${side}`]!.position));
    }
    curlFingers(b, side, CURL[grip].fingers, CURL[grip].thumb);
  }

  // 6. Legs: foot orientation → ankle target → IK; the toes lie along the surface for a raised heel.
  const footTargets = {} as Record<Side, Vec3>;
  for (const side of ['l', 'r'] as const) {
    const goal = frame.legs[side];
    const target = resolvePoint(goal.to, anchors, k);
    footTargets[side] = target;
    const footRot = footRotation(rest, side, goal);
    const turn = multiply(footRot, conjugate(rest[`foot_${side}`]!.rotation));
    const ball = P(`ball_${side}`);
    const ankle = goal.contact === 'none' ? target : add(target, rotate(turn, sub(P(`foot_${side}`), [ball[0], 0, ball[2]])));
    b.twoBoneIK(`thigh_${side}`, `calf_${side}`, `foot_${side}`, ankle, goal.knee, { bendSide: KNEE_BEND_SIDE });
    b.setWorldRotation(`foot_${side}`, footRot);
    if (goal.contact === 'ball') {
      const normal = surfaceNormal(ctx.scene, goal.on ?? 'floor');
      const toes = sub(goal.toes, scale(normal, dot(goal.toes, normal)));
      const restToes = restToesDir(rest, side);
      b.setWorldRotation(`ball_${side}`, multiply(fromTwoPairs(restToes, [0, -1, 0], toes, scale(normal, -1)), rest[`ball_${side}`]!.rotation));
    }
  }

  return { frameId: frame.id, scaleFactor: s, k, local: { ...b.local }, rootPosition: b.rootPosition, world: b.world(), anchors, handTargets, footTargets, smithBar };
}

function restToesDir(rest: WorldPose, side: Side): Vec3 {
  const d = sub(rest[`ball_${side}`]!.position, rest[`foot_${side}`]!.position);
  return normalize([d[0], 0, d[2]]);
}

function footRotation(rest: WorldPose, side: Side, goal: LegGoal): Quat {
  return multiply(fromTwoPairs(restToesDir(rest, side), [0, -1, 0], goal.toes, goal.sole), rest[`foot_${side}`]!.rotation);
}

function surfaceNormal(scene: Built, name: string): Vec3 {
  const s = scene.surfaces[name];
  if (!s) throw new Error(`Unknown surface "${name}"`);
  return s.kind === 'plane' ? normalize(s.normal) : [0, 1, 0];
}

/** Which grip point a hand goal uses. */
export function gripKind(goal: ArmGoal): GripKind {
  const h = goal.hand;
  return h.grip === 'bar' ? (h.seat === 'palm' ? 'press' : 'bar') : h.grip;
}

function armTarget(goal: ArmGoal, anchors: Readonly<Record<string, Vec3>>, k: number, frameId: string): Vec3 {
  if (!('hold' in goal.to)) return resolvePoint(goal.to, anchors, k);
  const hold: Hold = goal.to.hold;
  const center = anchors[`hold.${hold}`];
  if (!center) throw new Error(`frame "${frameId}": a hand holds "${hold}", which the frame does not place`);
  // Ab-wheel handles are at fixed spots on the axle; bars take a body-scaled grip width.
  const along = hold === 'ab-wheel' ? Math.sign(goal.to.alongCm) * AB_WHEEL_GRIP_OFFSET_CM : goal.to.alongCm * k;
  return add(center, [along, 0, 0]);
}
```

**Create `src/lib/figure/pose/props.ts`:**

```ts
import { type Vec3, midpoint, normalize, sub } from '../math/vec3';
import { buildAbWheel, buildBand, buildBarbell, buildCloseGripHandle, buildDumbbell, buildLatBar, buildRope, buildSingleHandle, cableLine } from '../geometry/implements';
import type { Primitive } from '../geometry/primitives';
import { pulleyPoint, smithMovingParts } from '../geometry/trainer';
import type { SceneParams } from '../geometry/scene';
import { gripPoint, handAcross } from './body';
import type { Side } from './hands';
import type { PoseFrame } from './poseSpec';
import { gripKind, type PoseSolution } from './solvePose';

/**
 * The moving equipment of a solved frame (spec §8.2: the same geometry is checked and drawn). Bars and
 * the ab wheel sit where the frame placed them; dumbbells, handles, cables and bands follow the posed
 * hands, so what the hands hold is always in the hands.
 */
export function frameProps(frame: PoseFrame, sol: PoseSolution, params: SceneParams): Primitive[] {
  const p = frame.props ?? {};
  const w = sol.world;
  const grip = (side: Side) => gripPoint(w, side, gripKind(frame.arms[side]), sol.k);
  const out: Primitive[] = [];
  if (sol.smithBar) out.push(...smithMovingParts(params.trainer, sol.smithBar[1]));
  if (p.barbell) out.push(...buildBarbell('barbell', sol.anchors['hold.barbell']!));
  if (p.abWheel) out.push(...buildAbWheel('ab-wheel', sol.anchors['hold.ab-wheel']!));
  for (const side of p.dumbbells ?? []) out.push(...buildDumbbell(`dumbbell-${side}`, grip(side), handAcross(w, side)));
  if (p.band) out.push(...buildBand('band', [grip('l'), grip('r')]));
  if (p.cable) {
    const pulley: Vec3 = pulleyPoint(params.trainer, p.cable.column, p.cable.pulley);
    const hands: [Vec3, Vec3] = [grip('l'), grip('r')];
    let built: { prims: Primitive[]; attach: Vec3 };
    if (p.cable.handle === 'rope') built = buildRope('rope', hands, pulley);
    else if (p.cable.handle === 'lat-bar') built = buildLatBar('lat-bar', hands, pulley);
    else if (p.cable.handle === 'close-grip-row-handle') built = buildCloseGripHandle('close-grip', hands, [handAcross(w, 'l'), handAcross(w, 'r')], pulley);
    else if (p.cable.hand === 'both') {
      built = buildSingleHandle('single-handle', midpoint(hands[0], hands[1]), normalize(sub(hands[0], hands[1])), pulley);
    } else {
      const side = p.cable.hand ?? 'l';
      built = buildSingleHandle('single-handle', grip(side), handAcross(w, side), pulley);
    }
    out.push(...built.prims, cableLine('cable', pulley, built.attach));
  }
  return out;
}

/** Props that are solid implements: they must not pass through the floor or the equipment. */
export const SOLID_PROP = /^(dumbbell-|barbell-(plate|collar|sleeve)|ab-wheel-(wheel|hub))/;

/** The Smith bar's moving parts (bar, plates, carriages). */
export const SMITH_BAR_PART = /^(bar$|plate-|carriage-)/;
```

**Edit `src/lib/figure/pose/validate.ts`** (7 changes):

1. Replace

```ts
export interface Finding {
  check: 'anchor' | 'feet-flat' | 'bar-on-rail' | 'bar-travel' | 'bone-length' | 'rom' | 'ceiling';
  severity: Severity;
```

   with

```ts
export interface Finding {
  check:
    | 'anchor'
    | 'feet-flat'
    | 'bar-on-rail'
    | 'bar-travel'
    | 'bone-length'
    | 'rom'
    | 'ceiling'
    /** A body part below the floor. */
    | 'floor'
    /** A hanging body touching the floor. */
    | 'hang-clearance'
    /** The bench intersecting the rack. */
    | 'bench-rack'
    /** A held implement passing through the floor or the equipment. */
    | 'implement'
    /** A body part sinking into equipment it does not declare contact with (warn). */
    | 'body-overlap';
  severity: Severity;
```

2. Replace

```ts
 * the wrong way: knee and elbow hyperextension (more than a few degrees past straight), hip extension
 * beyond what a standing lifter reaches, and ankle plantarflexion.
 */
```

   with

```ts
 * the wrong way: knee and elbow hyperextension (more than a few degrees past straight), hip extension
 * past the typical active range (about 10–20°; the hip reads 0 when standing, as the ankle does), and
 * ankle plantarflexion.
 */
```

3. Replace

```ts
  kneeFlexDeg: { min: -5, max: 150 },
  hipFlexDeg: { min: -15, max: 130 },
  ankleDorsiflexDeg: { min: -40, max: 40 },
```

   with

```ts
  kneeFlexDeg: { min: -5, max: 150 },
  hipFlexDeg: { min: -20, max: 130 },
  ankleDorsiflexDeg: { min: -40, max: 40 },
```

4. Replace

```ts
  restAnkleDeg: Record<Side, number>;
}
```

   with

```ts
  restAnkleDeg: Record<Side, number>;
  /** The hip's sagittal bend at rest (standing), per side: the hip angle's zero. */
  restHipDeg: Record<Side, number>;
}
```

5. Replace

```ts
  const sides = <T>(fn: (side: Side) => T): Record<Side, T> => ({ l: fn('l'), r: fn('r') });
  f = {
    hinges: {
      elbow: sides((s) => hinge('elbow', `upperarm_${s}`, `upperarm_${s}`, sub(P(`lowerarm_${s}`), P(`upperarm_${s}`)), forward)),
      knee: sides((s) => hinge('knee', `thigh_${s}`, `thigh_${s}`, sub(P(`calf_${s}`), P(`thigh_${s}`)), back)),
      hip: sides(() => hinge('hip', 'trunk (spine_03 → pelvis)', 'pelvis', sub(P('pelvis'), P('spine_03')), forward)),
    },
    restAnkleDeg: sides((s) => angleBetweenDeg(sub(P(`calf_${s}`), P(`foot_${s}`)), sub(P(`ball_${s}`), P(`foot_${s}`)))),
  };
```

   with

```ts
  const sides = <T>(fn: (side: Side) => T): Record<Side, T> => ({ l: fn('l'), r: fn('r') });
  const hinges = {
    elbow: sides((s) => hinge('elbow', `upperarm_${s}`, `upperarm_${s}`, sub(P(`lowerarm_${s}`), P(`upperarm_${s}`)), forward)),
    knee: sides((s) => hinge('knee', `thigh_${s}`, `thigh_${s}`, sub(P(`calf_${s}`), P(`thigh_${s}`)), back)),
    hip: sides(() => hinge('hip', 'trunk (spine_03 → pelvis)', 'pelvis', sub(P('pelvis'), P('spine_03')), forward)),
  };
  f = {
    hinges,
    restAnkleDeg: sides((s) => angleBetweenDeg(sub(P(`calf_${s}`), P(`foot_${s}`)), sub(P(`ball_${s}`), P(`foot_${s}`)))),
    restHipDeg: sides((s) => sagittalBendDeg(rest, hinges.hip[s], sub(P('pelvis'), P('spine_03')), sub(P(`calf_${s}`), P(`thigh_${s}`)))),
  };
```

6. Replace

```ts
/**
 * Signed joint angles (deg) for one side. Knee, elbow and hip: angle between the two segments, negative
 * when bent the wrong way (hyperextension; hip extension). Ankle: dorsiflexion, the decrease of the
 * shank-to-foot angle from the rest pose (negative = plantarflexion).
 */
export function jointAngles(sk: SkeletonDef, w: WorldPose, side: Side): JointAngles {
  const { hinges, restAnkleDeg } = rigFrame(sk);
  const p = (n: string) => w[`${n}_${side}`]!.position;
```

   with

```ts
/**
 * The hip's flexion about its hinge only: both segments projected onto the plane across the hinge axis,
 * so spreading the legs (abduction, a separate movement) does not read as flexion or extension. A thigh
 * spread straight out along the axis has no flexion to read, so it reads 0 instead of throwing.
 */
function sagittalBendDeg(w: WorldPose, hinge: Hinge, proximal: Vec3, distal: Vec3): number {
  const axis = normalize(rotate(w[hinge.carrier]!.rotation, hinge.axisLocal));
  const flat = (v: Vec3) => sub(v, scale(axis, dot(v, axis)));
  const [p, d] = [flat(proximal), flat(distal)];
  if (length(p) < 1e-6 * length(proximal) || length(d) < 1e-6 * length(distal)) return 0;
  return signedBendDeg(w, hinge, p, d);
}

/**
 * Signed joint angles (deg) for one side. Knee and elbow: angle between the two segments, negative
 * when bent the wrong way (hyperextension). Hip: the same about the hip's hinge only (legs spread apart
 * do not count), relative to standing (the rest pose reads 0), negative for extension. Ankle:
 * dorsiflexion, the decrease of the shank-to-foot angle from the rest pose (negative = plantarflexion).
 */
export function jointAngles(sk: SkeletonDef, w: WorldPose, side: Side): JointAngles {
  const { hinges, restAnkleDeg, restHipDeg } = rigFrame(sk);
  const p = (n: string) => w[`${n}_${side}`]!.position;
```

7. Replace

```ts
    kneeFlexDeg: signedBendDeg(w, hinges.knee[side], thigh, sub(p('foot'), p('calf'))),
    hipFlexDeg: signedBendDeg(w, hinges.hip[side], sub(w.pelvis!.position, w.spine_03!.position), thigh),
    ankleDorsiflexDeg: restAnkleDeg[side] - angleBetweenDeg(sub(p('calf'), p('foot')), sub(p('ball'), p('foot'))),
```

   with

```ts
    kneeFlexDeg: signedBendDeg(w, hinges.knee[side], thigh, sub(p('foot'), p('calf'))),
    hipFlexDeg: sagittalBendDeg(w, hinges.hip[side], sub(w.pelvis!.position, w.spine_03!.position), thigh) - restHipDeg[side],
    ankleDorsiflexDeg: restAnkleDeg[side] - angleBetweenDeg(sub(p('calf'), p('foot')), sub(p('ball'), p('foot'))),
```


**Edit `src/lib/figure/pose/validate.test.ts`** (1 change):

1. Replace

```ts
      }
      // The synthetic trunk line (pelvis → spine_03) leans back 3.6°, so the hanging thigh sits 2.9° behind it.
      expect(a.hipFlexDeg).toBeCloseTo(-2.88, 2);
      expect(a.ankleDorsiflexDeg).toBeCloseTo(0, 9);
```

   with

```ts
      }
      // The hip reads 0 when standing, whatever the rig's trunk line (the synthetic one leans back 3.6°).
      expect(a.hipFlexDeg).toBeCloseTo(0, 9);
      expect(a.ankleDorsiflexDeg).toBeCloseTo(0, 9);
```


- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: `solvePose.test.ts` 13 passed; `validate.test.ts` 12 passed (its rest-pose hip now reads 0); the M1 pose and real-rig asset tests still pass; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/pose
git commit -m $'feat(figure): pose any exercise from data with a generalized solver\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Pose library: pose data and solver" \
  --body $'Generalized pose data (anchored points, trunk, limb goals, contacts, props) and solvePose: hinge-rolled two-bone IK (issue #47 option b), straight-wrist bar grips, feet from anatomical directions, body proxies. The hip reads 0 standing, is measured about its hinge, and may extend to −20°.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** a frame written as data is solved at any stature with every limb on its goal, elbows and knees flexing on their hinges, and the M1 tests unchanged.

---
### Task 5: Pose library — validators

Every §8.1 rule for pose figures, one function: contacts within 1 cm (grip points, feet, declared body contacts — a part `along` a surface must touch at both ends), heels flat on their surface, bone lengths, signed joint limits and the wrist, nothing below the floor, 2 cm of air under a hanging body, the Smith bar held on its rail and within its stops (re-derived from the hands), the bar above the safety catches when they are drawn, the bench against the rack, held implements against the floor, the equipment and the body (a dumbbell may not sink into a thigh), the authored spine and neck within their ranges, the ceiling when one is given (profile only), and a warning when a body part sinks into equipment it does not rest on. The wrist is measured in the forearm's frame against its rest direction (Task 4's `wristBendDeg`), with a limit by grip: 30° holding, 25° pressing, 85° flat (controller decision 5). `poseTop` is the envelope the engine's ceiling check uses: head, body and held implements (not cables or handles).

**Files:**
- Create: `src/lib/figure/pose/validatePose.ts`
- Test: `src/lib/figure/pose/validatePose.test.ts`

**Interfaces:**
- Consumes: Task 4 (`bodyCapsules`, `contactGap`, `footPoints`, `gripPoint`, `wristBendDeg`, `gripKind`, `SOLID_PROP`, `SMITH_BAR_PART`, `PoseSolution`), `romFindings`, `headTop`, Task 1 `penetrationDepth`, `signedDistance`, `aabbOf`.
- Produces: `CONTACT_TOLERANCE_CM` (1), `HANG_CLEARANCE_CM` (2), `BODY_OVERLAP_CM` (2), `IMPLEMENT_IN_BODY_CM` (4), `WRIST_MAX_DEG` (`{ held: 30, press: 25, flat: 85 }`), `SPINE_LIMITS_DEG` (spine flexion −10…45, side bend ±20, twist ±30; neck flexion −30…45, turn ±60), `PoseCheckContext { scene; params; ceilingCm?; clearanceMarginCm? }`, `poseTop(sk, sol, props): number`, `validatePose(sk, frame, sol, props, ctx): Finding[]`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-pose-validators
```

- [ ] **Step 2: Write the failing test** (a passing and a failing fixture for every validator, spec §14)

**Create `src/lib/figure/pose/validatePose.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { buildDumbbell } from '../geometry/implements';
import { buildScene, ILLUSTRATIVE_SCENE, type SceneSpec } from '../geometry/scene';
import { bodyCapsules, capsuleGap, contactGap } from './body';
import { lerp } from '../math/vec3';
import { sphere } from '../geometry/built';
import { bothArms, bothLegs, type PoseFrame } from './poseSpec';
import { frameProps } from './props';
import { solvePose } from './solvePose';
import { syntheticSkeleton } from './synthetic';
import { STAND, stand } from './testing/frames';
import { poseTop, validatePose } from './validatePose';

const sk = syntheticSkeleton();

function check(frame: PoseFrame, spec: SceneSpec = {}, ctx: { ceilingCm?: number; statureCm?: number } = {}) {
  const scene = buildScene(spec);
  const sol = solvePose(sk, frame, { statureCm: ctx.statureCm ?? 175, scene, railZCm: spec.trainer ? ILLUSTRATIVE_SCENE.trainer.railZCm : undefined });
  const props = frameProps(frame, sol, ILLUSTRATIVE_SCENE);
  return { findings: validatePose(sk, frame, sol, props, { scene, params: ILLUSTRATIVE_SCENE, ceilingCm: ctx.ceilingCm }), sol, props };
}
const checks = (frame: PoseFrame, spec?: SceneSpec, ctx?: { ceilingCm?: number }) => check(frame, spec, ctx).findings.filter((f) => f.severity === 'error').map((f) => f.check);

describe('validatePose: every validator passes a good pose and catches a bad one (spec §8.1, §14)', () => {
  it('passes the standing frame', () => {
    expect(check(STAND).findings).toEqual([]);
  });
  it('anchor: a hand that cannot reach its grip', () => {
    expect(checks(stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [0, -90, 0] }, contact: true }) }))).toContain('anchor');
  });
  it('anchor: a foot that cannot reach the floor', () => {
    expect(checks(stand({ trunk: { hips: { bodyCm: [0, 99, 0] } } }))).toContain('anchor');
  });
  it('feet-flat: a flat foot with its heel up', () => {
    expect(checks(stand({ legs: bothLegs({ ...STAND.legs.l, sole: [0, -0.8, -0.6], toes: [0, -0.6, 0.8] }) }))).toContain('feet-flat');
  });
  it('anchor: a declared body contact that does not touch', () => {
    expect(checks(stand({ contacts: [{ part: 'pelvis', on: 'floor' }] }))).toEqual(['anchor']);
  });
  it('rom: a wrist bent past its limit', () => {
    const bent = bothArms({ ...STAND.arms.l, hand: { grip: 'free', palm: [0, 0, 1], fingers: [0, 1, 0] } });
    expect(checks(stand({ arms: bent }))).toContain('rom');
  });
  it('floor: a body placed through the floor', () => {
    const low = stand({ trunk: { hips: { bodyCm: [0, 5, 0] }, pitchDeg: -90 }, legs: bothLegs({ ...STAND.legs.l, contact: 'none', to: { from: 'body.hips', bodyCm: [10, 0, 80] } }) });
    expect(checks(low)).toContain('floor');
  });
  it('hang-clearance: a hanging frame with the feet on the floor', () => {
    expect(checks(stand({ hanging: true }))).toEqual(['hang-clearance']);
  });
  describe('the Smith bar (standing behind the rail, bar at shoulder height)', () => {
    const grip = bothArms({ to: { hold: 'smith-bar', alongCm: 30 }, elbow: [0.3, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
    const press = stand({ trunk: { hips: { bodyCm: [0, 89.5, -20] } }, arms: grip, props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 10, 0] } } });
    it('passes a bar on its rails within the stops', () => {
      expect(checks(press, { trainer: {} })).toEqual([]);
    });
    it('bench-rack: a bench through an upright', () => {
      expect(checks(press, { trainer: {}, bench: { at: [58, 0, 40], angleDeg: 0 } })).toContain('bench-rack');
    });
    it('bar-travel: a bar above its highest stop', () => {
      const high = { ...ILLUSTRATIVE_SCENE.trainer, highestBarHeightCm: 140 };
      const scene = buildScene({ trainer: {} }, { ...ILLUSTRATIVE_SCENE, trainer: high });
      const sol = solvePose(sk, press, { statureCm: 175, scene, railZCm: 0 });
      expect(validatePose(sk, press, sol, [], { scene, params: { ...ILLUSTRATIVE_SCENE, trainer: high } }).map((x) => x.check)).toEqual(['bar-travel']);
    });
    it('bar-travel: a bar below the safety catches it is drawn with (spec §12: no bypassed stop)', () => {
      expect(checks(press, { trainer: { catchHeightCm: 100 } })).toEqual([]);
      expect(checks(press, { trainer: { catchHeightCm: 170 } })).toEqual(['bar-travel']);
    });
    it('rom: a pressing wrist bent back about 45° (elbows flared wide of a narrow grip)', () => {
      const flared = bothArms({ to: { hold: 'smith-bar', alongCm: 20 }, elbow: [1, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
      const { findings } = check({ ...press, arms: flared }, { trainer: {} });
      expect(findings.map((f) => f.message)).toEqual([expect.stringMatching(/^wrist_l bent 4\d° exceeds 25°/), expect.stringMatching(/^wrist_r bent 4\d° exceeds 25°/)]);
    });
  });
  it('rom: the authored spine and neck stay within their limits', () => {
    expect(checks(stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, spine: { flexDeg: 44, twistDeg: -29 }, head: { flexDeg: 44, turnDeg: 59 } } }))).toEqual([]);
    const bent = checks(stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, spine: { flexDeg: 50, sideDeg: 25 }, head: { flexDeg: -35, turnDeg: 70 } } }));
    expect(bent.filter((c) => c === 'rom')).toHaveLength(4);
  });
  it('implement: a held dumbbell inside the body is an error, touching it a warning, a declared touch neither', () => {
    const scene = buildScene({});
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    // A 5 cm dumbbell head beside the thigh (capsule radius 7.5 cm): `dx` from the thigh's axis.
    const thigh = lerp(sol.world.thigh_l!.position, sol.world.calf_l!.position, 0.4);
    const head = (dx: number) => [sphere('dumbbell-l-head-a', [thigh[0] + dx, thigh[1], thigh[2]], 5, 'rubber')];
    const run = (frame: PoseFrame, dx: number) => validatePose(sk, frame, sol, head(dx), { scene, params: ILLUSTRATIVE_SCENE }).map((f) => `${f.severity} ${f.check}`);
    expect(run(STAND, 6)).toEqual(['error implement']);
    expect(run(STAND, 9.5)).toEqual(['warn body-overlap']);
    expect(run(STAND, 14)).toEqual([]);
    expect(run(stand({ touches: [{ part: 'thigh_l', prop: 'dumbbell-l' }] }), 0)).toEqual([]);
  });
  it('a loose contact is not measured, only excused from the overlap warning', () => {
    expect(checks(stand({ contacts: [{ part: 'pelvis', on: 'floor', loose: true }] }))).toEqual([]);
  });
  it('implement: a dumbbell through the floor or the equipment', () => {
    const scene = buildScene({ bench: { at: [0, 0, 120], angleDeg: 0 } });
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const run = (props: ReturnType<typeof buildDumbbell>) => [...new Set(validatePose(sk, STAND, sol, props, { scene, params: ILLUSTRATIVE_SCENE }).map((f) => f.check))];
    expect(run(buildDumbbell('dumbbell-l', [0, 3, 60], [1, 0, 0]))).toEqual(['implement']);
    expect(run(buildDumbbell('dumbbell-l', [0, 40, 135], [1, 0, 0]))).toEqual(['implement']);
    expect(run(buildDumbbell('dumbbell-l', [0, 80, 60], [1, 0, 0]))).toEqual([]);
  });
  it('ceiling: only when a ceiling is given', () => {
    expect(checks(STAND, {}, { ceilingCm: 175 })).toEqual(['ceiling']);
    expect(checks(STAND, {}, { ceilingCm: 244 })).toEqual([]);
  });
  it('body-overlap (warn): standing inside a bench', () => {
    const { findings } = check(STAND, { bench: { at: [0, 0, -10], angleDeg: 0 } });
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.some((f) => f.check === 'body-overlap' && f.severity === 'warn')).toBe(true);
  });
});

describe('body proxies', () => {
  it('reports the highest point of body and implements', () => {
    const { sol, props } = check(stand({ props: { dumbbells: ['l'] } }));
    expect(poseTop(sk, sol, props)).toBeCloseTo(175 - 1.5, 0); // hips 1.5 cm below rest
  });
  it('measures a lying-along contact by its worse end', () => {
    const { sol } = check(STAND);
    const shank = bodyCapsules(sk, sol.world, 1, 1).find((c) => c.part === 'shank_l')!;
    const floor = buildScene({}).surfaces.floor!;
    expect(contactGap(shank, floor)).toBeCloseTo(capsuleGap(shank, floor));
    expect(contactGap(shank, floor, true)).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/pose/validatePose.test.ts`
Expected: FAIL — `Failed to resolve import "./validatePose"`.

- [ ] **Step 4: Implement**

**Create `src/lib/figure/pose/validatePose.ts`:**

```ts
import { type Vec3, distance, dot, length, midpoint, normalize, sub } from '../math/vec3';
import type { Built } from '../geometry/built';
import { aabbOf, penetrationDepth, type Primitive, signedDistance } from '../geometry/primitives';
import type { SceneParams } from '../geometry/scene';
import { bodyBottom, bodyCapsules, bodyTop, type Capsule, contactGap, footPoints, gripPoint, wristBendDeg } from './body';
import type { Side } from './hands';
import type { PoseFrame } from './poseSpec';
import { SMITH_BAR_PART, SOLID_PROP } from './props';
import type { SkeletonDef } from './skeleton';
import { gripKind, type PoseSolution } from './solvePose';
import { type Finding, headTop, romFindings } from './validate';

/** Spec §8.1: anchored parts within 1 cm of their targets. */
export const CONTACT_TOLERANCE_CM = 1;
/** Hanging bodies keep this much air under them. */
export const HANG_CLEARANCE_CM = 2;
/** A body part may sink this far into padding or skin contact before it counts as overlapping. */
export const BODY_OVERLAP_CM = 2;
/** A held implement may reach this far into the body before it counts as passing through it (spec §12). */
export const IMPLEMENT_IN_BODY_CM = 4;
/**
 * Wrist bend (the hand's direction against its rest direction, both in the forearm's frame) the
 * validators accept: a hand holding something stays near neutral, a pressing hand even more so (bent-back
 * wrists under a press are a form fault); a hand flat on the floor or a pad bends back as far as a
 * push-up needs.
 */
export const WRIST_MAX_DEG = { held: 30, press: 25, flat: 85 } as const;
/** Limits on the authored trunk and neck (deg): a neutral spine and gaze, as figures teach. */
export const SPINE_LIMITS_DEG = {
  spineFlex: { min: -10, max: 45 },
  spineSide: { min: -20, max: 20 },
  spineTwist: { min: -30, max: 30 },
  headFlex: { min: -30, max: 45 },
  headTurn: { min: -60, max: 60 },
} as const;

export interface PoseCheckContext {
  scene: Built;
  params: SceneParams;
  /** Room ceiling (profile only, spec §8.1): omit for illustrative renders. */
  ceilingCm?: number;
  clearanceMarginCm?: number;
}

/** Highest point of the body and what it moves (cm): head, every capsule, held implements and the Smith bar with its plates (not cables or handles). */
export function poseTop(sk: SkeletonDef, sol: PoseSolution, props: readonly Primitive[]): number {
  const caps = bodyCapsules(sk, sol.world, sol.scaleFactor, sol.k);
  const carried = props.filter((p) => SOLID_PROP.test(p.id) || SMITH_BAR_PART.test(p.id));
  return Math.max(headTop(sk, sol.world, sol.scaleFactor)[1], bodyTop(caps), ...carried.map((p) => aabbOf(p).max[1]));
}

/** Authored spine and neck angles outside `SPINE_LIMITS_DEG`, as findings. */
function spineFindings(frame: PoseFrame): Finding[] {
  const t = frame.trunk;
  const values: Record<keyof typeof SPINE_LIMITS_DEG, number> = {
    spineFlex: t.spine?.flexDeg ?? 0,
    spineSide: t.spine?.sideDeg ?? 0,
    spineTwist: t.spine?.twistDeg ?? 0,
    headFlex: t.head?.flexDeg ?? 0,
    headTurn: t.head?.turnDeg ?? 0,
  };
  const out: Finding[] = [];
  for (const [k, { min, max }] of Object.entries(SPINE_LIMITS_DEG) as Array<[keyof typeof SPINE_LIMITS_DEG, { min: number; max: number }]>) {
    const v = values[k];
    if (v < min || v > max) out.push({ check: 'rom', severity: 'error', message: `${k} at ${v.toFixed(0)}° is outside ${min}…${max}°` });
  }
  return out;
}

/**
 * Every validator of spec §8.1 for one solved frame: contacts (hands, feet, declared body contacts)
 * within 1 cm, feet flat, bone lengths, signed joint limits, the wrists, the authored spine and neck,
 * nothing below the floor, hanging clearance, the Smith bar on its rail, within its stops and above its
 * safety catches, bench against rack, held implements against the floor, the equipment and the body,
 * the ceiling (only when given), and a warning when a body part sinks into equipment or a held implement
 * it does not declare contact with.
 */
export function validatePose(sk: SkeletonDef, frame: PoseFrame, sol: PoseSolution, props: readonly Primitive[], ctx: PoseCheckContext): Finding[] {
  const out: Finding[] = [];
  const error = (check: Finding['check'], message: string) => out.push({ check, severity: 'error', message });
  const w = sol.world;
  const s = sol.scaleFactor;
  const k = sol.k;
  const caps = bodyCapsules(sk, w, s, k);

  // Hands.
  for (const side of ['l', 'r'] as const) {
    const goal = frame.arms[side];
    const checked = goal.contact ?? ('hold' in goal.to || goal.hand.grip === 'flat');
    if (!checked) continue;
    const d = distance(gripPoint(w, side, gripKind(goal), k), sol.handTargets[side]);
    if (d > CONTACT_TOLERANCE_CM) error('anchor', `hand_${side} is ${d.toFixed(1)} cm from its grip`);
  }
  // Feet.
  for (const side of ['l', 'r'] as const) {
    const goal = frame.legs[side];
    if (goal.contact === 'none') continue;
    const { ball, heel } = footPoints(sk, w, side, s, k);
    const d = distance(ball, sol.footTargets[side]);
    if (d > CONTACT_TOLERANCE_CM) error('anchor', `foot_${side} is ${d.toFixed(1)} cm from its target`);
    if (goal.contact === 'flat') {
      const surface = ctx.scene.surfaces[goal.on ?? 'floor'];
      if (surface?.kind === 'plane') {
        const lift = Math.abs(dot(sub(heel, surface.point), normalize(surface.normal)));
        if (lift > 1.5) error('feet-flat', `heel_${side} is ${lift.toFixed(1)} cm off its surface`);
      }
    }
  }
  // Declared body contacts (a loose one is only excused from the overlap warning).
  for (const c of frame.contacts ?? []) {
    if (c.loose) continue;
    const cap = caps.find((x) => x.part === c.part);
    const surface = ctx.scene.surfaces[c.on];
    if (!cap || !surface) throw new Error(`frame "${frame.id}": unknown contact ${c.part} on ${c.on}`);
    const gap = contactGap(cap, surface, c.along);
    if (Math.abs(gap) > CONTACT_TOLERANCE_CM) error('anchor', `${c.part} is ${gap.toFixed(1)} cm ${gap > 0 ? 'above' : 'into'} ${c.on}`);
  }

  // Bone lengths.
  for (const bone of sk.bones) {
    if (!bone.parent) continue;
    const expected = length(bone.restLocalT) * s;
    const actual = distance(w[bone.name]!.position, w[bone.parent]!.position);
    if (Math.abs(actual - expected) > 0.1) error('bone-length', `${bone.name} length changed by ${(actual - expected).toFixed(2)} cm`);
  }

  // Joint limits: signed knees, elbows and hips (the solver bends them on their hinges), ankles, wrists,
  // and the authored spine and neck. An arm posed without the hinge roll (issue #47, option a) has its
  // elbows checked by bend magnitude only.
  const hinged = frame.arms.l.hinge !== false && frame.arms.r.hinge !== false;
  out.push(...romFindings(sk, w, { signedElbow: hinged }));
  for (const side of ['l', 'r'] as const) {
    const bend = wristBendDeg(sk, w, side);
    const kind = gripKind(frame.arms[side]);
    const max = WRIST_MAX_DEG[kind === 'flat' ? 'flat' : kind === 'press' ? 'press' : 'held'];
    if (bend > max) error('rom', `wrist_${side} bent ${bend.toFixed(0)}° exceeds ${max}°`);
  }
  out.push(...spineFindings(frame));

  // Floor and hanging.
  // Feet count by their sole points (ball and heel); the rounded foot capsule dips when the foot tilts.
  let low = bodyBottom(caps.filter((c) => !c.part.startsWith('foot_')));
  for (const side of ['l', 'r'] as const) {
    for (const p of Object.values(footPoints(sk, w, side, s, k))) if (p[1] < low.y) low = { part: `foot_${side}`, y: p[1] };
  }
  if (low.y < -CONTACT_TOLERANCE_CM) error('floor', `${low.part} reaches ${(-low.y).toFixed(1)} cm below the floor`);
  if (frame.hanging && low.y < HANG_CLEARANCE_CM) error('hang-clearance', `hanging, ${low.part} is only ${low.y.toFixed(1)} cm above the floor`);

  // The Smith bar, re-derived from the hands that hold it.
  if (sol.smithBar) {
    const held = midpoint(gripPoint(w, 'l', gripKind(frame.arms.l), k), gripPoint(w, 'r', gripKind(frame.arms.r), k));
    const offRail = Math.abs(held[2] - sol.smithBar[2]);
    if (offRail > 0.5 || Math.abs(held[0]) > 0.5) error('bar-on-rail', `the hands hold the bar ${offRail.toFixed(1)} cm off the rail and ${Math.abs(held[0]).toFixed(1)} cm off centre`);
    const t = ctx.params.trainer;
    if (held[1] < t.lowestBarHeightCm || held[1] > t.highestBarHeightCm) {
      error('bar-travel', `bar at ${held[1].toFixed(0)} cm is outside ${t.lowestBarHeightCm}–${t.highestBarHeightCm} cm`);
    }
    // Spec §12: no figure shows a bypassed stop, so the bar stays above the safety catches it is drawn with.
    const catches = ctx.scene.anchors['smith.catch'];
    if (catches && held[1] < catches[1] - 0.5) error('bar-travel', `bar at ${held[1].toFixed(0)} cm is below the safety catches at ${catches[1].toFixed(0)} cm`);
  }

  // Bench against the rack; implements against the floor and the equipment.
  const benchPrims = ctx.scene.prims.filter((p) => p.id.startsWith('bench-'));
  const frameParts = ctx.scene.prims.filter((p) => !p.id.startsWith('bench-'));
  if (ctx.scene.anchors['smith.rail']) {
    for (const bp of benchPrims) {
      for (const fp of frameParts) {
        if (penetrationDepth(bp, fp) > 0.5 || penetrationDepth(fp, bp) > 0.5) error('bench-rack', `${bp.id} intersects ${fp.id}`);
      }
    }
  }
  for (const ip of props.filter((p) => SOLID_PROP.test(p.id))) {
    if (aabbOf(ip).min[1] < -0.5) error('implement', `${ip.id} goes through the floor`);
    for (const sp of ctx.scene.prims) if (penetrationDepth(ip, sp) > 0.5) error('implement', `${ip.id} intersects ${sp.id}`);
  }

  // The ceiling, when the room is known.
  if (ctx.ceilingCm !== undefined) {
    const margin = ctx.clearanceMarginCm ?? 10;
    const top = poseTop(sk, sol, props);
    if (top > ctx.ceilingCm - margin) error('ceiling', `highest point ${top.toFixed(0)} cm leaves less than ${margin} cm below the ${ctx.ceilingCm} cm ceiling`);
  }

  // Warn: a body part sinking into equipment it does not rest on. Hands are skipped: they grip things.
  const excused = new Set((frame.contacts ?? []).map((c) => `${c.part}|${ctx.scene.surfaces[c.on]?.primitive ?? ''}`));
  for (const cap of caps.filter((c) => !c.part.startsWith('hand_'))) {
    for (const prim of ctx.scene.prims) {
      if (excused.has(`${cap.part}|${prim.id}`) || footRestsOn(frame, cap, prim, ctx.scene)) continue;
      const depth = capsuleDepth(cap, prim);
      if (depth > BODY_OVERLAP_CM) out.push({ check: 'body-overlap', severity: 'warn', message: `${cap.part} sinks ${depth.toFixed(1)} cm into ${prim.id}` });
    }
  }
  // Held implements against the body (hands and forearms hold them): a warning past 2 cm, and an error
  // past 4 cm, where the implement would pass through a limb (spec §12). A frame may declare a touch.
  const touches = frame.touches ?? [];
  const held = props.filter((p) => SOLID_PROP.test(p.id) || SMITH_BAR_PART.test(p.id));
  for (const cap of caps.filter((c) => !/^(hand|forearm)_/.test(c.part))) {
    for (const prop of held) {
      if (touches.some((t) => t.part === cap.part && prop.id.startsWith(t.prop))) continue;
      const depth = capsuleDepth(cap, prop);
      if (depth > IMPLEMENT_IN_BODY_CM) error('implement', `${prop.id} is ${depth.toFixed(1)} cm inside ${cap.part}`);
      else if (depth > BODY_OVERLAP_CM) out.push({ check: 'body-overlap', severity: 'warn', message: `${cap.part} sinks ${depth.toFixed(1)} cm into ${prop.id}` });
    }
  }
  return out;
}

/** Feet and shanks may touch the surface their foot stands on. */
function footRestsOn(frame: PoseFrame, cap: Capsule, prim: Primitive, scene: Built): boolean {
  const m = /^(foot|shank)_(l|r)$/.exec(cap.part);
  if (!m) return false;
  const on = frame.legs[m[2] as Side].on ?? 'floor';
  return scene.surfaces[on]?.primitive === prim.id;
}

/** How deep a capsule reaches into a primitive (cm, ≥ 0), sampled along its axis. */
function capsuleDepth(c: Capsule, p: Primitive): number {
  let depth = 0;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const point: Vec3 = [c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t, c.a[2] + (c.b[2] - c.a[2]) * t];
    depth = Math.max(depth, c.r - signedDistance(p, point));
  }
  return depth;
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/figure && npm run lint && npm run check`
Expected: `validatePose.test.ts` 21 passed (among them: a press with a 45° wrist fails, the bar below the catches fails, a dumbbell 6 cm into the thigh is an error and 9.5 cm from its axis a warning, an out-of-range spine and neck fail); 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/pose/validatePose.ts src/lib/figure/pose/validatePose.test.ts
git commit -m $'feat(figure): validate posed figures against every spec §8.1 rule\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Pose library: validators" \
  --body $'validatePose: contacts, feet, bone lengths, joint limits, wrists by grip (30/25/85°), spine and neck, floor and hanging clearance, the Smith bar on its rail, within its stops and above its catches, bench against rack, implements against floor, equipment and body, ceiling, and a body-overlap warning; poseTop for the engine.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** each validator passes the standing test frame and fails a frame built to break it.

---
### Task 6: Figure models, sweep and a viewer for any figure

`FigureModel` is the single interface the renderer, the viewer, the engine and the sweep use (controller decision 7): frames with labels and cues, a play order, the fixed scene and camera at a stature, and `pose(sk, frame | in-between, ctx)` returning bone rotations, root, moving props, the movement arrow, findings, the envelope and the Smith bar height. `poseFigure` wraps a pose spec, settling in-between poses onto their contacts with a short secant search (at most 5 steps; a part lying `along` a surface settles on the mean of its end gaps, so the search converges); every posed figure reports how many times it ran the solver (`solves`); `pose(…, { validate: false })` skips the validators and is what Play uses; `smithSquatFigure` wraps the M1 squat unchanged. `interpolatePoseFrame` blends two keyframes (controller decision 6). The first library figure, the dumbbell curl, proves the path end to end. The figure sweep (spec §14) runs every figure × keyframe and in-between pose × five statures on the real rig in `npm test`.

The 3D layer and the island move to `FigureModel`: `mountFigure` takes a figure and a stature, draws fixed equipment once and moves the props per pose; `mountEquipment` draws one model. `FigureViewer` takes the figure's metadata (so the page stays small and serializable), loads the figure registry with three.js, poses at `statureCm` (175, "typical height"), can offer a height picker, and shows the "both sides" badge. The M1 spike page and render harness are adapted to the new API; Tasks 7 and 8 replace them.

**Files:**
- Create: `src/lib/figure/pose/interpolate.ts`, `src/lib/figure/figures.ts`, `src/lib/figure/fixtures/db-curl.ts`, `src/lib/figure/scene3d/layout.ts`
- Replace: `src/lib/figure/fixtures/index.ts`, `src/lib/figure/scene3d/figureScene.ts`, `src/components/figure/FigureViewer.tsx`, `src/components/figure/FigureFrames.astro`
- Modify: `src/lib/figure/scene3d/stage.ts`, `src/pages/render/[figure].astro`, `src/pages/[lang]/dev/figure-spike.astro`, `src/components/figure/figure.css`, `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts`
- Test: `src/lib/figure/pose/interpolate.test.ts`, `src/lib/figure/figures.test.ts`, `tests/assets/figure-sweep.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; M1 `checkFigureFrame`, `interpolateFrame`, `barArrow`, `PLAY_ORDER`, `carriedBarCenter`, `REAL_SKELETON`, `loadHuman`, `applyPose`, stage functions.
- Produces:
  - `interpolate.ts`: `slerpDir(a, b, t)`, `interpolatePoseFrame(a, b, t): PoseFrame`.
  - `figures.ts`: `FigureContext { statureCm; params?; ceilingCm?; clearanceMarginCm? }`, `FrameRef = number | { from; to; t }`, `PosedFigure { frameId; scaleFactor; local; rootPosition; world; props; arrow; findings; topCm; smithBarCm?; solves }`, `OrbitSpec`, `PoseOptions { validate?: boolean }` (false: no findings, no arrow, `topCm` NaN), `SETTLE_TOLERANCE_CM` (0.05), `SETTLE_STEPS` (5), `PosedFigure.solves`, `FigureModel { id; name; frames; playOrder; unilateral; expectedFailures; scene(sk, ctx); camera(ctx); pose(sk, frame, ctx, opts?) }`, `poseFigure(spec)`, `smithSquatFigure(spec)`, `FigureMeta`, `figureMeta(f)`.
  - `fixtures/index.ts`: `POSE_SPECS: readonly PoseFigureSpec[]`, `FIGURES: Readonly<Record<string, FigureModel>>` (was `Record<string, SmithSquatSpec>`; `Object.keys(FIGURES)` is unchanged for the catalog).
  - `scene3d/figureScene.ts`: `mountFigure(canvas, { width, height, modelUrl, figure, statureCm?, pixelRatio? }): Promise<FigureScene>` (`showFrame`, `showBetween`, `arrow`, `render`, `resize`, `dispose`, `stage`, `view`), `mountEquipment(canvas, { width, height, model, pixelRatio? })`, `DEFAULT_STATURE_CM`.
  - `scene3d/layout.ts`: `stageHeightFor(width)` (re-exported from `stage.ts`), so the island's first load does not pull in three.js.
  - `FigureViewer` props: `{ lang; modelUrl; figure: FigureMeta; fallbackImages; statureCm?; statureChoices? }`; `FigureFrames` props: `{ lang; figure: FigureMeta; images }`.
  - i18n keys `figure.typicalHeight`, `figure.shownAt` (`{height}`), `figure.height`, `figure.bothSides`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figure-models
```

- [ ] **Step 2: Write the failing tests**

**Create `src/lib/figure/pose/interpolate.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, length, type Vec3 } from '../math/vec3';
import { interpolatePoseFrame, slerpDir } from './interpolate';
import { bothArms, bothLegs } from './poseSpec';
import { STAND, stand } from './testing/frames';

describe('slerpDir', () => {
  it('turns along the shorter arc at a steady rate', () => {
    const mid = slerpDir([1, 0, 0], [0, 1, 0], 0.5);
    expect(mid[0]).toBeCloseTo(Math.SQRT1_2);
    expect(mid[1]).toBeCloseTo(Math.SQRT1_2);
    expect(angleBetweenDeg(slerpDir([1, 0, 0], [0, 0, 1], 0.25), [1, 0, 0])).toBeCloseTo(22.5);
  });
  it('picks a side for opposite directions instead of passing through zero', () => {
    expect(length(slerpDir([0, 0, 1], [0, 0, -1], 0.5))).toBeCloseTo(1);
  });
});

describe('interpolatePoseFrame', () => {
  const low = stand({ trunk: { hips: { bodyCm: [0, 80, 0] }, pitchDeg: 20 } });
  it('blends numbers and keeps names, labels and flags from the first frame', () => {
    const f = interpolatePoseFrame(STAND, low, 0.5);
    expect(f.trunk.hips.bodyCm).toEqual([0, 84.75, 0]);
    expect(f.trunk.pitchDeg).toBeCloseTo(10);
    expect(f.label).toBe(STAND.label);
    expect(f.id).toBe('stand>stand@0.5');
    expect(f.arrow).toBeUndefined();
  });
  it('swings a hand placed from a shoulder around it (length blends, direction turns)', () => {
    const up = stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [0, 55, 0] } }) });
    const down = stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [55, 0, 0] } }) });
    const mid = interpolatePoseFrame(up, down, 0.5).arms.l.to as { bodyCm: Vec3 };
    expect(length(mid.bodyCm)).toBeCloseTo(55);
  });
  it('turns directions (palms, poles) instead of blending them straight', () => {
    const a = stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }) });
    const b = stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] } }) });
    const h = interpolatePoseFrame(a, b, 0.5).arms.l.hand;
    expect(h.grip === 'bar' && length(h.palm)).toBeCloseTo(1);
  });
  it('keeps only the contacts both frames declare, and a foot is flat only when flat in both', () => {
    const a = stand({ contacts: [{ part: 'pelvis', on: 'floor' }, { part: 'chest', on: 'floor' }] });
    const b = stand({ contacts: [{ part: 'chest', on: 'floor' }], legs: bothLegs({ ...STAND.legs.l, contact: 'ball' }), hanging: true });
    const f = interpolatePoseFrame(a, b, 0.5);
    expect(f.contacts).toEqual([{ part: 'chest', on: 'floor' }]);
    expect(f.legs.l.contact).toBe('ball');
    expect(f.hanging).toBe(false);
  });
  it('drops a hand contact unless the hand is flat on a surface in both frames', () => {
    const flat = bothArms({ to: { from: 'body.shoulder_l', yFromFloor: true, bodyCm: [5, 0, 30] }, elbow: [0, 0, -1], hand: { grip: 'flat', palm: [0, -1, 0], fingers: [0, 0, 1] } });
    expect(interpolatePoseFrame(stand({ arms: flat }), stand({ arms: flat }), 0.5).arms.l.contact).toBeUndefined();
    expect(interpolatePoseFrame(stand({ arms: flat }), STAND, 0.5).arms.l.contact).toBe(false);
  });
  it('refuses points measured from different anchors', () => {
    const other = stand({ trunk: { hips: { from: 'body.head', bodyCm: [0, 0, 0] } } });
    expect(() => interpolatePoseFrame(STAND, other, 0.5)).toThrow(/same anchor/);
  });
});
```

**Create `src/lib/figure/figures.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { distance } from './math/vec3';
import { figureMeta, poseFigure, smithSquatFigure } from './figures';
import { SMITH_SQUAT } from './fixtures/smith-squat';
import { FIGURES, POSE_SPECS } from './fixtures';
import { barArrow } from './overlay';
import { ILLUSTRATIVE_SMITH } from './geometry/smith';
import { checkFigureFrame } from './pose/checkFigureFrame';
import { REAL_SKELETON } from './pose/realSkeleton';
import type { PoseFigureSpec } from './pose/poseSpec';
import { syntheticSkeleton } from './pose/synthetic';
import { STAND, stand } from './pose/testing/frames';

const sk = syntheticSkeleton();
const T = { en: 'Test', zh: '测试' };
const spec: PoseFigureSpec = {
  kind: 'pose',
  id: 'test-curl',
  name: T,
  scene: {},
  camera: { azimuthDeg: 30, elevationDeg: 5, distanceCm: 400, target: { bodyCm: [0, 100, 0] } },
  frames: [
    { ...STAND, id: 'a', arrow: { track: 'hand_l', toward: 1, offsetCm: [10, 0, 0] } },
    stand({ id: 'b', trunk: { hips: { bodyCm: [0, 80, 0] } } }),
    stand({ id: 'c', arrow: { track: 'hips', toward: 0 } }),
  ],
};

describe('poseFigure', () => {
  const fig = poseFigure(spec);
  it('exposes frames, default play order and camera scaled with stature', () => {
    expect(fig.frames.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(fig.playOrder).toEqual([0, 1, 2, 0]);
    expect(fig.camera({ statureCm: 200 }).distanceCm).toBeCloseTo((400 * 200) / 175);
    expect(fig.camera({ statureCm: 200 }).targetCm[1]).toBeCloseTo((100 * 200) / 175);
  });
  it('poses and validates keyframes and in-between poses', () => {
    expect(fig.pose(sk, 0, { statureCm: 175 }).findings).toEqual([]);
    expect(fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 }).frameId).toBe('a>b@0.5');
    expect(() => fig.pose(sk, 5, { statureCm: 175 })).toThrow(RangeError);
  });
  it('draws an arrow of fixed length toward the tracked point in the target frame, and none when it does not move', () => {
    const a = fig.pose(sk, 0, { statureCm: 175 }).arrow!;
    expect(distance(a.from, a.to)).toBeCloseTo(36);
    expect(a.to[1]).toBeLessThan(a.from[1]); // frame b is lower
    expect(fig.pose(sk, 2, { statureCm: 175 }).arrow).toBeNull();
  });
  it('only poses when asked not to validate (the viewer Play)', () => {
    const drawn = fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 }, { validate: false });
    const checked = fig.pose(sk, { from: 0, to: 1, t: 0.5 }, { statureCm: 175 });
    expect(drawn.local).toEqual(checked.local);
    expect([drawn.findings, drawn.arrow, Number.isNaN(drawn.topCm)]).toEqual([[], null, true]);
    // Standing frames declare no body contact, so nothing is settled: one solve, plus one for the arrow's target.
    expect([drawn.solves, fig.pose(sk, 0, { statureCm: 175 }).solves, fig.pose(sk, 1, { statureCm: 175 }).solves]).toEqual([1, 2, 1]);
  });
  it('builds the fixed scene once per set of equipment dimensions', () => {
    expect(fig.scene(sk, { statureCm: 175 })).toBe(fig.scene(sk, { statureCm: 190 }));
  });
  it('settles an in-between pose back onto the contact both frames keep', () => {
    const lying = (hipsY: number, pitchDeg: number) =>
      stand({ trunk: { hips: { bodyCm: [0, hipsY, 0] }, pitchDeg }, contacts: [{ part: 'chest', on: 'floor' }], legs: { l: { ...STAND.legs.l, contact: 'none', to: { from: 'body.hips', bodyCm: [10, 0, 80] } }, r: { ...STAND.legs.r, contact: 'none', to: { from: 'body.hips', bodyCm: [-10, 0, 80] } } } });
    const f = poseFigure({ ...spec, frames: [{ ...lying(12, -90), id: 'a', arrow: undefined }, lying(30, -120), lying(12, -90)] });
    for (const t of [0.25, 0.5, 0.75]) {
      const posed = f.pose(sk, { from: 0, to: 1, t }, { statureCm: 175 });
      expect(posed.findings.filter((x) => x.check === 'anchor')).toEqual([]);
      // Converged well before the search runs out (1 + 1 + SETTLE_STEPS + 1 = 8 solves).
      expect(posed.solves).toBeLessThanOrEqual(5);
    }
  });
});

describe('smithSquatFigure (the M1 squat, unchanged)', () => {
  const fig = FIGURES['smith-squat']!;
  it('poses exactly what checkFigureFrame does, with the M1 arrow and the bar parts at the bar', () => {
    SMITH_SQUAT.frames.forEach((frame, i) => {
      const posed = fig.pose(REAL_SKELETON, i, { statureCm: 175 });
      const { solution, findings } = checkFigureFrame(REAL_SKELETON, SMITH_SQUAT, frame, { statureCm: 175, smith: ILLUSTRATIVE_SMITH });
      expect(posed.local).toEqual(solution.local);
      expect(posed.findings).toEqual(findings);
      expect(posed.arrow).toEqual(barArrow(frame.arrow, solution.barCenter, ILLUSTRATIVE_SMITH));
      const bar = posed.props.find((p) => p.id === 'bar')!;
      expect(bar.kind === 'cylinder' && bar.start[1]).toBeCloseTo(solution.barCenter[1]);
    });
  });
  it('draws the catches below the lowest bar of the set and the camera as in M1', () => {
    const catches = fig.scene(REAL_SKELETON, { statureCm: 175 }).prims.filter((p) => p.id.startsWith('catch-'));
    expect(catches).toHaveLength(2);
    expect(fig.camera({ statureCm: 175 })).toEqual({ azimuthDeg: 35, elevationDeg: 6, distanceCm: 520, targetCm: [0, 100, 0] });
    expect(smithSquatFigure(SMITH_SQUAT).expectedFailures).toEqual([]);
  });
});

describe('the figure library', () => {
  it('gives every figure three frames and a unique id', () => {
    for (const f of Object.values(FIGURES)) expect(f.frames, f.id).toHaveLength(3);
    expect(Object.keys(FIGURES)).toHaveLength(POSE_SPECS.length + 1);
  });
  it('gives pages plain, serializable metadata', () => {
    const meta = figureMeta(FIGURES['db-curl']!);
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
    expect(meta.frames.map((f) => f.label.en)).toEqual(['Start', 'Top', 'Lower']);
  });
});
```

**Create `tests/assets/figure-sweep.test.ts`:**

```ts
/**
 * The figure sweep (spec §14): every figure × keyframe × stature {150, 165, 175, 190, 200}, and the
 * in-between poses the viewer's Play shows, pass every validator on the committed human with illustrative
 * equipment — errors and warnings alike, so a body part sinking into equipment is caught too — unless the
 * figure declares that case an expected failure, which must then really fail with the checks it names.
 */
import { describe, expect, it } from 'vitest';
import { FIGURES } from '../../src/lib/figure/fixtures';
import type { FrameRef } from '../../src/lib/figure/figures';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';

export const SWEEP_STATURES = [150, 165, 175, 190, 200] as const;
const BETWEEN = [0.25, 0.5, 0.75];
/**
 * Play poses a figure on every animation frame, so its cost is budgeted in solver runs, which do not
 * depend on the machine: settling an in-between pose may take two solves plus two secant steps, then
 * the pose itself. A search that runs out of steps (1 + 1 + SETTLE_STEPS + 1 = 8) has not converged.
 * In the dry run the most any figure needed was 4. Each solve takes well under 1 ms on a laptop.
 */
const PLAY_MAX_SOLVES = 5;
/** A loose wall-clock sanity bound (ms per unvalidated in-between pose), far above any machine's cost. */
const PLAY_SANITY_MS = 100;

describe.each(Object.values(FIGURES).map((f) => [f.id, f] as const))('figure %s', (_id, fig) => {
  const refs: Array<{ name: string; ref: FrameRef }> = [
    ...fig.frames.map((f, i) => ({ name: f.id, ref: i })),
    ...fig.playOrder.slice(0, -1).flatMap((from, s) => BETWEEN.map((t) => ({ name: `${fig.frames[from]!.id}→${fig.frames[fig.playOrder[s + 1]!]!.id}@${t}`, ref: { from, to: fig.playOrder[s + 1]!, t } }))),
  ];
  it.each(SWEEP_STATURES)(
    'poses cleanly at %i cm',
    (statureCm) => {
      const expected = fig.expectedFailures.find((e) => e.statures.includes(statureCm));
      const found = refs.map(({ name, ref }) => ({ name, findings: fig.pose(REAL_SKELETON, ref, { statureCm }).findings }));
      if (!expected) {
        for (const e of found) expect(e.findings.map((f) => `${f.severity} ${f.check}: ${f.message}`), `${statureCm} cm / ${e.name}`).toEqual([]);
        return;
      }
      const failed = found.flatMap((e) => e.findings.map((f) => f.check));
      expect(failed.length, `expected failure "${expected.reason}" no longer fails`).toBeGreaterThan(0);
      expect([...new Set(failed)].every((c) => expected.checks.includes(c)), `unexpected checks: ${failed.join(', ')}`).toBe(true);
    },
    30_000,
  );
  it('poses in-between frames cheaply enough for Play', () => {
    const between = (i: number): FrameRef => ({ from: fig.playOrder[i % (fig.playOrder.length - 1)]!, to: fig.playOrder[(i % (fig.playOrder.length - 1)) + 1]!, t: ((i * 7) % 10) / 10 + 0.05 });
    const n = 20;
    const start = performance.now();
    for (const statureCm of SWEEP_STATURES) {
      for (let i = 0; i < n; i++) {
        const { solves } = fig.pose(REAL_SKELETON, between(i), { statureCm }, { validate: false });
        expect(solves, `${statureCm} cm, in-between pose ${i}`).toBeLessThanOrEqual(PLAY_MAX_SOLVES);
      }
    }
    expect((performance.now() - start) / (n * SWEEP_STATURES.length)).toBeLessThan(PLAY_SANITY_MS);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/figure/pose/interpolate.test.ts src/lib/figure/figures.test.ts tests/assets/figure-sweep.test.ts`
Expected: FAIL — `Failed to resolve import "./interpolate"` / `"./figures"`, and the sweep cannot call `pose` on the M1 registry.

- [ ] **Step 4: Implement the figure models and the first library figure**

**Create `src/lib/figure/pose/interpolate.ts`:**

```ts
import { type Vec3, cross, dot, length, normalize, scale } from '../math/vec3';
import { fromAxisAngle, rotate } from '../math/quat';
import type { ArmGoal, BodyContact, LegGoal, PointRef, PoseFrame } from './poseSpec';

type Json = number | string | boolean | null | undefined | readonly Json[] | { readonly [k: string]: Json };

/** Fields that hold directions: they turn along the shorter arc instead of blending straight. */
const DIRECTIONS = new Set(['elbow', 'knee', 'palm', 'fingers', 'axis', 'sole', 'toes']);

/** Turn unit-free direction `a` toward `b` by fraction `t` of the angle between them. */
export function slerpDir(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = normalize(a);
  const v = normalize(b);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
  if (angle < 1e-6) return u;
  let axis = cross(u, v);
  if (length(axis) < 1e-6) axis = cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return rotate(fromAxisAngle(axis, angle * t), u);
}

/** An offset from a shoulder swings around it: direction along the arc, length blended. */
function swingOffset(a: Vec3, b: Vec3, t: number): Vec3 {
  const la = length(a);
  const lb = length(b);
  if (la < 1e-6 || lb < 1e-6) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return scale(slerpDir(a, b, t), la + (lb - la) * t);
}

/** What a field left out of one frame means: 0 for numbers and vectors, empty for objects. */
function absent(other: Json): Json {
  if (typeof other === 'number') return 0;
  if (Array.isArray(other)) return other.map(() => 0);
  if (other && typeof other === 'object') return {};
  return other;
}

/** Numbers blend (a field one frame leaves out counts as 0), directions turn; names and flags come from `a`. */
function blend(a: Json, b: Json, t: number, key = ''): Json {
  if (DIRECTIONS.has(key) && (a === undefined || b === undefined)) return a ?? b;
  if (a === undefined) a = absent(b);
  if (b === undefined) b = absent(a);
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    if (DIRECTIONS.has(key) && a.length === 3) return slerpDir(a as unknown as Vec3, b as unknown as Vec3, t) as unknown as Json;
    return a.map((v, i) => blend(v as Json, b[i] as Json, t));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as { readonly [k: string]: Json };
    const bo = b as { readonly [k: string]: Json };
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])];
    return Object.fromEntries(keys.map((k) => [k, blend(ao[k], bo[k], t, k)]));
  }
  return a;
}

function blendPoint(a: PointRef, b: PointRef, t: number, where: string): PointRef {
  if ((a.from ?? 'floor') !== (b.from ?? 'floor')) {
    throw new Error(`interpolate: ${where} is measured from "${a.from ?? 'floor'}" in one frame and "${b.from ?? 'floor'}" in the next; use the same anchor`);
  }
  const level = (p: PointRef) => (p.yFromFloor === true ? 1 : typeof p.yFromFloor === 'number' ? p.yFromFloor : 0);
  const mixed = { ...(blend(a as unknown as Json, b as unknown as Json, t) as unknown as PointRef), yFromFloor: level(a) + (level(b) - level(a)) * t };
  const swing = a.from?.startsWith('body.shoulder') && a.bodyCm && b.bodyCm;
  return swing ? { ...mixed, bodyCm: swingOffset(a.bodyCm!, b.bodyCm!, t) } : mixed;
}

function blendArm(a: ArmGoal, b: ArmGoal, t: number, where: string): ArmGoal {
  const blended = blend(a as unknown as Json, b as unknown as Json, t) as unknown as ArmGoal;
  // A hand changing how it is held keeps the first frame's hold and only turns its palm.
  const mixed = a.hand.grip === b.hand.grip ? blended : { ...blended, hand: { ...a.hand, palm: slerpDir(a.hand.palm, b.hand.palm, t) } };
  if ('hold' in a.to || 'hold' in b.to) {
    if (!('hold' in a.to && 'hold' in b.to && a.to.hold === b.to.hold)) throw new Error(`interpolate: ${where} holds different things in consecutive frames`);
    return mixed;
  }
  // A hand only stays on a surface in between if it is flat on one in both frames.
  const onSurface = a.hand.grip === 'flat' && b.hand.grip === 'flat';
  return { ...mixed, to: blendPoint(a.to, b.to as PointRef, t, where), ...(!onSurface && { contact: false }) };
}

/** A contact both frames keep: 'flat' only if both are flat, 'none' if either is free. */
function blendContact(a: LegGoal['contact'], b: LegGoal['contact']): LegGoal['contact'] {
  if (a === 'none' || b === 'none') return 'none';
  return a === 'flat' && b === 'flat' ? 'flat' : 'ball';
}

const sameContact = (x: BodyContact, y: BodyContact) => x.part === y.part && x.on === y.on;

/**
 * An in-between frame at `t` (0..1) from `a` to `b`, for the viewer's Play and the sweep. Numbers blend;
 * directions (elbows, knees, palms, feet) turn along the shorter arc; a hand placed from a shoulder swings
 * around it. Both frames must measure each point from the same anchor. Only contacts both frames declare
 * are kept, and a foot is flat only when it is flat in both. (The figure then settles the body back onto
 * its contacts; see `poseFigure`.)
 */
export function interpolatePoseFrame(a: PoseFrame, b: PoseFrame, t: number): PoseFrame {
  const mixed = blend(a as unknown as Json, b as unknown as Json, t) as unknown as PoseFrame;
  const where = (part: string) => `${a.id}→${b.id} ${part}`;
  return {
    ...mixed,
    id: `${a.id}>${b.id}@${Number(t.toFixed(3))}`,
    label: a.label,
    cue: a.cue,
    trunk: { ...mixed.trunk, hips: blendPoint(a.trunk.hips, b.trunk.hips, t, where('hips')) },
    arms: { l: blendArm(a.arms.l, b.arms.l, t, where('left hand')), r: blendArm(a.arms.r, b.arms.r, t, where('right hand')) },
    legs: {
      l: { ...mixed.legs.l, to: blendPoint(a.legs.l.to, b.legs.l.to, t, where('left foot')), contact: blendContact(a.legs.l.contact, b.legs.l.contact) },
      r: { ...mixed.legs.r, to: blendPoint(a.legs.r.to, b.legs.r.to, t, where('right foot')), contact: blendContact(a.legs.r.contact, b.legs.r.contact) },
    },
    contacts: (a.contacts ?? []).filter((c) => (b.contacts ?? []).some((d) => sameContact(c, d))),
    hanging: Boolean(a.hanging && b.hanging),
    arrow: undefined,
  };
}
```

**Create `src/lib/figure/figures.ts`:**

```ts
import { type Vec3, add, distance, midpoint, normalize, scale, sub } from './math/vec3';
import type { Quat } from './math/quat';
import type { I18nText } from '../i18n/locales';
import type { Built } from './geometry/built';
import type { Primitive } from './geometry/primitives';
import { buildScene, ILLUSTRATIVE_SCENE, type SceneParams } from './geometry/scene';
import { buildSmith, catchHeightFor } from './geometry/smith';
import { smithMovingParts, smithPart } from './geometry/trainer';
import { barArrow } from './overlay';
import { checkFigureFrame } from './pose/checkFigureFrame';
import { bodyCapsules, capsuleGap, gripPoint } from './pose/body';
import { interpolatePoseFrame } from './pose/interpolate';
import { PLAY_ORDER } from './pose/playOrder';
import { type ExpectedFailure, type PoseFigureSpec, type PoseFrame, REFERENCE_STATURE_CM, type TrackPoint } from './pose/poseSpec';
import { frameProps } from './pose/props';
import type { SkeletonDef, WorldPose } from './pose/skeleton';
import { interpolateFrame, type SmithSquatSpec } from './pose/smithSquat';
import { gripKind, type PoseSolution, resolvePoint, solvePose } from './pose/solvePose';
import { carriedBarCenter, type Finding, headTop } from './pose/validate';
import { poseTop, validatePose } from './pose/validatePose';

/** What changes a figure's pose besides the frame: stature, equipment dimensions and (profile only) the room. */
export interface FigureContext {
  statureCm: number;
  /** Equipment dimensions; default illustrative (D12). */
  params?: SceneParams;
  ceilingCm?: number;
  clearanceMarginCm?: number;
}

/** A keyframe, or an in-between pose `t` of the way from keyframe `from` to `to` (the viewer's Play). */
export type FrameRef = number | { from: number; to: number; t: number };

/**
 * `validate: false` only poses (for drawing, e.g. every animation frame of Play): no findings, no
 * envelope (`topCm` is NaN) and no arrow. Default true.
 */
export interface PoseOptions {
  validate?: boolean;
}

/** One solved and validated pose, ready to draw. */
export interface PosedFigure {
  frameId: string;
  scaleFactor: number;
  local: Readonly<Record<string, Quat>>;
  rootPosition: Vec3;
  world: WorldPose;
  /** Moving equipment in this pose. */
  props: Primitive[];
  /** Movement arrow (world cm); keyframes only. */
  arrow: { from: Vec3; to: Vec3 } | null;
  findings: Finding[];
  /** Highest point of the body and implements (cm), for the ceiling check; NaN when not validated. */
  topCm: number;
  /** Smith bar centre height (cm, floor to bar centre), when the frame moves the Smith bar. */
  smithBarCm?: number;
  /** How many times the solver ran for this pose (settling an in-between pose, the pose, the arrow's target). */
  solves: number;
}

export interface OrbitSpec {
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

/**
 * A figure as every consumer sees it (renderer, viewer, engine probe, sweep): three labelled frames that
 * can be posed at any stature and equipment dimensions, a fixed scene and a camera.
 */
export interface FigureModel {
  id: string;
  name: I18nText;
  frames: ReadonlyArray<{ id: string; label: I18nText; cue: I18nText }>;
  playOrder: readonly number[];
  unilateral: boolean;
  expectedFailures: readonly ExpectedFailure[];
  /** The fixed equipment at this stature and these dimensions. */
  scene(sk: SkeletonDef, ctx: FigureContext): Built;
  camera(ctx: FigureContext): OrbitSpec;
  pose(sk: SkeletonDef, frame: FrameRef, ctx: FigureContext, opts?: PoseOptions): PosedFigure;
}

const ARROW_CM = 36;
/** Settling in-between poses: stop within this gap (cm), after at most this many secant steps. */
export const SETTLE_TOLERANCE_CM = 0.05;
export const SETTLE_STEPS = 5;

// ── Generalized pose figures ────────────────────────────────────────────────────

/** Where a tracked point is in a solved frame. */
function track(p: TrackPoint, frame: PoseFrame, sol: PoseSolution): Vec3 {
  const w = sol.world;
  const grip = (side: 'l' | 'r') => gripPoint(w, side, gripKind(frame.arms[side]), sol.k);
  switch (p) {
    case 'hands':
      return midpoint(grip('l'), grip('r'));
    case 'hand_l':
      return grip('l');
    case 'hand_r':
      return grip('r');
    case 'bar': {
      const bar = sol.smithBar ?? sol.anchors['hold.barbell'] ?? sol.anchors['hold.ab-wheel'];
      if (!bar) throw new Error(`frame "${frame.id}": an arrow tracks the bar, but the frame holds none`);
      return bar;
    }
    case 'hips':
      return sol.anchors['body.hips']!;
    case 'chest':
      return sol.anchors['body.chest']!;
    case 'head':
      return w.head!.position;
    case 'knees':
      return midpoint(w.calf_l!.position, w.calf_r!.position);
    case 'feet':
      return midpoint(w.foot_l!.position, w.foot_r!.position);
  }
}

/** Wrap a generalized pose spec (`kind: 'pose'`) as a figure. */
export function poseFigure(spec: PoseFigureSpec): FigureModel {
  const paramsOf = (ctx: FigureContext) => ctx.params ?? ILLUSTRATIVE_SCENE;
  // The fixed scene depends only on the equipment dimensions: build it once per set of them.
  let cached: { params: SceneParams; built: Built } | undefined;
  const scene = (ctx: FigureContext): Built => {
    const params = paramsOf(ctx);
    if (cached?.params !== params) cached = { params, built: buildScene(spec.scene, params) };
    return cached.built;
  };
  const railZ = (ctx: FigureContext) => (spec.scene.trainer ? paramsOf(ctx).trainer.railZCm : undefined);
  const solveOne = (sk: SkeletonDef, frame: PoseFrame, ctx: FigureContext, built: Built, settleCm = 0) => {
    const sol = solvePose(sk, frame, { statureCm: ctx.statureCm, scene: built, railZCm: railZ(ctx), settleCm });
    return { sol, props: frameProps(frame, sol, paramsOf(ctx)) };
  };
  /**
   * Blending two keyframes moves the hips along a straight line, but a body resting on a contact (knees
   * on a pad, shoulders on the floor) moves along an arc: settle the in-between pose vertically until its
   * first declared, measured contact touches again. The gap changes almost one for one with the hips'
   * height, so a secant search from "move down by the gap" settles within 0.05 cm in a few solves.
   * A part lying along a surface (a forearm on the floor) is settled on the mean of its two end gaps:
   * the validator's larger end gap is V-shaped and never reaches 0 while the part tilts, while the mean
   * is smooth, so the search converges and both ends stay within the tolerance of the surface.
   * Returns the settle offset and how many solves it took.
   */
  const settle = (sk: SkeletonDef, frame: PoseFrame, ctx: FigureContext, built: Built): { cm: number; solves: number } => {
    const contact = frame.contacts?.find((c) => !c.loose);
    if (!contact) return { cm: 0, solves: 0 };
    const surface = built.surfaces[contact.on]!;
    let solves = 0;
    const gap = (d: number) => {
      solves++;
      const { sol } = solveOne(sk, frame, ctx, built, d);
      const cap = bodyCapsules(sk, sol.world, sol.scaleFactor, sol.k).find((c) => c.part === contact.part)!;
      return contact.along ? (capsuleGap({ ...cap, b: cap.a }, surface) + capsuleGap({ ...cap, a: cap.b }, surface)) / 2 : capsuleGap(cap, surface);
    };
    let [d0, g0] = [0, gap(0)];
    if (Math.abs(g0) < SETTLE_TOLERANCE_CM) return { cm: 0, solves };
    let [d1, g1] = [-g0, gap(-g0)];
    for (let i = 0; i < SETTLE_STEPS && Math.abs(g1) >= SETTLE_TOLERANCE_CM && g1 !== g0; i++) {
      const d2 = Math.max(-40, Math.min(40, d1 - (g1 * (d1 - d0)) / (g1 - g0)));
      [d0, g0] = [d1, g1];
      [d1, g1] = [d2, gap(d2)];
    }
    return { cm: d1, solves };
  };
  return {
    id: spec.id,
    name: spec.name,
    frames: spec.frames.map((f) => ({ id: f.id, label: f.label, cue: f.cue })),
    playOrder: spec.playOrder ?? PLAY_ORDER,
    unilateral: spec.unilateral ?? false,
    expectedFailures: spec.expectedFailures ?? [],
    scene: (_sk, ctx) => scene(ctx),
    camera: (ctx) => {
      const k = ctx.statureCm / REFERENCE_STATURE_CM;
      return {
        azimuthDeg: spec.camera.azimuthDeg,
        elevationDeg: spec.camera.elevationDeg,
        distanceCm: spec.camera.distanceCm * k,
        targetCm: resolvePoint(spec.camera.target, scene(ctx).anchors, k),
      };
    },
    pose: (sk, ref, ctx, opts = {}) => {
      const built = scene(ctx);
      const frame = typeof ref === 'number' ? spec.frames[ref] : interpolatePoseFrame(spec.frames[ref.from]!, spec.frames[ref.to]!, ref.t);
      if (!frame) throw new RangeError(`${spec.id}: no frame ${String(ref)}`);
      const settled = typeof ref === 'number' ? { cm: 0, solves: 0 } : settle(sk, frame, ctx, built);
      const { sol, props } = solveOne(sk, frame, ctx, built, settled.cm);
      let solves = settled.solves + 1;
      const base = { frameId: frame.id, scaleFactor: sol.scaleFactor, local: sol.local, rootPosition: sol.rootPosition, world: sol.world, props, ...(sol.smithBar && { smithBarCm: sol.smithBar[1] }) };
      if (opts.validate === false) return { ...base, arrow: null, findings: [], topCm: Number.NaN, solves };
      const findings = validatePose(sk, frame, sol, props, { scene: built, params: paramsOf(ctx), ceilingCm: ctx.ceilingCm, clearanceMarginCm: ctx.clearanceMarginCm });
      let arrow: PosedFigure['arrow'] = null;
      if (frame.arrow) {
        const next = spec.frames[frame.arrow.toward]!;
        const there = solveOne(sk, next, ctx, built);
        solves++;
        const from = track(frame.arrow.track, frame, sol);
        const to = track(frame.arrow.track, next, there.sol);
        if (distance(from, to) > 2) {
          const start = add(from, scale(frame.arrow.offsetCm ?? [0, 0, 0], sol.k));
          arrow = { from: start, to: add(start, scale(normalize(sub(to, from)), ARROW_CM * sol.k)) };
        }
      }
      return { ...base, arrow, findings, topCm: poseTop(sk, sol, props), solves };
    },
  };
}

// ── The M1 Smith squat, on its own solver ──────────────────────────────────────

/**
 * Wrap the M1 Smith-squat spec as a figure. Its solver, validator and look are unchanged (the owner
 * signed off on them in M1): the rail comes from the machine, the elbows are checked by bend magnitude
 * only (issue #47, option a), and the arrow runs beside the bar.
 */
export function smithSquatFigure(spec: SmithSquatSpec): FigureModel {
  const smithOf = (ctx: FigureContext) => smithPart((ctx.params ?? ILLUSTRATIVE_SCENE).trainer);
  return {
    id: spec.id,
    name: spec.name,
    frames: spec.frames.map((f) => ({ id: f.id, label: f.label, cue: f.cue })),
    playOrder: PLAY_ORDER,
    unilateral: false,
    expectedFailures: [],
    // The catches sit just below the lowest bar of the set (M1 behaviour), which depends on stature.
    scene: (sk, ctx) => {
      const smith = smithOf(ctx);
      const lowest = Math.min(...spec.frames.map((f) => checkFigureFrame(sk, spec, f, { statureCm: ctx.statureCm, smith }).solution.barCenter[1]));
      return { prims: buildSmith(smith, { barHeightCm: smith.lowestBarHeightCm, catchHeightCm: catchHeightFor(smith, lowest) }).filter((p) => !/^(bar$|plate-|carriage-)/.test(p.id)), anchors: { floor: [0, 0, 0] }, surfaces: {} };
    },
    camera: (ctx) => {
      const k = ctx.statureCm / REFERENCE_STATURE_CM;
      return { azimuthDeg: spec.camera.azimuthDeg, elevationDeg: spec.camera.elevationDeg, distanceCm: spec.camera.distanceCm * k, targetCm: [0, spec.camera.targetYCm * k, smithOf(ctx).railZCm] };
    },
    pose: (sk, ref, ctx) => {
      const smith = smithOf(ctx);
      const frame = typeof ref === 'number' ? spec.frames[ref] : interpolateFrame(spec.frames[ref.from]!, spec.frames[ref.to]!, ref.t);
      if (!frame) throw new RangeError(`${spec.id}: no frame ${String(ref)}`);
      const { solution, findings } = checkFigureFrame(sk, spec, frame, { statureCm: ctx.statureCm, smith, ceilingCm: ctx.ceilingCm, clearanceMarginCm: ctx.clearanceMarginCm });
      const barY = carriedBarCenter(sk, solution, spec.barRestOffsetCm)[1];
      const arrow = typeof ref === 'number' ? barArrow(frame.arrow, solution.barCenter, smith) : null;
      return {
        frameId: frame.id,
        scaleFactor: solution.scaleFactor,
        local: solution.local,
        rootPosition: solution.rootPosition,
        world: solution.world,
        props: smithMovingParts(smith, solution.barCenter[1]),
        arrow,
        findings,
        topCm: Math.max(headTop(sk, solution.world, solution.scaleFactor)[1], barY + smith.plateDiameterCm / 2),
        smithBarCm: barY,
        solves: 1,
      };
    },
  };
}

/** What pages and the viewer island need before the 3D code loads: plain, serializable data. */
export interface FigureMeta {
  id: string;
  name: I18nText;
  frames: ReadonlyArray<{ label: I18nText; cue: I18nText }>;
  unilateral: boolean;
}

export const figureMeta = (f: FigureModel): FigureMeta => ({ id: f.id, name: f.name, frames: f.frames.map(({ label, cue }) => ({ label, cue })), unilateral: f.unilateral });
```

**Create `src/lib/figure/fixtures/db-curl.ts`:**

```ts
import { bothArms, bothLegs, type LegGoal, type PoseFigureSpec } from '../pose/poseSpec';

const stance: LegGoal = { to: { bodyCm: [12, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.12, 0, 1], contact: 'flat' };

/** Standing dumbbell curl (elbow flexion): palms forward, elbows at the sides. */
export const DB_CURL: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-curl',
  name: { en: 'Dumbbell Curl', zh: '哑铃弯举' },
  scene: {},
  camera: { azimuthDeg: 55, elevationDeg: 6, distanceCm: 380, target: { bodyCm: [0, 100, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Arms long, palms forward, elbows by your sides', zh: '手臂伸直，掌心向前，肘部贴近身体' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [10, -57, 11] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [12, 0, 6] },
    },
    {
      id: 'top',
      label: { en: 'Top', zh: '顶端' },
      cue: { en: 'Curl up without moving the elbows forward', zh: '向上弯举，肘部不要前移' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [1, -10, 22] }, elbow: [0, -1, -0.3], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0.4, -1] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower slowly to straight arms', zh: '慢慢下放至手臂伸直' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [2, -32, 30] }, elbow: [0, -1, -0.2], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 1, 0] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [12, 0, 6] },
    },
  ],
};
```

**Replace `src/lib/figure/fixtures/index.ts` with:**

```ts
import { type FigureModel, poseFigure, smithSquatFigure } from '../figures';
import type { PoseFigureSpec } from '../pose/poseSpec';
import { DB_CURL } from './db-curl';
import { SMITH_SQUAT } from './smith-squat';

/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL];

/** Every figure the renderer, viewer, engine and sweep know, by id: the M1 Smith squat plus the pose library. */
export const FIGURES: Readonly<Record<string, FigureModel>> = Object.fromEntries(
  [smithSquatFigure(SMITH_SQUAT), ...POSE_SPECS.map(poseFigure)].map((f) => [f.id, f]),
);
```

- [ ] **Step 5: Run the pure tests**

Run: `npx vitest run src/lib/figure tests/assets`
Expected: `interpolate.test.ts` 8, `figures.test.ts` 10 and `figure-sweep.test.ts` 12 (two figures × five statures, plus a Play budget test per figure: at every stature, 20 unvalidated in-between poses each run the solver at most 5 times, with a loose 100 ms wall-clock sanity bound) passed; everything else unchanged.

- [ ] **Step 6: Move the 3D layer and the island to FigureModel**

**Create `src/lib/figure/scene3d/layout.ts`:**

```ts
/** Canvas height for a given width: the viewer is 4:3 portrait. (No three.js here, so the island's first load stays small.) */
export function stageHeightFor(width: number): number {
  return Math.round((width * 4) / 3);
}
```

**Edit `src/lib/figure/scene3d/stage.ts`** (1 change):

1. Replace

```ts

/** Canvas height for a given width: the viewer is 4:3 portrait. */
export function stageHeightFor(width: number): number {
  return Math.round((width * 4) / 3);
}

```

   with

```ts

export { stageHeightFor } from './layout';

```


**Replace `src/lib/figure/scene3d/figureScene.ts` with:**

```ts
import type { FigureContext, FigureModel, PosedFigure } from '../figures';
import type { EquipmentModel } from '../geometry/models';
import { REAL_SKELETON } from '../pose/realSkeleton';
import { createEquipment } from './equipment';
import { applyPose, loadHuman } from './human';
import { createStage, disposeStage, type OrbitView, projectCm, renderStage, resizeStage, setOrbitView, type Stage } from './stage';

export const DEFAULT_STATURE_CM = 175;

export interface FigureScene {
  stage: Stage;
  view: OrbitView;
  showFrame(index: number): PosedFigure;
  /** Solve and show an in-between pose (t in 0..1); constraints hold at every step. */
  showBetween(from: number, to: number, t: number): PosedFigure;
  /** The frame's movement arrow projected to canvas pixels, if it has one. */
  arrow(index: number): { from: [number, number]; to: [number, number] } | null;
  render(): void;
  /** Resize the canvas drawing buffer, camera and arrow projection to `width` x `height` CSS pixels. Call `render()` afterwards. */
  resize(width: number, height: number, pixelRatio?: number): void;
  dispose(): void;
}

export interface MountOptions {
  width: number;
  height: number;
  modelUrl: string;
  figure: FigureModel;
  statureCm?: number;
  pixelRatio?: number;
}

/** Mount a figure: fixed equipment, the human, and the moving props of whichever pose is shown. */
export async function mountFigure(canvas: HTMLCanvasElement, opts: MountOptions): Promise<FigureScene> {
  const { figure } = opts;
  const ctx: FigureContext = { statureCm: opts.statureCm ?? DEFAULT_STATURE_CM };
  const sk = REAL_SKELETON;
  const keyframes = figure.frames.map((_, i) => figure.pose(sk, i, ctx));
  const view: OrbitView = figure.camera(ctx);

  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  const fixed = createEquipment('equipment');
  const moving = createEquipment('props');
  let rig: Awaited<ReturnType<typeof loadHuman>>;
  try {
    setOrbitView(stage, view);
    fixed.update(figure.scene(sk, ctx).prims);
    stage.scene.add(fixed.group, moving.group);
    rig = await loadHuman(opts.modelUrl);
    stage.scene.add(rig.root);
  } catch (e) {
    disposeStage(stage); // do not leak the WebGL context when the model fails to load
    throw e;
  }

  const show = (posed: PosedFigure) => {
    applyPose(rig, { local: posed.local, rootPosition: posed.rootPosition }, posed.scaleFactor);
    moving.update(posed.props);
    return posed;
  };
  const n = figure.frames.length;
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;

  return {
    stage,
    view,
    showFrame: (i) => {
      if (!valid(i)) throw new RangeError(`showFrame(${i}): frame index must be an integer in 0..${n - 1}`);
      return show(keyframes[i]!);
    },
    showBetween: (a, b, t) => {
      if (!valid(a) || !valid(b)) throw new RangeError(`showBetween(${a}, ${b}): frame indices must be integers in 0..${n - 1}`);
      // Play draws every animation frame: pose only, without validating (the sweep validates these poses).
      return show(figure.pose(sk, { from: a, to: b, t }, ctx, { validate: false }));
    },
    arrow: (i) => {
      const a = keyframes[i]?.arrow;
      return a ? { from: projectCm(stage, a.from), to: projectCm(stage, a.to) } : null;
    },
    render: () => renderStage(stage),
    resize: (w, h, pixelRatio) => resizeStage(stage, w, h, pixelRatio),
    dispose: () => {
      fixed.dispose();
      moving.dispose();
      disposeStage(stage);
    },
  };
}

/** Mount one equipment model alone (equipment views and stills), with its illustrative dimensions. */
export function mountEquipment(canvas: HTMLCanvasElement, opts: { width: number; height: number; model: EquipmentModel; pixelRatio?: number }): Omit<FigureScene, 'showFrame' | 'showBetween' | 'arrow'> {
  const stage = createStage(canvas, opts.width, opts.height, opts.pixelRatio);
  const eq = createEquipment('equipment');
  eq.update(opts.model.build().prims);
  stage.scene.add(eq.group);
  setOrbitView(stage, opts.model.view);
  return {
    stage,
    view: opts.model.view,
    render: () => renderStage(stage),
    resize: (w, h, pixelRatio) => resizeStage(stage, w, h, pixelRatio),
    dispose: () => {
      eq.dispose();
      disposeStage(stage);
    },
  };
}
```

**Replace `src/components/figure/FigureViewer.tsx` with:**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { arrowPaths } from '../../lib/figure/arrow';
import type { FigureMeta } from '../../lib/figure/figures';
import type { FigureScene } from '../../lib/figure/scene3d/figureScene';
import { stageHeightFor } from '../../lib/figure/scene3d/layout';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

/** The stature figures are drawn at when none is given (spec §7.1: a typical adult height). */
const TYPICAL_STATURE_CM = 175;

interface Props {
  lang: Locale;
  modelUrl: string;
  figure: FigureMeta;
  fallbackImages: string[];
  /** The viewer's stature (the profile's, M4); omitted = typical height. */
  statureCm?: number;
  /** Offer a height picker with these statures (the dev figure pages). */
  statureChoices?: readonly number[];
}

type Status = 'loading' | 'ready' | 'unavailable' | 'error';
type Arrow = ReturnType<FigureScene['arrow']>;

function hasWebgl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
  // Release the probe context immediately so it does not count against the browser's context limit.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return Boolean(gl);
}

const SEGMENT_MS = 1200;

/**
 * The interactive 3D figure (spec §8.4): any figure in the library, posed at a stature, animated between
 * its frames and orbitable. three.js, the solver and the figure data load only when the island mounts;
 * without WebGL, or if the model fails, it shows the pre-rendered frames.
 */
export default function FigureViewer({ lang, modelUrl, figure, fallbackImages, statureCm, statureChoices }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The frame whose arrow is on screen, or null when none is (orbiting, playing). Lets a resize re-project it.
  const arrowFrameRef = useRef<number | null>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>('loading');
  const [size, setSize] = useState<[number, number]>([600, 800]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [arrow, setArrow] = useState<Arrow>(null);
  const [stature, setStature] = useState(statureCm ?? TYPICAL_STATURE_CM);
  const [playOrder, setPlayOrder] = useState<readonly number[]>([0, 1, 2, 0]);

  const showArrow = (index: number | null) => {
    arrowFrameRef.current = index;
    const scene = sceneRef.current;
    setArrow(index === null || !scene ? null : scene.arrow(index));
  };

  useEffect(() => {
    let cancelled = false;
    let sceneDisposed = false;
    let scene: FigureScene | undefined;
    let controls: { dispose(): void } | undefined;
    let orbitFrame = 0; // pending requestAnimationFrame id for an orbit re-render, 0 if none
    let resizeFrame = 0; // pending requestAnimationFrame id for a resize, 0 if none
    let observer: ResizeObserver | undefined;
    setStatus('loading');
    // Disposal tracks the scene, not the effect: a no-op until mountFigure has produced a scene,
    // then idempotent, so the scene (and controls, if created) are released exactly once.
    const disposeScene = () => {
      if (!scene || sceneDisposed) return;
      sceneDisposed = true;
      cancelAnimationFrame(orbitFrame);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      controls?.dispose();
      scene.dispose();
    };
    (async () => {
      try {
        if (!hasWebgl()) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        const canvas = canvasRef.current!;
        const width = canvas.clientWidth || 600;
        const height = stageHeightFor(width);
        const [{ mountFigure }, { FIGURES }, { OrbitControls }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('../../lib/figure/fixtures'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        const model = FIGURES[figure.id];
        if (!model) throw new Error(`Unknown figure: ${figure.id}`);
        scene = await mountFigure(canvas, { width, height, modelUrl, figure: model, statureCm: stature, pixelRatio: Math.min(window.devicePixelRatio, 2) });
        if (cancelled) {
          disposeScene(); // unmounted (or the height changed) while mountFigure was loading
          return;
        }
        const mounted = scene;
        const orbit = new OrbitControls(mounted.stage.camera, canvas);
        controls = orbit;
        const [tx, ty, tz] = mounted.view.targetCm;
        orbit.target.set(tx / 100, ty / 100, tz / 100);
        orbit.enablePan = false;
        orbit.minDistance = 1.5;
        orbit.maxDistance = 9;
        orbit.update();
        orbit.saveState();
        // A drag fires 'change' on every pointermove; render at most once per animation frame so a slow
        // GPU (or software WebGL) never queues up a backlog of renders on the main thread.
        orbit.addEventListener('change', () => {
          showArrow(null);
          if (!orbitFrame) {
            orbitFrame = requestAnimationFrame(() => {
              orbitFrame = 0;
              mounted.render();
            });
          }
        });
        resetRef.current = () => {
          orbit.reset();
          cancelAnimationFrame(orbitFrame); // render now instead
          orbitFrame = 0;
          mounted.render();
        };
        sceneRef.current = mounted;
        setPlayOrder(model.playOrder);
        setSize([width, height]);
        setStatus('ready');
        // Follow the stage's width (the canvas is 4:3 via CSS): resize the renderer and camera, re-render,
        // resize the overlay's viewBox and re-project the arrow. Coalesced to one pass per animation frame.
        // Browser zoom changes the CSS width and devicePixelRatio together, so both are tracked.
        const pixelRatio = () => Math.min(window.devicePixelRatio, 2);
        let lastWidth = width;
        let lastRatio = pixelRatio();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(() => {
              resizeFrame = 0;
              try {
                const w = canvas.clientWidth;
                const ratio = pixelRatio();
                if (!w || (w === lastWidth && ratio === lastRatio)) return;
                lastWidth = w;
                lastRatio = ratio;
                const h = stageHeightFor(w);
                mounted.resize(w, h, ratio);
                cancelAnimationFrame(orbitFrame); // this render covers a pending orbit render
                orbitFrame = 0;
                mounted.render();
                setSize([w, h]);
                const shown = arrowFrameRef.current;
                if (shown !== null) setArrow(mounted.arrow(shown));
              } catch (err) {
                console.error('3D figure resize failed:', err);
              }
            });
          });
          observer.observe(stageRef.current!);
        }
      } catch (err) {
        console.error('3D figure failed to load:', err);
        sceneRef.current = null;
        disposeScene(); // no-op if mountFigure itself threw (it disposes its own stage)
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      sceneRef.current = null;
      disposeScene(); // no-op while still loading; the async path disposes once mountFigure resolves
    };
  }, [figure.id, stature]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (status !== 'ready' || !scene || playing) return;
    scene.showFrame(frame);
    scene.render();
    showArrow(frame);
  }, [status, frame, playing]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!playing || !scene) return;
    showArrow(null);
    let raf = 0;
    // Time from the first rAF timestamp, not performance.now(): rAF passes the frame's start time,
    // which can be earlier than "now" in this effect and would make `total` negative.
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const total = Math.max(0, (now - start) / SEGMENT_MS);
      const seg = Math.floor(total) % (playOrder.length - 1);
      const eased = 0.5 - Math.cos(Math.PI * (total - Math.floor(total))) / 2;
      scene.showBetween(playOrder[seg]!, playOrder[seg + 1]!, eased);
      scene.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playOrder]);

  const labels = figure.frames.map((f) => f.label[lang]);
  const canvasLabel = `${figure.name[lang]} — ${playing ? t(lang, 'figure.animating') : labels[frame]}`;
  const paths = arrow ? arrowPaths(arrow.from, arrow.to) : null;
  const heightNote = stature === TYPICAL_STATURE_CM ? t(lang, 'figure.typicalHeight') : t(lang, 'figure.shownAt').replace('{height}', String(stature));
  const bothSides = figure.unilateral && <p class="figure-badge">{t(lang, 'figure.bothSides')}</p>;

  if (status === 'unavailable' || status === 'error') {
    return (
      <div class="figure-viewer" data-figure-status={status}>
        <p role="status">{t(lang, status === 'error' ? 'figure.loadError' : 'figure.noWebgl')}</p>
        {bothSides}
        <div class="figure-fallback-grid">
          {fallbackImages.map((src, i) => (
            <figure>
              <img src={src} alt={`${figure.name[lang]} — ${labels[i]}`} width={900} height={1200} loading="lazy" />
              <figcaption>{labels[i]}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="figure-viewer" data-figure-status={status}>
      {bothSides}
      <div class="figure-stage" ref={stageRef}>
        <canvas ref={canvasRef} class="figure-canvas" role="img" aria-label={canvasLabel} />
        {paths && (
          <svg class="figure-overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            <path d={paths.line} class="figure-arrow__line" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d={paths.head} class="figure-arrow__head" />
          </svg>
        )}
      </div>
      <div class="figure-controls" role="group" aria-label={figure.name[lang]}>
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
        <button
          type="button"
          disabled={status !== 'ready'}
          onClick={() => {
            resetRef.current(); // OrbitControls' change event clears the arrow
            if (sceneRef.current && !playing) showArrow(frame); // the camera is back where the arrow lines up
          }}
        >
          {t(lang, 'figure.resetView')}
        </button>
        {statureChoices && (
          <label class="figure-height">
            {t(lang, 'figure.height')}{' '}
            <select
              value={String(stature)}
              disabled={status === 'loading'}
              onChange={(e) => {
                setPlaying(false);
                setStature(Number((e.target as HTMLSelectElement).value));
              }}
            >
              {statureChoices.map((cm) => (
                <option value={String(cm)}>{`${cm} cm`}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {status === 'loading' && <p role="status">{t(lang, 'figure.loading')}</p>}
      <p class="figure-note">
        {t(lang, 'figure.dragHint')} · {t(lang, 'figure.illustrative')} · {heightNote}
      </p>
    </div>
  );
}
```

**Replace `src/components/figure/FigureFrames.astro` with:**

```astro
---
import type { FigureMeta } from '../../lib/figure/figures';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props { lang: Locale; figure: FigureMeta; images: string[] }
const { lang, figure, images } = Astro.props;
---
{figure.unilateral && <p class="figure-badge">{t(lang, 'figure.bothSides')}</p>}
<ol class="figure-frames">
  {figure.frames.map((f, i) => (
    <li>
      <figure>
        <img src={images[i]} alt={`${figure.name[lang]} — ${f.label[lang]}`} width="900" height="1200" loading="lazy" decoding="async" />
        <figcaption><strong>{i + 1}. {f.label[lang]}</strong><span>{f.cue[lang]}</span></figcaption>
      </figure>
    </li>
  ))}
</ol>
```

**Edit `src/components/figure/figure.css`** (1 change):

1. Replace

```css
@media (max-width: 480px) { .spike-checks { font-size: 0.8rem; } }
```

   with

```css
@media (max-width: 480px) { .spike-checks { font-size: 0.8rem; } }
.figure-badge { display: inline-block; margin: 0 0 8px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); font-size: 0.875rem; }
.figure-height { display: inline-flex; align-items: center; gap: 6px; }
.figure-height select { font: inherit; padding: 4px 8px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); }
```


**Edit `src/lib/i18n/en.ts`** (1 change):

1. Replace

```ts
  'figure.illustrative': 'Illustrative dimensions',
  'figure.dragHint': 'Drag to rotate',
```

   with

```ts
  'figure.illustrative': 'Illustrative dimensions',
  'figure.typicalHeight': 'Shown at a typical height (175 cm)',
  'figure.shownAt': 'Shown at {height} cm',
  'figure.height': 'Height',
  'figure.bothSides': 'Do both sides',
  'figure.dragHint': 'Drag to rotate',
```


**Edit `src/lib/i18n/zh.ts`** (1 change):

1. Replace

```ts
  'figure.illustrative': '示意尺寸',
  'figure.dragHint': '拖动可旋转',
```

   with

```ts
  'figure.illustrative': '示意尺寸',
  'figure.typicalHeight': '按典型身高（175 厘米）显示',
  'figure.shownAt': '按 {height} 厘米身高显示',
  'figure.height': '身高',
  'figure.bothSides': '两侧都要做',
  'figure.dragHint': '拖动可旋转',
```


Adapt the render harness (its URL protocol stays as in M1 until Task 7):

**Edit `src/pages/render/[figure].astro`** (2 changes):

1. Replace

```astro
        }
        const spec = FIGURES[params.get('figure') ?? ''];
        if (!spec) throw new Error(`Unknown figure: ${params.get('figure')}`);
        const frame = Number(params.get('frame') ?? '0');
```

   with

```astro
        }
        const figure = FIGURES[params.get('figure') ?? ''];
        if (!figure) throw new Error(`Unknown figure: ${params.get('figure')}`);
        const frame = Number(params.get('frame') ?? '0');
```

2. Replace

```astro
        canvas.style.height = `${H}px`;
        const scene = await mountFigure(canvas, { width: W, height: H, modelUrl: canvas.dataset.modelUrl!, spec });
        scene.showFrame(frame);
```

   with

```astro
        canvas.style.height = `${H}px`;
        const scene = await mountFigure(canvas, { width: W, height: H, modelUrl: canvas.dataset.modelUrl!, figure });
        scene.showFrame(frame);
```


Adapt the spike page (Task 8 replaces it):

**Edit `src/pages/[lang]/dev/figure-spike.astro`** (3 changes):

1. Replace

```astro
import SpikeChecks from '../../../components/figure/SpikeChecks.astro';
import { SMITH_SQUAT } from '../../../lib/figure/fixtures/smith-squat';
import { requireLocale, localeStaticPaths, t } from '../../../lib/i18n';
```

   with

```astro
import SpikeChecks from '../../../components/figure/SpikeChecks.astro';
import { figureMeta } from '../../../lib/figure/figures';
import { FIGURES } from '../../../lib/figure/fixtures';
import { requireLocale, localeStaticPaths, t } from '../../../lib/i18n';
```

2. Replace

```astro
const lang = requireLocale(Astro.params.lang);
const images = SMITH_SQUAT.frames.map((_, i) => withBase(`figures/${SMITH_SQUAT.id}/frame-${i}.webp`));
---
```

   with

```astro
const lang = requireLocale(Astro.params.lang);
const figure = figureMeta(FIGURES['smith-squat']!);
const images = figure.frames.map((_, i) => withBase(`figures/${figure.id}/frame-${i}.webp`));
---
```

3. Replace

```astro
  <h2>{t(lang, 'spike.viewer')}</h2>
  <FigureViewer client:only="preact" lang={lang} modelUrl={withBase('models/human.glb')} spec={SMITH_SQUAT} fallbackImages={images} />
  <h2>{t(lang, 'spike.frames')}</h2>
  <FigureFrames lang={lang} spec={SMITH_SQUAT} images={images} />
  <h2>{t(lang, 'spike.checks')}</h2>
```

   with

```astro
  <h2>{t(lang, 'spike.viewer')}</h2>
  <FigureViewer client:only="preact" lang={lang} modelUrl={withBase('models/human.glb')} figure={figure} fallbackImages={images} />
  <h2>{t(lang, 'spike.frames')}</h2>
  <FigureFrames lang={lang} figure={figure} images={images} />
  <h2>{t(lang, 'spike.checks')}</h2>
```


- [ ] **Step 7: Run every check, render and the end-to-end tests**

Run: `npm test && npm run lint && npm run check && npm run render:figures && npm run test:e2e`
Expected: all unit tests pass; 0 lint and type errors; `render:figures` writes `public/figures/smith-squat/` and `public/figures/db-curl/`, and the Smith-squat frames pass the Task 1 Step 6 comparison against `.cache/m1-baseline/` (if that folder is missing, render `main` into it first as in Task 1 Step 1); the M1 end-to-end tests pass (the spike page now shows the height note).

- [ ] **Step 8: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure src/components/figure src/pages src/lib/i18n tests/assets/figure-sweep.test.ts
git commit -m $'feat(figure): one FigureModel for every figure; the sweep; a viewer for any figure\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure models, sweep and a viewer for any figure" \
  --body $'FigureModel wraps pose specs and the unchanged M1 Smith squat; in-between poses settle onto their contacts; the figure sweep runs every figure at 150–200 cm on the real rig; mountFigure and FigureViewer take any figure (lazy-loaded, typical height by default, optional height picker, both-sides badge). First library figure: dumbbell curl.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the Smith squat and the dumbbell curl pose through `FigureModel`, the sweep is green for both at every stature, and the viewer renders either with and without WebGL.

---
### Task 7: Cached pre-render pipeline in CI

Spec §8.4 and D11: pre-renders are cached by content hash (controller decision 10). The harness now loads once and renders every job on the same page (`renderFigure(id, frame)`, `renderEquipment(id)`), which also saves reloading three.js and the model per frame. `render-figures.ts` computes every image's key in Node (the pure layers pose the figure exactly as the browser will), copies unchanged images from `.cache/figures/`, prunes stale cache entries, and starts a browser only when something is missing. `--keys <file>` writes the key list that CI uses as its cache key; `--force` ignores the cache. Equipment stills (`public/figures/equipment/<id>.webp`) are rendered for the look review and M5's equipment pages; a lone piece of equipment has fewer colours than a figure, so the blank check allows 50 there.

**Files:**
- Create: `scripts/lib/figureKeys.ts`
- Replace: `src/pages/render/[figure].astro`, `scripts/render-figures.ts`
- Modify: `package.json`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/figure-pipeline.md`, `docs/architecture.md`
- Test: `scripts/lib/figureKeys.test.ts`

**Interfaces:**
- Consumes: Task 6 `FIGURES`, `FigureModel`, `mountFigure`, `mountEquipment`; Task 3 `EQUIPMENT_MODELS`; `REAL_SKELETON`; M1 `arrowSvg`, `distinctColors`, `SOFTWARE_WEBGL_ARGS`.
- Produces: `RENDER_SETTINGS`, `RENDERER_FILES`, `rendererFingerprint(root, skeleton)` (source files, the three, Playwright and sharp versions, Playwright's Chromium revision, the model's sha256, the settings), `figureKey(fig, sk, fingerprint)`, `equipmentKey(model, fingerprint)`; `npm run figures:keys`; harness globals `__figureHarness.{list, renderFigure, renderEquipment}`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-render-cache
```

- [ ] **Step 2: Write the failing test**

**Create `scripts/lib/figureKeys.test.ts`:**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { poseFigure } from '../../src/lib/figure/figures';
import { FIGURES, POSE_SPECS } from '../../src/lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../../src/lib/figure/geometry/models';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';
import { equipmentKey, figureKey, RENDERER_FILES, rendererFingerprint } from './figureKeys';

describe('render cache keys', () => {
  const fp = rendererFingerprint(process.cwd(), REAL_SKELETON);
  const curl = FIGURES['db-curl']!;

  it('are stable for the same inputs and differ between figures', () => {
    expect(figureKey(curl, REAL_SKELETON, fp)).toBe(figureKey(curl, REAL_SKELETON, fp));
    expect(figureKey(curl, REAL_SKELETON, fp)).not.toBe(figureKey(FIGURES['smith-squat']!, REAL_SKELETON, fp));
    expect(equipmentKey(EQUIPMENT_MODELS.barbell!, fp)).not.toBe(equipmentKey(EQUIPMENT_MODELS['ab-wheel']!, fp));
  });
  it('change when a pose changes what is drawn, and when the renderer changes', () => {
    const spec = POSE_SPECS.find((s) => s.id === 'db-curl')!;
    const moved = poseFigure({ ...spec, frames: [{ ...spec.frames[0], trunk: { hips: { bodyCm: [0, 94, 0] } } }, spec.frames[1], spec.frames[2]] });
    expect(figureKey(moved, REAL_SKELETON, fp)).not.toBe(figureKey(curl, REAL_SKELETON, fp));
    expect(figureKey(curl, REAL_SKELETON, `${fp}x`)).not.toBe(figureKey(curl, REAL_SKELETON, fp));
  });
  it('fingerprint the renderer from its files, its tool versions (three.js, sharp, Chromium) and the model', () => {
    const root = mkdtempSync(join(tmpdir(), 'figure-keys-'));
    for (const f of RENDERER_FILES) {
      mkdirSync(join(root, f.includes('.') ? f.replace(/\/[^/]*$/, '') : f), { recursive: true });
      if (f.includes('.')) writeFileSync(join(root, f), 'a');
    }
    mkdirSync(join(root, 'node_modules/three'), { recursive: true });
    writeFileSync(join(root, 'node_modules/three/package.json'), '{"version":"1"}');
    mkdirSync(join(root, 'node_modules/sharp'), { recursive: true });
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"1"}');
    const before = rendererFingerprint(root, REAL_SKELETON);
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"2"}');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"1"}');
    mkdirSync(join(root, 'node_modules/playwright-core'), { recursive: true });
    writeFileSync(join(root, 'node_modules/playwright-core/browsers.json'), '{"browsers":[{"name":"chromium","revision":"2"}]}');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'node_modules/playwright-core/browsers.json'), '{"browsers":[]}');
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.ts'), 'b');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.test.ts'), 'tests do not count');
    const withTest = rendererFingerprint(root, REAL_SKELETON);
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.test.ts'), 'still do not count');
    expect(rendererFingerprint(root, REAL_SKELETON)).toBe(withTest);
    expect(rendererFingerprint(root, { ...REAL_SKELETON, source: { ...REAL_SKELETON.source, sha256: 'other' } })).not.toBe(withTest);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run scripts/lib/figureKeys.test.ts`
Expected: FAIL — `Failed to resolve import "./figureKeys"`.

- [ ] **Step 4: Implement the keys, the harness and the script**

**Create `scripts/lib/figureKeys.ts`:**

```ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FigureModel } from '../../src/lib/figure/figures';
import type { EquipmentModel } from '../../src/lib/figure/geometry/models';
import type { SkeletonDef } from '../../src/lib/figure/pose/skeleton';

/** Pre-render size and WebP quality; part of every cache key. */
export const RENDER_SETTINGS = { width: 900, height: 1200, webpQuality: 88, statureCm: 175 } as const;

/** Files whose content changes how a frame is drawn (the renderer and the harness around it). */
export const RENDERER_FILES = [
  'src/lib/figure/scene3d',
  'src/lib/figure/arrow.ts',
  'src/pages/render/[figure].astro',
  'scripts/render-figures.ts',
  'scripts/lib/browser.ts',
  'scripts/lib/figureKeys.ts',
];

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function filesUnder(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? filesUnder(join(path, e.name)) : [join(path, e.name)]))
      .filter((f) => !/\.test\.ts$/.test(f))
      .sort();
  } catch {
    return [path];
  }
}

/** Version of an installed package (`missing` if it is not installed). */
function versionOf(root: string, pkg: string): string {
  try {
    return (JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'missing';
  }
}

/** Chromium's build, from Playwright's browser list: the software WebGL (SwiftShader) draws with it. */
function chromiumRevision(root: string): string {
  try {
    const list = JSON.parse(readFileSync(join(root, 'node_modules/playwright-core/browsers.json'), 'utf8')) as { browsers: Array<{ name: string; revision: string; browserVersion?: string }> };
    const c = list.browsers.find((b) => b.name === 'chromium');
    return c ? `${c.revision}/${c.browserVersion ?? ''}` : 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * Hash of the renderer: its source files, the versions of three.js, Playwright, its Chromium build and
 * sharp (which encodes the WebP), the human model (by the sha256 that skeleton.json records) and the
 * render settings. Any change re-renders every figure.
 */
export function rendererFingerprint(root: string, skeleton: SkeletonDef): string {
  const h = createHash('sha256');
  for (const f of RENDERER_FILES.flatMap((p) => filesUnder(join(root, p)))) h.update(f.slice(root.length)).update(readFileSync(f));
  for (const pkg of ['three', '@playwright/test', 'sharp']) h.update(`${pkg}@${versionOf(root, pkg)}`);
  h.update(`chromium:${chromiumRevision(root)}`).update(`model:${skeleton.source.sha256}`).update(JSON.stringify(RENDER_SETTINGS));
  return h.digest('hex');
}

/** JSON with numbers rounded to 1e-6, so float noise never changes a key. */
const stable = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x));

/**
 * Cache key of a figure's pre-rendered frames: the renderer fingerprint plus everything the renderer is
 * given — camera, fixed equipment, and each frame's bone rotations, root, props and arrow at the default
 * stature with illustrative equipment. A change that moves nothing on screen keeps the key.
 */
export function figureKey(fig: FigureModel, sk: SkeletonDef, fingerprint: string): string {
  const ctx = { statureCm: RENDER_SETTINGS.statureCm };
  const frames = fig.frames.map((_, i) => {
    const p = fig.pose(sk, i, ctx);
    return { local: p.local, root: p.rootPosition, scale: p.scaleFactor, props: p.props, arrow: p.arrow };
  });
  return sha256(stable({ fingerprint, id: fig.id, camera: fig.camera(ctx), scene: fig.scene(sk, ctx).prims, frames }));
}

/** Cache key of an equipment still. */
export function equipmentKey(model: EquipmentModel, fingerprint: string): string {
  return sha256(stable({ fingerprint, id: model.id, view: model.view, prims: model.build().prims }));
}
```

**Replace `src/pages/render/[figure].astro` with:**

```astro
---
import { withBase } from '../../lib/site';

// Dev-only render harness for scripts/render-figures.ts: `astro build` emits no page for it.
// The route is /render/figure/ (the param is a placeholder so getStaticPaths can return nothing in production).
export function getStaticPaths() {
  return import.meta.env.DEV ? [{ params: { figure: 'figure' } }] : [];
}
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
      import type { FigureScene } from '../../lib/figure/scene3d/figureScene';

      const W = 900;
      const H = 1200;
      const g = window as unknown as Record<string, unknown>;

      type Drawn = Pick<FigureScene, 'render' | 'dispose'> & Partial<Pick<FigureScene, 'showFrame' | 'arrow'>>;

      /**
       * One page renders every job: `renderFigure(id, frame)` mounts a figure once and shows its frames in
       * turn; `renderEquipment(id)` mounts one equipment model. Each resolves after the frame is drawn.
       */
      async function main() {
        const [{ mountFigure, mountEquipment }, { FIGURES }, { EQUIPMENT_MODELS }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('../../lib/figure/fixtures'),
          import('../../lib/figure/geometry/models'),
        ]);
        const canvas = document.getElementById('figure-canvas') as HTMLCanvasElement;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        let current: { key: string; scene: Drawn } | undefined;
        const use = async (key: string, mount: () => Promise<Drawn> | Drawn): Promise<Drawn> => {
          if (current?.key === key) return current.scene;
          current?.scene.dispose();
          current = undefined;
          const scene = await mount();
          current = { key, scene };
          return scene;
        };
        g.__figureHarness = {
          list: () => ({ figures: Object.values(FIGURES).map((f) => ({ id: f.id, frames: f.frames.length })), equipment: Object.keys(EQUIPMENT_MODELS) }),
          async renderFigure(id: string, frame: number) {
            const figure = FIGURES[id];
            if (!figure) throw new Error(`Unknown figure: ${id}`);
            const scene = await use(`figure:${id}`, () => mountFigure(canvas, { width: W, height: H, modelUrl: canvas.dataset.modelUrl!, figure }));
            scene.showFrame!(frame);
            scene.render();
            return { arrow: scene.arrow!(frame), width: W, height: H };
          },
          async renderEquipment(id: string) {
            const model = EQUIPMENT_MODELS[id];
            if (!model) throw new Error(`Unknown equipment model: ${id}`);
            const scene = await use(`equipment:${id}`, () => mountEquipment(canvas, { width: W, height: H, model }));
            scene.render();
            return { arrow: null, width: W, height: H };
          },
        };
      }
      // The page is not built for production; the guard also lets the bundler drop this script there.
      if (import.meta.env.DEV) main().catch((err) => {
        g.__figureError = String(err);
        throw err;
      });
    </script>
  </body>
</html>
```

**Replace `scripts/render-figures.ts` with:**

```ts
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { arrowSvg } from '../src/lib/figure/arrow';
import { FIGURES } from '../src/lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../src/lib/figure/geometry/models';
import { REAL_SKELETON } from '../src/lib/figure/pose/realSkeleton';
import { SOFTWARE_WEBGL_ARGS } from './lib/browser';
import { equipmentKey, figureKey, RENDER_SETTINGS, rendererFingerprint } from './lib/figureKeys';
import { distinctColors } from './lib/imageCheck';

/**
 * Pre-renders every figure frame and equipment still into public/figures/ (spec §8.4, D11). Each output
 * is cached in .cache/figures/<key>/ under a content hash of what it draws (scripts/lib/figureKeys.ts),
 * so only changed figures are rendered. Flags:
 *   --force            render everything, ignoring the cache
 *   --keys <file>      write the list of cache keys to <file> and exit (CI uses it as the cache key)
 */
type Arrow = { from: [number, number]; to: [number, number] } | null;
type Ready = { arrow: Arrow; width: number; height: number };
type Harness = {
  renderFigure(id: string, frame: number): Promise<Ready>;
  renderEquipment(id: string): Promise<Ready>;
};
type Win = { __figureHarness?: Harness; __figureError?: string };
interface Job {
  kind: 'figure' | 'equipment';
  id: string;
  frame: number;
  key: string;
  /** Path under public/figures/ and under the key's cache folder. */
  file: string;
}

const PORT = 4329;
const HARNESS = `http://127.0.0.1:${PORT}/ai_health/render/figure/`;
const OUT = 'public/figures';
const CACHE = '.cache/figures';
/** A blank or failed WebGL frame has a handful of colours; a figure has thousands, a lone piece of equipment hundreds. */
const MIN_COLORS = { figure: 200, equipment: 50 } as const;

const args = process.argv.slice(2);
const force = args.includes('--force');
const keysFile = args.includes('--keys') ? args[args.indexOf('--keys') + 1] : undefined;

const fingerprint = rendererFingerprint(process.cwd(), REAL_SKELETON);
const jobs: Job[] = [
  ...Object.values(FIGURES).flatMap((fig) => {
    const key = figureKey(fig, REAL_SKELETON, fingerprint);
    return fig.frames.map((_, frame) => ({ kind: 'figure' as const, id: fig.id, frame, key, file: `${fig.id}/frame-${frame}.webp` }));
  }),
  ...Object.values(EQUIPMENT_MODELS).map((m) => ({ kind: 'equipment' as const, id: m.id, frame: 0, key: equipmentKey(m, fingerprint), file: `equipment/${m.id}.webp` })),
];

if (keysFile) {
  await mkdir(dirname(keysFile), { recursive: true });
  await writeFile(keysFile, `${[...new Set(jobs.map((j) => `${j.file} ${j.key}`))].join('\n')}\n`);
  console.log(`Wrote ${jobs.length} cache keys to ${keysFile}`);
  process.exit(0);
}

const cached = (j: Job) => join(CACHE, j.key, j.file.replace(/\//g, '__'));
const pending: Job[] = [];
for (const j of jobs) {
  await mkdir(dirname(join(OUT, j.file)), { recursive: true });
  if (!force && existsSync(cached(j))) await copyFile(cached(j), join(OUT, j.file));
  else pending.push(j);
}
// Keep the cache to what the current figures use.
const live = new Set(jobs.map((j) => j.key));
if (existsSync(CACHE)) for (const d of await readdir(CACHE)) if (!live.has(d)) await rm(join(CACHE, d), { recursive: true, force: true });
console.log(`${jobs.length - pending.length} of ${jobs.length} images from the cache; rendering ${pending.length}`);
if (pending.length === 0) process.exit(0);

/** The dev server exited (or could not start) before it became ready. */
class ServerExitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

/** True if something already accepts connections on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

if (await portInUse(PORT)) {
  console.error(`Port ${PORT} is already in use, probably by a stale Astro dev server. Run "npx astro dev stop" (or stop whatever else is using the port) and try again.`);
  process.exit(1);
}

// --ignore-lock keeps Astro 7 in the foreground even when it detects an AI agent, so kill() really stops it.
const server = spawn('node_modules/.bin/astro', ['dev', '--port', String(PORT), '--ignore-lock', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
let serverFailure: ServerExitError | undefined;
const serverStopped = new Promise<void>((resolve) => {
  server.once('exit', (code, signal) => {
    serverFailure ??= new ServerExitError(`astro dev exited before it was ready (${signal ? `signal ${signal}` : `exit code ${code}`})`, code || 1); // a clean exit is still a failure: no frames were rendered
    resolve();
  });
  server.once('error', (err) => {
    serverFailure ??= new ServerExitError(`Could not start astro dev: ${err.message}`, 1);
    resolve();
  });
});

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (serverFailure) throw serverFailure;
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // server not up yet
    }
    await Promise.race([new Promise((r) => setTimeout(r, 500)), serverStopped]);
  }
  throw new Error(`Dev server did not start: ${url}`);
}

async function render(page: Page, j: Job): Promise<void> {
  const ready = await page.evaluate(
    ([kind, id, frame]) => {
      const h = (window as unknown as Win).__figureHarness!;
      return kind === 'figure' ? h.renderFigure(id, frame) : h.renderEquipment(id);
    },
    [j.kind, j.id, j.frame] as const,
  );
  const png = await page.locator('canvas#figure-canvas').screenshot();
  const colors = await distinctColors(png);
  if (colors < MIN_COLORS[j.kind]) throw new Error(`${j.file} looks blank (${colors} colours)`);
  const layers = ready.arrow ? [{ input: Buffer.from(arrowSvg(ready.width, ready.height, ready.arrow.from, ready.arrow.to)) }] : [];
  const webp = await sharp(png).composite(layers).webp({ quality: RENDER_SETTINGS.webpQuality }).toBuffer();
  await mkdir(dirname(cached(j)), { recursive: true });
  await writeFile(cached(j), webp);
  await writeFile(join(OUT, j.file), webp);
  console.log(`rendered ${j.file} (${colors} colours)`);
}

let browser: Browser | undefined;
try {
  await waitForServer(HARNESS);
  browser = await chromium.launch({ args: SOFTWARE_WEBGL_ARGS });
  const page = await browser.newPage({ viewport: { width: RENDER_SETTINGS.width, height: RENDER_SETTINGS.height } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HARNESS);
  const ready = await page.waitForFunction(() => (window as unknown as Win).__figureHarness ?? (window as unknown as Win).__figureError, null, { timeout: 120_000 });
  const state = await ready.jsonValue();
  if (typeof state === 'string') throw new Error(`Render harness failed: ${state}`);
  for (const j of pending) await render(page, j);
  if (errors.length) throw new Error(`Page errors while rendering:\n${errors.join('\n')}`);
} catch (err) {
  // Fail with Astro's own exit code; anything else keeps its stack trace.
  if (!(err instanceof ServerExitError)) throw err;
  console.error(err.message);
  process.exitCode = err.exitCode;
} finally {
  await browser?.close();
  server.kill();
}
```

**Edit `package.json`** (1 change):

1. Replace

```json
    "build:human": "tsx scripts/build-human.ts",
    "render:figures": "tsx scripts/render-figures.ts"
  },
```

   with

```json
    "build:human": "tsx scripts/build-human.ts",
    "render:figures": "tsx scripts/render-figures.ts",
    "figures:keys": "tsx scripts/render-figures.ts --keys figure-keys.txt"
  },
```


**Edit `.gitignore`** (1 change):

1. Replace

```text
public/figures/
assets-src/human/build/
```

   with

```text
public/figures/
figure-keys.txt
assets-src/human/build/
```


- [ ] **Step 5: Cache the renders in CI and the deploy**

The CI job's time cap goes from 30 to 40 minutes, room for a cold render (about 4–8 min with software WebGL) on top of the other checks; the deploy build keeps 30.

**Edit `.github/workflows/ci.yml`** (2 changes):

1. Replace

```yaml
    # A hung step (e.g. an apt download in playwright install) must not hold main's queue for GitHub's 6 h default.
    timeout-minutes: 30
    steps:
```

   with

```yaml
    # A hung step (e.g. an apt download in playwright install) must not hold main's queue for GitHub's 6 h default.
    # 40 min leaves room for a cold figure render (a renderer change: about 4–8 min with software WebGL) on top of
    # the usual checks and end-to-end tests.
    timeout-minutes: 40
    steps:
```

2. Replace

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run render:figures
```

   with

```yaml
      - run: npx playwright install --with-deps chromium
      # Pre-rendered frames are cached by content hash (D11): the key lists every image's hash, so an
      # unchanged figure is restored instead of rendered; a partial hit restores the newest cache and
      # renders only what changed.
      - run: npm run figures:keys
      - uses: actions/cache@v6
        with:
          path: .cache/figures
          key: figures-${{ hashFiles('figure-keys.txt') }}
          restore-keys: figures-
      - run: npm run render:figures
```


**Edit `.github/workflows/deploy.yml`** (2 changes):

1. Replace

```yaml
    runs-on: ubuntu-latest
    timeout-minutes: 30
```

   with

```yaml
    runs-on: ubuntu-latest
    # Room for a cold figure render (about 4–8 min) plus the build.
    timeout-minutes: 30
```

2. Replace

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run render:figures
```

   with

```yaml
      - run: npx playwright install --with-deps chromium
      # Pre-rendered frames are cached by content hash (D11): the key lists every image's hash, so an
      # unchanged figure is restored instead of rendered; a partial hit restores the newest cache and
      # renders only what changed.
      - run: npm run figures:keys
      - uses: actions/cache@v6
        with:
          path: .cache/figures
          key: figures-${{ hashFiles('figure-keys.txt') }}
          restore-keys: figures-
      - run: npm run render:figures
```


**Edit `docs/figure-pipeline.md`** (1 change):

1. Replace

```markdown

- `npm run render:figures` starts `astro dev` on port 4329, opens `/render/figure/` in headless Chromium with software WebGL (`SOFTWARE_WEBGL_ARGS` in `scripts/lib/browser.ts`, shared with `playwright.config.ts`), screenshots each frame, composites the movement arrow, and writes WebP files. It fails if a frame looks blank or the page throws.
- Run `npx playwright install chromium` once per machine first.
- Astro 7 puts `dev` and `preview` in the background when it detects an AI agent. `render:figures` and the Playwright web server pass `--ignore-lock` so their servers stay in the foreground and are stopped cleanly. `npm run dev` and `npm run preview` do not; under an agent, add it yourself (`npm run dev -- --ignore-lock`). If a server is left running, stop it with `npx astro dev stop` (or `npx astro preview stop`).
- CI and the deploy workflow run `render:figures` before building, so `public/figures/` is never committed.
- `npm run test:e2e` builds the site and runs Playwright against `astro preview`. Locally, run `npm run render:figures` first: the spike page's frame images come from `public/figures/`.

```

   with

```markdown

- `npm run render:figures` renders every figure frame into `public/figures/<id>/frame-<n>.webp` and every equipment model into `public/figures/equipment/<id>.webp`. Each image is cached in `.cache/figures/<key>/` (git-ignored) under a content hash (`scripts/lib/figureKeys.ts`): the renderer's source files, the versions of three.js, Playwright, its Chromium build and sharp, the human model and the render settings, plus everything the figure draws (camera, fixed equipment, each frame's bone rotations, root, props and arrow at 175 cm with illustrative equipment). Unchanged images are copied from the cache; if nothing changed, no browser starts. `--force` renders everything.
- For the rest it starts `astro dev` on port 4329, opens `/render/figure/` once in headless Chromium with software WebGL (`SOFTWARE_WEBGL_ARGS` in `scripts/lib/browser.ts`, shared with `playwright.config.ts`), renders each job on the same page, composites the movement arrow (D11) and writes WebP. It fails if an image looks blank or the page throws.
- CI and the deploy workflow run `npm run figures:keys` (the list of keys, `figure-keys.txt`), restore `.cache/figures` with `actions/cache` keyed on that list (falling back to the newest cache), then `npm run render:figures`. A change to one figure re-renders its three frames; a change to `scene3d` re-renders everything.
- Run `npx playwright install chromium` once per machine first.
- Astro 7 puts `dev` and `preview` in the background when it detects an AI agent. `render:figures` and the Playwright web server pass `--ignore-lock` so their servers stay in the foreground and are stopped cleanly. `npm run dev` and `npm run preview` do not; under an agent, add it yourself (`npm run dev -- --ignore-lock`). If a server is left running, stop it with `npx astro dev stop` (or `npx astro preview stop`).
- `public/figures/` is never committed. `npm run test:e2e` builds the site and runs Playwright against `astro preview`; locally, run `npm run render:figures` first.

```


**Edit `docs/architecture.md`** (2 changes):

1. Replace

```markdown
| `npx playwright install chromium` | One-time per machine: the browser Playwright and `render:figures` use |
| `npm run render:figures` | Pre-render the 3D exercise frames into `public/figures/` (git-ignored) |
| `npm run test:e2e` | Build, preview and run Playwright; run `render:figures` first locally |
```

   with

```markdown
| `npx playwright install chromium` | One-time per machine: the browser Playwright and `render:figures` use |
| `npm run render:figures` | Pre-render the 3D exercise frames and equipment stills into `public/figures/` (git-ignored), reusing `.cache/figures/` for anything unchanged |
| `npm run figures:keys` | Write the render cache keys to `figure-keys.txt` (CI's cache key) |
| `npm run test:e2e` | Build, preview and run Playwright; run `render:figures` first locally |
```

2. Replace

```markdown

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: type check, lint, unit tests, `npm run render:figures`, build and the end-to-end tests. `.github/workflows/deploy.yml` runs only after CI succeeds for a push to `main`. It checks out the exact commit CI tested, installs Chromium, runs `npm run render:figures`, builds `dist/` and publishes it to GitHub Pages. It can also be started by hand (`workflow_dispatch`), which skips the wait for CI. CI never cancels a `main` run mid-run; runs queue, and a newer queued run supersedes an older one, so the newest commit on `main` always gets a deploy decision.
```

   with

```markdown

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: type check, lint, unit tests (including the figure sweep), the cached `npm run render:figures`, build and the end-to-end tests. `.github/workflows/deploy.yml` runs only after CI succeeds for a push to `main`. It checks out the exact commit CI tested, installs Chromium, runs `npm run render:figures`, builds `dist/` and publishes it to GitHub Pages. It can also be started by hand (`workflow_dispatch`), which skips the wait for CI. CI never cancels a `main` run mid-run; runs queue, and a newer queued run supersedes an older one, so the newest commit on `main` always gets a deploy decision.
```


- [ ] **Step 6: Verify the cache locally**

Run: `npx vitest run scripts && npm run lint && npm run check && npm run render:figures && npm run render:figures`
Expected: `figureKeys.test.ts` 3 passed (one checks that a new sharp version or Chromium revision changes the fingerprint); the first render writes the figures and 20 equipment stills (`… rendering N`); the second prints `N of N images from the cache; rendering 0` and exits in about a second without starting a server. `npm run figures:keys` writes `figure-keys.txt` (git-ignored).

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add scripts src/pages/render package.json .gitignore .github/workflows docs
git commit -m $'feat(figures): cache pre-rendered frames by content hash, render equipment stills\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Cached pre-render pipeline in CI" \
  --body $'Pre-renders are keyed by a hash of the renderer and everything each image draws; CI restores .cache/figures with actions/cache and renders only what changed. Adds equipment stills. One harness page renders every job.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

- [ ] **Step 8: Confirm the cache on CI**

On the PR's CI run, the "Run npm run render:figures" step renders everything (cold cache). Re-run the job: it restores the cache and the step reports every image from the cache.

**Done when:** unchanged figures are restored from the cache instead of rendered, locally and on CI, and a renderer change re-renders everything.

---
### Task 8: Figure review pages and end-to-end tests

Replaces the M1 spike page with unlisted review pages (controller decision 9): `/[lang]/dev/figures/` shows every figure's middle frame and every equipment still; `/[lang]/dev/figures/[id]/` shows the live viewer with a height picker, the three frames and the sweep table for that figure, with errors and warnings in separate columns. The owner's look review (Task 15) uses them on the deployed site, and so does the early look after this task (Step 7). The end-to-end tests move to the new pages and add the height picker, a library figure, zero errors and warnings, and the gallery; the WebGL-off fallback test now covers the Smith squat and the dumbbell curl (M3 exit: "viewer works with and without WebGL"). The README's preview link moves to the new page.

**Files:**
- Create: `src/pages/[lang]/dev/figures/index.astro`, `src/pages/[lang]/dev/figures/[id].astro`, `src/components/figure/FigureChecks.astro`
- Delete: `src/pages/[lang]/dev/figure-spike.astro`, `src/components/figure/SpikeChecks.astro`
- Modify: `src/components/figure/figure.css`, `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts`, `tests/e2e/figure-fallback.spec.ts`, `tests/e2e/smoke.spec.ts`, `README.md`
- Rename and modify: `tests/e2e/figure-spike.spec.ts` → `tests/e2e/figure-viewer.spec.ts`

**Interfaces:**
- Consumes: Task 6 (`FIGURES`, `figureMeta`, `FigureViewer`, `FigureFrames`), Task 3 `EQUIPMENT_MODELS`, Task 7 stills.
- Produces: routes `/<lang>/dev/figures/` and `/<lang>/dev/figures/<id>/`; i18n keys `devFigures.*`; the `spike.*` and `angle.*` keys are removed.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-review-pages
```

- [ ] **Step 2: Move the end-to-end tests to the new pages (they fail until the pages exist)**

```bash
git mv tests/e2e/figure-spike.spec.ts tests/e2e/figure-viewer.spec.ts
```

**Replace `tests/e2e/figure-viewer.spec.ts` with:**

```ts
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
```

**Replace `tests/e2e/figure-fallback.spec.ts` with:**

```ts
import { expect, test } from '@playwright/test';

// Chrome without WebGL: the viewer must fall back to the pre-rendered frames, for the M1 Smith squat and
// for a pose-library figure. (three.js logs a console error when it cannot create a context, so these
// tests do not assert on console errors.)
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

for (const id of ['smith-squat', 'db-curl']) {
  test(`the ${id} viewer falls back to still images without WebGL`, async ({ page }) => {
    await page.goto(`/ai_health/en/dev/figures/${id}/`);
    const viewer = page.locator('[data-figure-status="unavailable"]');
    await expect(viewer).toBeVisible({ timeout: 60_000 });
    const images = viewer.locator('img');
    await expect(images).toHaveCount(3);
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  });
}
```

**Edit `tests/e2e/smoke.spec.ts`** (4 changes):

1. Replace

```ts
  const targets = [
    ...LOCALES.flatMap(({ code }) => [...PAGES, 'dev/figure-spike/'].map((path) => `/ai_health/${code}/${path}`)),
    '/ai_health/', // the language-detecting root page (it redirects)
```

   with

```ts
  const targets = [
    ...LOCALES.flatMap(({ code }) => [...PAGES, 'dev/figures/', 'dev/figures/smith-squat/'].map((path) => `/ai_health/${code}/${path}`)),
    '/ai_health/', // the language-detecting root page (it redirects)
```

2. Replace

```ts
      await page.goto(url);
      if (url.includes('/dev/')) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
      // Scroll to the bottom in steps so lazy-loaded images request their files before the network goes idle.
```

   with

```ts
      await page.goto(url);
      if (/\/dev\/figures\/[^/]+\/$/.test(url)) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
      // Scroll to the bottom in steps so lazy-loaded images request their files before the network goes idle.
```

3. Replace

```ts
  test.use({ viewport: { width: 375, height: 812 } });
  // The spike page mounts the 3D viewer (software WebGL on CI), so its sweep gets a longer budget.
  test.describe.configure({ timeout: 120_000 });
  for (const { code } of LOCALES) {
    for (const path of [...PAGES, 'dev/figure-spike/']) {
      test(`/${code}/${path} has no horizontal scroll`, async ({ page }) => {
        await page.goto(`/ai_health/${code}/${path}`);
        if (path.startsWith('dev/')) await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
```

   with

```ts
  test.use({ viewport: { width: 375, height: 812 } });
  // The figure page mounts the 3D viewer (software WebGL on CI), so its sweep gets a longer budget.
  test.describe.configure({ timeout: 120_000 });
  for (const { code } of LOCALES) {
    for (const path of [...PAGES, 'dev/figures/', 'dev/figures/smith-squat/']) {
      test(`/${code}/${path} has no horizontal scroll`, async ({ page }) => {
        await page.goto(`/ai_health/${code}/${path}`);
        if (path.startsWith('dev/figures/') && path !== 'dev/figures/') await expect(page.locator('[data-figure-status="ready"]')).toBeVisible({ timeout: 90_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
```

4. Replace

```ts
      expect(home.trim()).not.toBe('');
      for (const path of ['fitness/', 'safety/', 'dev/figure-spike/']) {
        const d = await description(path);
```

   with

```ts
      expect(home.trim()).not.toBe('');
      for (const path of ['fitness/', 'safety/', 'dev/figures/', 'dev/figures/smith-squat/']) {
        const d = await description(path);
```


- [ ] **Step 3: Build the pages**

**Create `src/components/figure/FigureChecks.astro`:**

```astro
---
import { FIGURES } from '../../lib/figure/fixtures';
import { REAL_SKELETON } from '../../lib/figure/pose/realSkeleton';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

/** The figure sweep for one figure, as a table: every stature × frame, its highest point, what failed and what was only warned about (spec §14). */
interface Props { lang: Locale; figureId: string }
const { lang, figureId } = Astro.props;
const figure = FIGURES[figureId]!;
const STATURES = [150, 165, 175, 190, 200];
const rows = STATURES.flatMap((statureCm) =>
  figure.frames.map((frame, i) => {
    const posed = figure.pose(REAL_SKELETON, i, { statureCm });
    return { statureCm, label: frame.label[lang], topCm: Math.round(posed.topCm), errors: posed.findings.filter((f) => f.severity === 'error'), warnings: posed.findings.filter((f) => f.severity === 'warn') };
  }),
);
---
<div class="figure-checks-scroll" role="region" tabindex="0" aria-label={t(lang, 'devFigures.checks.region')}>
<table class="figure-checks">
  <thead>
    <tr>
      <th scope="col">{t(lang, 'devFigures.check.stature')}</th>
      <th scope="col">{t(lang, 'devFigures.check.frame')}</th>
      <th scope="col">{t(lang, 'devFigures.check.top')}</th>
      <th scope="col">{t(lang, 'devFigures.check.result')}</th>
      <th scope="col">{t(lang, 'devFigures.check.warnings')}</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((r) => (
      <tr>
        <td>{r.statureCm} cm</td>
        <td>{r.label}</td>
        <td>{r.topCm} cm</td>
        <td>
          {r.errors.length === 0
            ? <span class="pass">✓ {t(lang, 'devFigures.check.pass')}</span>
            : <span class="fail">✗ {t(lang, 'devFigures.check.fail')}: {r.errors.map((f, i) => <>{i > 0 && ', '}<code>{f.check}</code></>)}</span>}
        </td>
        <td>{r.warnings.length === 0 ? '—' : <span class="warn">{r.warnings.map((f, i) => <>{i > 0 && '; '}{f.message}</>)}</span>}</td>
      </tr>
    ))}
  </tbody>
</table>
</div>
```

**Create `src/pages/[lang]/dev/figures/index.astro`:**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import { figureMeta } from '../../../../lib/figure/figures';
import { FIGURES } from '../../../../lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../../../../lib/figure/geometry/models';
import { localeStaticPaths, localizedPath, requireLocale, t } from '../../../../lib/i18n';
import { withBase } from '../../../../lib/site';
import '../../../../components/figure/figure.css';

export function getStaticPaths() {
  return localeStaticPaths();
}
const lang = requireLocale(Astro.params.lang);
const figures = Object.values(FIGURES).map(figureMeta);
const models = Object.values(EQUIPMENT_MODELS);
---
<BaseLayout lang={lang} title={t(lang, 'devFigures.title')} description={t(lang, 'devFigures.intro')} noindex>
  <h1>{t(lang, 'devFigures.title')}</h1>
  <p class="lead">{t(lang, 'devFigures.intro')}</p>
  <h2>{t(lang, 'devFigures.exercises')}</h2>
  <ul class="figure-gallery">
    {figures.map((f) => (
      <li>
        <a href={localizedPath(lang, `dev/figures/${f.id}`)}>
          <img src={withBase(`figures/${f.id}/frame-1.webp`)} alt={f.name[lang]} width="900" height="1200" loading="lazy" decoding="async" />
          <span>{f.name[lang]}</span>
        </a>
      </li>
    ))}
  </ul>
  <h2>{t(lang, 'devFigures.equipment')}</h2>
  <p>{t(lang, 'figure.illustrative')}</p>
  <ul class="figure-gallery">
    {models.map((m) => (
      <li>
        <img src={withBase(`figures/equipment/${m.id}.webp`)} alt={m.id} width="900" height="1200" loading="lazy" decoding="async" />
        <span><code>{m.id}</code></span>
      </li>
    ))}
  </ul>
</BaseLayout>
```

**Create `src/pages/[lang]/dev/figures/[id].astro`:**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import FigureChecks from '../../../../components/figure/FigureChecks.astro';
import FigureFrames from '../../../../components/figure/FigureFrames.astro';
import FigureViewer from '../../../../components/figure/FigureViewer';
import { figureMeta } from '../../../../lib/figure/figures';
import { FIGURES } from '../../../../lib/figure/fixtures';
import { LOCALES, localizedPath, requireLocale, t } from '../../../../lib/i18n';
import { withBase } from '../../../../lib/site';

/** Unlisted review page for one figure: the live viewer (with a height picker), the pre-rendered frames and the sweep table. */
export function getStaticPaths() {
  return LOCALES.flatMap((lang) => Object.keys(FIGURES).map((id) => ({ params: { lang, id } })));
}
const lang = requireLocale(Astro.params.lang);
const figure = figureMeta(FIGURES[Astro.params.id!]!);
const images = figure.frames.map((_, i) => withBase(`figures/${figure.id}/frame-${i}.webp`));
---
<BaseLayout lang={lang} title={figure.name[lang]} description={`${t(lang, 'devFigures.pageIntro')} ${figure.name[lang]}`} noindex>
  <p><a href={localizedPath(lang, 'dev/figures')}>{t(lang, 'devFigures.back')}</a></p>
  <h1>{figure.name[lang]}</h1>
  <h2>{t(lang, 'devFigures.viewer')}</h2>
  <FigureViewer client:only="preact" lang={lang} modelUrl={withBase('models/human.glb')} figure={figure} fallbackImages={images} statureChoices={[150, 165, 175, 190, 200]} />
  <h2>{t(lang, 'devFigures.frames')}</h2>
  <FigureFrames lang={lang} figure={figure} images={images} />
  <h2>{t(lang, 'devFigures.checks')}</h2>
  <FigureChecks lang={lang} figureId={figure.id} />
</BaseLayout>
```

**Delete `src/pages/[lang]/dev/figure-spike.astro`.**

**Delete `src/components/figure/SpikeChecks.astro`.**

**Edit `src/components/figure/figure.css`** (2 changes):

1. Replace

```css
.figure-frames figcaption span { color: var(--muted); font-size: 0.9rem; }
.spike-checks-scroll { overflow-x: auto; }
.spike-checks { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.spike-checks th, .spike-checks td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.spike-checks .pass { color: var(--accent); }
.spike-checks .fail { color: var(--danger); font-weight: 600; }
.spike-checks-note { color: var(--muted); font-size: 0.85rem; margin-top: 6px; }
@media (max-width: 480px) { .spike-checks { font-size: 0.8rem; } }
.figure-badge { display: inline-block; margin: 0 0 8px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); font-size: 0.875rem; }
```

   with

```css
.figure-frames figcaption span { color: var(--muted); font-size: 0.9rem; }
.figure-checks-scroll { overflow-x: auto; }
.figure-checks { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.figure-checks th, .figure-checks td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.figure-checks .pass { color: var(--accent); }
.figure-checks .fail { color: var(--danger); font-weight: 600; }
.figure-checks .warn { color: var(--text); font-style: italic; }
.figure-badge { display: inline-block; margin: 0 0 8px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); font-size: 0.875rem; }
```

2. Replace

```css
.figure-height select { font: inherit; padding: 4px 8px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); }
```

   with

```css
.figure-height select { font: inherit; padding: 4px 8px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.figure-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; list-style: none; padding: 0; margin: 16px 0; }
.figure-gallery a, .figure-gallery li { display: flex; flex-direction: column; gap: 6px; color: inherit; }
.figure-gallery img { width: 100%; height: auto; border-radius: var(--radius); background: #f3f2ee; }
@media (max-width: 480px) { .figure-checks { font-size: 0.8rem; } }
```


**Edit `src/lib/i18n/en.ts`** (1 change):

1. Replace

```ts
  'figure.bothSides': 'Do both sides',
  'figure.dragHint': 'Drag to rotate',
  'spike.title': '3D figure preview: Smith machine squat',
  'spike.intro': 'An early preview of the 3D exercise figures. Machine dimensions are illustrative, not measurements of any specific machine.',
  'spike.viewer': 'Interactive view',
  'spike.frames': 'Printable frames',
  'spike.checks': 'Automated checks',
  'spike.checks.region': 'Automated checks table; scroll sideways if it does not fit',
  'spike.check.stature': 'Height',
  'spike.check.frame': 'Step',
  'spike.check.angles': 'Joint angles',
  'spike.check.result': 'Result',
  'spike.check.pass': 'All checks pass',
  'spike.check.fail': 'Failed',
  'spike.check.elbowNote': '* Elbow: how far it bends, not which way. The figure does not yet turn the upper arm, so the checks test only the size of the elbow bend.',
  'angle.trunk': 'trunk',
  'angle.hip': 'hip',
  'angle.knee': 'knee',
  'angle.elbow': 'elbow',
  'unit.length.cm': '{value} cm',
```

   with

```ts
  'figure.bothSides': 'Do both sides',
  'devFigures.title': 'Exercise figures (preview)',
  'devFigures.intro': 'Every 3D exercise figure and equipment model, for review. Dimensions are illustrative, not measurements of any specific equipment.',
  'devFigures.exercises': 'Exercises',
  'devFigures.equipment': 'Equipment',
  'devFigures.pageIntro': 'Preview of the 3D figure:',
  'devFigures.back': 'All figures',
  'devFigures.viewer': 'Interactive view',
  'devFigures.frames': 'Printable frames',
  'devFigures.checks': 'Automated checks',
  'devFigures.checks.region': 'Automated checks table; scroll sideways if it does not fit',
  'devFigures.check.stature': 'Height',
  'devFigures.check.frame': 'Step',
  'devFigures.check.top': 'Highest point',
  'devFigures.check.result': 'Result',
  'devFigures.check.pass': 'All checks pass',
  'devFigures.check.fail': 'Failed',
  'devFigures.check.warnings': 'Warnings',
  'figure.dragHint': 'Drag to rotate',
  'unit.length.cm': '{value} cm',
```


**Edit `src/lib/i18n/zh.ts`** (1 change):

1. Replace

```ts
  'figure.bothSides': '两侧都要做',
  'figure.dragHint': '拖动可旋转',
  'spike.title': '3D 人物预览：史密斯机深蹲',
  'spike.intro': '3D 动作图的早期预览。器械尺寸仅为示意，并非任何具体器械的实测数据。',
  'spike.viewer': '交互视图',
  'spike.frames': '可打印分解图',
  'spike.checks': '自动检查',
  'spike.checks.region': '自动检查表格；如果放不下，可左右滑动',
  'spike.check.stature': '身高',
  'spike.check.frame': '步骤',
  'spike.check.angles': '关节角度',
  'spike.check.result': '结果',
  'spike.check.pass': '全部通过',
  'spike.check.fail': '未通过',
  'spike.check.elbowNote': '* 肘：只显示弯曲幅度，不显示弯曲方向。人物尚未模拟上臂旋转，因此检查只核对肘关节弯曲的幅度。',
  'angle.trunk': '躯干',
  'angle.hip': '髋',
  'angle.knee': '膝',
  'angle.elbow': '肘',
  'unit.length.cm': '{value} 厘米',
```

   with

```ts
  'figure.bothSides': '两侧都要做',
  'devFigures.title': '动作图（预览）',
  'devFigures.intro': '所有 3D 动作图和器械模型，供审阅。尺寸仅为示意，并非任何具体器械的实测数据。',
  'devFigures.exercises': '动作',
  'devFigures.equipment': '器械',
  'devFigures.pageIntro': '3D 动作图预览：',
  'devFigures.back': '全部动作图',
  'devFigures.viewer': '交互视图',
  'devFigures.frames': '可打印分解图',
  'devFigures.checks': '自动检查',
  'devFigures.checks.region': '自动检查表格；如果放不下，可左右滑动',
  'devFigures.check.stature': '身高',
  'devFigures.check.frame': '步骤',
  'devFigures.check.top': '最高点',
  'devFigures.check.result': '结果',
  'devFigures.check.pass': '全部通过',
  'devFigures.check.fail': '未通过',
  'devFigures.check.warnings': '提示',
  'figure.dragHint': '拖动可旋转',
  'unit.length.cm': '{value} 厘米',
```


**Edit `README.md`** (1 change):

1. Replace

```markdown

A preview of the 3D figure is at [/en/dev/figure-spike/](https://tomqwu.github.io/ai_health/en/dev/figure-spike/).

```

   with

```markdown

The 3D figures can be previewed on a review page with every figure and piece of equipment: [/en/dev/figures/](https://tomqwu.github.io/ai_health/en/dev/figures/).

```


- [ ] **Step 4: Run every check and the end-to-end tests**

Run: `npm test && npm run lint && npm run check && npm run render:figures && npm run test:e2e`
Expected: unit tests pass (the i18n parity test covers the new keys); 0 lint and type errors; every end-to-end test passes, including the smith-squat viewer (15 check rows, 0 errors, 0 warnings), the height picker, the dumbbell curl, the gallery (every image loads), the WebGL-off fallback for both figures, same-origin requests and the 375 px checks for the new pages.

- [ ] **Step 5: Commit, open the PR, merge when CI is green**

```bash
git add src tests/e2e README.md
git commit -m $'feat(figures): add figure review pages; move the end-to-end tests to them\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure review pages and end-to-end tests" \
  --body $'Unlisted /[lang]/dev/figures/ (every figure and equipment still) and /[lang]/dev/figures/[id]/ (viewer with a height picker, frames, sweep table with errors and warnings) replace the M1 spike page.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

- [ ] **Step 6: Wait for the deploy**

The merge to `main` triggers CI and then the deploy (the first run renders everything cold). Wait for both: `gh run watch --repo tomqwu/ai_health $(gh run list --repo tomqwu/ai_health --workflow ci.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`, then the same for `deploy.yml` once it has started. Then check that `https://tomqwu.github.io/ai_health/en/dev/figures/db-curl/` loads.

- [ ] **Step 7 (controller only, non-blocking): Send the owner an early look**

A subagent executing this task stops after Step 6 and reports. The controller then posts one message as a comment on the Task 15 gate issue (so GitHub notifies the owner, who may not see mid-turn chat text until the turn ends) and sends the same text in chat:

> Early look at the M3 figures, before the other 18 are posed. The first library figure, the dumbbell curl: https://tomqwu.github.io/ai_health/en/dev/figures/db-curl/ (drag to orbit, Play, try the height picker). All 20 equipment models: https://tomqwu.github.io/ai_health/en/dev/figures/ (the "Equipment" section). Anything about the look (the person, the equipment, the camera, the arrow) is easiest to change now. One question for later (#47): elbows and knees bend on their hinges, which folds the sleeve a little at the shoulder; the full review will show both options side by side. No need to reply now: work carries on, and the full review comes after all 20 figures.

The controller does not wait for a reply: it continues with Task 9. Whatever the owner says before Task 15 is applied in the figure tasks, or filed as an issue for Task 15 if it concerns the shared look.

**Done when:** the review pages build in both languages, the end-to-end tests pass with and without WebGL, the pages are deployed, and the controller has sent the owner the early look.

---
### Task 9: Figures — bench and Smith presses

Three pushing patterns on the bench (controller decision 2): the Smith bench press (horizontal push) with the flat bench inside the rack and the bar on the rails — it exercises the bench-in-rack check, the bar-on-rail check re-derived from the hands and the stops; the incline dumbbell press (incline push) on the backrest at 30°; the seated dumbbell shoulder press (vertical push) against the upright backrest. The body sits on the seat and lies on the backrest through declared contacts (`pelvis` on `bench.seat`, `chest` on `bench.back`). Placing the hips from the bench hinge with body-scaled offsets keeps both contacts exact at every stature, because the body scales about the hinge corner.

**Files:**
- Create: `src/lib/figure/fixtures/smith-bench-press.ts`, `src/lib/figure/fixtures/db-incline-press.ts`, `src/lib/figure/fixtures/db-shoulder-press.ts`, `src/lib/figure/fixtures/coverage.test.ts`
- Modify: `src/lib/figure/fixtures/index.ts`

**Interfaces:**
- Consumes: the pose library (Tasks 4–6: `PoseFigureSpec`, `bothArms`, `bothLegs`, `PointRef` anchors), scene builders (Task 3).
- Produces: figures `smith-bench-press`, `db-incline-press`, `db-shoulder-press` in `FIGURES`, each posed cleanly by the sweep at 150–200 cm.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figures-presses
```

- [ ] **Step 2: Write the failing test** (the coverage table gains this task's patterns)

**Create `src/lib/figure/fixtures/coverage.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { FIGURES } from '.';
import { CARDIO_PATTERNS, PATTERNS } from '../../content/vocab';

/**
 * M3 poses one representative figure per movement pattern (spec §5.4) except the two cardio patterns,
 * whose machine sessions may omit figures (§5.3). M5 adds the rest of the v1 exercises. Each figure
 * task adds its rows here.
 */
const BY_PATTERN = {
  'horizontal-push': 'smith-bench-press',
  'incline-push': 'db-incline-press',
  'vertical-push': 'db-shoulder-press',
  squat: 'smith-squat',
  'elbow-flexion': 'db-curl',
} as const;

describe('M3 figure coverage', () => {
  it('has a figure for every pattern posed so far, and no others', () => {
    expect(Object.keys(FIGURES).sort()).toEqual(Object.values(BY_PATTERN).sort());
  });
  it('uses only the non-cardio patterns of the content vocabulary', () => {
    const nonCardio = PATTERNS.filter((p) => !CARDIO_PATTERNS.includes(p));
    for (const p of Object.keys(BY_PATTERN)) expect(nonCardio, p).toContain(p);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/fixtures/coverage.test.ts`
Expected: FAIL — the registry lacks `smith-bench-press`, `db-incline-press`, `db-shoulder-press`.

- [ ] **Step 4: Add the figures**

**Create `src/lib/figure/fixtures/smith-bench-press.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Lying on the flat bench, head toward the back of the rack, the rail over the lower chest. */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', cm: [0, 0, 8], bodyCm: [0, 10, 0] }, pitchDeg: -90, head: { flexDeg: -12 } };
const grip = (): ArmGoal => ({ to: { hold: 'smith-bar', alongCm: 36 }, elbow: [0.4, -1, 0.3], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [26, 0, 52] }, knee: [0.2, 1, 0.3], sole: [0, -1, 0], toes: [0.15, 0, 1], contact: 'flat' });
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
] as const;

/** Smith machine bench press (horizontal push): bench inside the rack, bar on the rails. */
export const SMITH_BENCH_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'smith-bench-press',
  name: { en: 'Smith Machine Bench Press', zh: '史密斯机卧推' },
  scene: { trainer: { catchHeightCm: 60 }, bench: { at: [0, 0, 28], angleDeg: 0 } },
  camera: { azimuthDeg: 28, elevationDeg: 24, distanceCm: 470, target: { from: 'smith.rail', cm: [0, 72, 18] } },
  frames: [
    {
      id: 'unrack',
      label: { en: 'Unrack', zh: '出杠' },
      cue: { en: 'Arms long with soft elbows, bar over the lower chest', zh: '手臂伸长、肘部微屈，杠铃位于下胸上方' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 50, 0] } },
      arrow: { track: 'bar', toward: 1, offsetCm: [0, 0, 24] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower to the chest, elbows about 45° from the body', zh: '下放至胸部，肘部与身体约成 45°' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 18, 0] } },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推起' },
      cue: { en: 'Press up and keep your shoulder blades back', zh: '向上推起，肩胛骨保持后收' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 34, 0] } },
      arrow: { track: 'bar', toward: 0, offsetCm: [0, 0, 24] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/db-incline-press.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Seated back on the bench at 30°, feet flat in front. */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', bodyCm: [0, 10, 2.5] }, pitchDeg: -60, head: { flexDeg: 10 } };
const press = (to: [number, number, number], elbow: [number, number, number], palm: [number, number, number] = [0, 0.5, 1]): ArmGoal => ({
  to: { from: 'body.shoulder_l', bodyCm: to },
  elbow,
  hand: { grip: 'bar', axis: [1, 0, 0], palm, seat: 'palm' },
});
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [27, 0, 62] }, knee: [0.2, 1, 0.4], sole: [0, -1, 0], toes: [0.2, 0, 1], contact: 'flat' });
/** Seated on the pad, back on the backrest; the thighs rest on the seat's front edge (a loose contact). */
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
  { part: 'thigh_l', on: 'bench.seat', loose: true },
  { part: 'thigh_r', on: 'bench.seat', loose: true },
] as const;

/** Incline dumbbell press (incline push): backrest at 30°, dumbbells pressed over the upper chest. */
export const DB_INCLINE_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-incline-press',
  name: { en: 'Incline Dumbbell Press', zh: '上斜哑铃卧推' },
  scene: { bench: { at: [0, 0, 0], angleDeg: 30 } },
  camera: { azimuthDeg: 70, elevationDeg: 12, distanceCm: 420, target: { from: 'bench.hinge', cm: [0, 25, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Press position', zh: '推起位' },
      cue: { en: 'Dumbbells over the upper chest, arms nearly straight', zh: '哑铃位于上胸上方，手臂接近伸直' },
      trunk,
      arms: bothArms(press([7, 53, 11], [1, -0.4, 0])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [14, 0, 0] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower beside the upper chest, forearms vertical', zh: '下放至上胸两侧，前臂保持竖直' },
      trunk,
      arms: bothArms(press([16, 10, 10], [1, -0.5, -0.3], [0, -0.2, 1])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推起' },
      cue: { en: 'Press up and slightly in', zh: '向上并略向内推起' },
      trunk,
      arms: bothArms(press([19, 29, 9], [1, -0.5, -0.2])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [14, 0, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/db-shoulder-press.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Seated upright, back against the backrest at 90°. */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', bodyCm: [0, 10, 11] }, pitchDeg: -4 };
const press = (to: [number, number, number], elbow: [number, number, number], shrugDeg = 0): ArmGoal => ({
  to: { from: 'body.shoulder_l', bodyCm: to },
  elbow,
  hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' },
  shrugDeg,
});
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [27, 0, 58] }, knee: [0.2, 0.3, 1], sole: [0, -1, 0], toes: [0.2, 0, 1], contact: 'flat' });
/** Seated on the pad, back on the backrest; the thighs rest on the seat's front edge (a loose contact). */
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
  { part: 'thigh_l', on: 'bench.seat', loose: true },
  { part: 'thigh_r', on: 'bench.seat', loose: true },
] as const;

/** Seated dumbbell shoulder press (vertical push): upright backrest, dumbbells from shoulder height to overhead. */
export const DB_SHOULDER_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-shoulder-press',
  name: { en: 'Seated Dumbbell Shoulder Press', zh: '坐姿哑铃肩推' },
  scene: { bench: { at: [0, 0, 0], angleDeg: 90 } },
  camera: { azimuthDeg: 40, elevationDeg: 8, distanceCm: 440, target: { from: 'bench.hinge', cm: [0, 50, 20] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Dumbbells at shoulder height, forearms vertical', zh: '哑铃位于肩部高度，前臂竖直' },
      trunk,
      arms: bothArms(press([20, 14, 4], [1, -0.8, -0.1])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [14, 0, 0] },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推举' },
      cue: { en: 'Press overhead without arching your back', zh: '向上推举，背部不要拱起' },
      trunk,
      arms: bothArms(press([1, 55, 4], [1, -0.2, 0], 12)),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower with control back to shoulder height', zh: '有控制地下放回肩部高度' },
      trunk,
      arms: bothArms(press([19, 31, 2], [1, -0.5, 0], 5)),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [14, 0, 0] },
    },
  ],
};
```

**Edit `src/lib/figure/fixtures/index.ts`** (2 changes):

1. Replace

```ts
import { DB_CURL } from './db-curl';
import { SMITH_SQUAT } from './smith-squat';
```

   with

```ts
import { DB_CURL } from './db-curl';
import { DB_INCLINE_PRESS } from './db-incline-press';
import { DB_SHOULDER_PRESS } from './db-shoulder-press';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
import { SMITH_SQUAT } from './smith-squat';
```

2. Replace

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL];

```

   with

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS];

```


Notes on the numbers: pressing grips seat the bar low in the palm (`seat: 'palm'`); the Smith bar's height comes from the frame (`props.smithBar` measured from `body.shoulders`), and the bar always runs on the rail; the catches are set just below the lowest bar (`catchHeightCm: 60`). Feet sit outside the bench's front foot so shins do not touch it. Pressing wrists may bend at most 25°, so each press puts the elbows under the hands: the Smith grip is wider (`alongCm: 36`) with the elbow pole out, down and a little forward (`[0.4, −1, 0.3]`), and the dumbbell presses set the elbow pole so the forearm stands under the dumbbell. The thighs rest on the seat with a `loose` contact: they are allowed on it but not measured, since the knee angle, not the seat, decides where they are.

- [ ] **Step 5: Run the sweep and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: the coverage test passes; `figure-sweep.test.ts` 30 passed (5 figures × five statures, 150–200 cm, keyframes and in-between poses, plus a Play budget test per figure: at most 5 solver runs per in-between pose), with no errors and no warnings (the sweep fails on either); 0 lint and type errors. If a frame fails after an edit, the finding names the check, the part and the distance; adjust that frame's numbers (hips `bodyCm`, a limb target, an elbow or knee pole, a grip's `alongCm`) and rerun. A wrist finding usually means the forearm is not under the hand: move the elbow pole or widen the grip rather than turning the hand.

- [ ] **Step 6: Render and look**

Run: `npm run render:figures`, then `npm run dev -- --ignore-lock` and open `http://localhost:4321/ai_health/en/dev/figures/` and each new figure's page.
Expected: the new frames render (only the new figures render; the rest come from the cache); every pose reads as the exercise named and matches its cues, hands hold what they hold with straight wrists, held weights stay clear of the body, feet and body rest on what they declare, and the height picker keeps the pose valid at 150 and 200 cm.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/fixtures/smith-bench-press.ts src/lib/figure/fixtures/db-incline-press.ts src/lib/figure/fixtures/db-shoulder-press.ts src/lib/figure/fixtures/index.ts src/lib/figure/fixtures/coverage.test.ts
git commit -m $'feat(figures): add the figures for bench and Smith presses\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figures: bench and Smith presses" \
  --body $'Adds the smith-bench-press, db-incline-press, db-shoulder-press figures (spec §5.4 patterns; M3 representative set, controller decision 2).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the three press figures pose cleanly at every stature, with the Smith bar on its rails and within its stops and the bench clear of the rack.

---
### Task 10: Figures — standing free weights

Five standing patterns with free weights: the lateral raise (shoulder abduction), the standing calf raise (calf: heels up on the balls of the feet, toes laid flat), the split squat (lunge, unilateral: left foot forward, rear heel up), the barbell Romanian deadlift (hip hinge: the bar is carried from the shoulders so in-between poses keep the arms long, and its bumper plates stay above the floor at every stature; the neck is slightly extended so the gaze stays on the floor a little ahead, in line with the back), and the band pull-apart (rear delts, the resistance band stretched between the fists). Poses built only from floor and body anchors are identical, scaled, at every stature.

**Files:**
- Create: `src/lib/figure/fixtures/db-lateral-raise.ts`, `src/lib/figure/fixtures/db-calf-raise.ts`, `src/lib/figure/fixtures/db-split-squat.ts`, `src/lib/figure/fixtures/barbell-romanian-deadlift.ts`, `src/lib/figure/fixtures/band-pull-apart.ts`
- Modify: `src/lib/figure/fixtures/index.ts`, `src/lib/figure/fixtures/coverage.test.ts`

**Interfaces:**
- Consumes: the pose library (Tasks 4–6: `PoseFigureSpec`, `bothArms`, `bothLegs`, `PointRef` anchors), scene builders (Task 3).
- Produces: figures `db-lateral-raise`, `db-calf-raise`, `db-split-squat`, `barbell-romanian-deadlift`, `band-pull-apart` in `FIGURES`, each posed cleanly by the sweep at 150–200 cm.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figures-free-weights
```

- [ ] **Step 2: Write the failing test** (the coverage table gains this task's patterns)

**Edit `src/lib/figure/fixtures/coverage.test.ts`** (1 change):

1. Replace

```ts
  squat: 'smith-squat',
  'elbow-flexion': 'db-curl',
} as const;
```

   with

```ts
  squat: 'smith-squat',
  lunge: 'db-split-squat',
  'hip-hinge': 'barbell-romanian-deadlift',
  calf: 'db-calf-raise',
  'elbow-flexion': 'db-curl',
  'shoulder-abduction': 'db-lateral-raise',
  'rear-delt': 'band-pull-apart',
} as const;
```


- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/fixtures/coverage.test.ts`
Expected: FAIL — the registry lacks `db-lateral-raise`, `db-calf-raise`, `db-split-squat`, `barbell-romanian-deadlift`, `band-pull-apart`.

- [ ] **Step 4: Add the figures**

**Create `src/lib/figure/fixtures/db-lateral-raise.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

const trunk: TrunkPose = { hips: { bodyCm: [0, 94.4, 0] }, pitchDeg: 6 };
const legs = bothLegs({ to: { bodyCm: [13, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.12, 0, 1], contact: 'flat' });
const arm = (to: [number, number, number], palm: [number, number, number]): ArmGoal => ({ to: { from: 'body.shoulder_l', bodyCm: to }, elbow: [0.2, 0.2, -1], hand: { grip: 'bar', axis: [0, 0, 1], palm } });

/** Dumbbell lateral raise (shoulder abduction): arms out to the sides to shoulder height. */
export const DB_LATERAL_RAISE: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-lateral-raise',
  name: { en: 'Dumbbell Lateral Raise', zh: '哑铃侧平举' },
  scene: {},
  camera: { azimuthDeg: 20, elevationDeg: 6, distanceCm: 380, target: { bodyCm: [0, 110, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Dumbbells at your sides, elbows soft', zh: '哑铃置于身体两侧，肘部微屈' },
      trunk,
      arms: bothArms(arm([6, -59, 6], [-1, 0, 0])),
      legs: legs,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [8, 0, 10] },
    },
    {
      id: 'raise',
      label: { en: 'Raise', zh: '上举' },
      cue: { en: 'Raise to shoulder height, leading with the elbows', zh: '以肘部带动上举至与肩同高' },
      trunk,
      arms: bothArms(arm([58, -4, 8], [0, -1, 0.1])),
      legs: legs,
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower slowly, do not swing', zh: '慢慢下放，不要借力摆动' },
      trunk,
      arms: bothArms(arm([41, -41, 8], [-0.6, -0.8, 0])),
      legs: legs,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [8, 0, 10] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/db-calf-raise.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type LegGoal, type PoseFigureSpec } from '../pose/poseSpec';

const hold: ArmGoal = { to: { from: 'body.shoulder_l', bodyCm: [4, -57, 2] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [0, 0, 1], palm: [-1, 0, 0] } };
const heel = (deg: number): LegGoal => {
  const a = (deg * Math.PI) / 180;
  return { to: { bodyCm: [12, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -Math.cos(a), -Math.sin(a)], toes: [0.12, -Math.sin(a), Math.cos(a)], contact: deg === 0 ? 'flat' : 'ball' };
};

/** Standing dumbbell calf raise (calf): rise onto the balls of the feet. */
export const DB_CALF_RAISE: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-calf-raise',
  name: { en: 'Standing Dumbbell Calf Raise', zh: '站姿哑铃提踵' },
  scene: {},
  camera: { azimuthDeg: 60, elevationDeg: 4, distanceCm: 380, target: { bodyCm: [0, 95, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Stand tall, dumbbells at your sides', zh: '站直，哑铃置于身体两侧' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms(hold),
      legs: bothLegs(heel(0)),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hips', toward: 1, offsetCm: [30, 0, 10] },
    },
    {
      id: 'rise',
      label: { en: 'Rise', zh: '提踵' },
      cue: { en: 'Rise as high as you can onto the balls of your feet', zh: '尽量用前脚掌向上踮起' },
      trunk: { hips: { bodyCm: [0, 100.3, 0] } },
      arms: bothArms(hold),
      legs: bothLegs(heel(32)),
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower your heels slowly to the floor', zh: '慢慢将脚跟放回地面' },
      trunk: { hips: { bodyCm: [0, 97.6, 0] } },
      arms: bothArms(hold),
      legs: bothLegs(heel(15)),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hips', toward: 0, offsetCm: [30, 0, 10] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/db-split-squat.ts`:**

```ts
import { type ArmGoal, bothArms, type LegGoal, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

const hold: ArmGoal = { to: { from: 'body.shoulder_l', bodyCm: [7, -58, 2] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [0, 0, 1], palm: [-1, 0, 0] } };
const front: LegGoal = { to: { bodyCm: [11, 0, 44] }, knee: [0.1, 0, 1], sole: [0, -1, 0], toes: [0.08, 0, 1], contact: 'flat' };
/** Rear foot on the ball of the foot, heel up. */
const rear: LegGoal = { to: { bodyCm: [-11, 0, -46] }, knee: [0, -0.4, 1], sole: [0, -0.42, -0.91], toes: [-0.05, -0.91, 0.42], contact: 'ball' };
const trunk = (y: number, z: number): TrunkPose => ({ hips: { bodyCm: [0, y, z] }, pitchDeg: 6 });

/** Dumbbell split squat (lunge): left foot forward, dumbbells at the sides; the working leg faces the camera. */
export const DB_SPLIT_SQUAT: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-split-squat',
  name: { en: 'Dumbbell Split Squat', zh: '哑铃分腿蹲' },
  scene: {},
  camera: { azimuthDeg: 72, elevationDeg: 6, distanceCm: 400, target: { bodyCm: [0, 80, 0] } },
  unilateral: true,
  frames: [
    {
      id: 'stance',
      label: { en: 'Split stance', zh: '分腿站姿' },
      cue: { en: 'Long stance, back heel up, torso tall', zh: '前后分腿站稳，后脚跟抬起，上身挺直' },
      trunk: trunk(84, 0),
      arms: { l: hold, r: bothArms(hold).r },
      legs: { l: front, r: rear },
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hips', toward: 1, offsetCm: [26, 0, 0] },
    },
    {
      id: 'bottom',
      label: { en: 'Bottom', zh: '最低点' },
      cue: { en: 'Lower until the back knee almost touches the floor', zh: '下蹲至后膝几乎触地' },
      trunk: trunk(52, -4),
      arms: { l: hold, r: bothArms(hold).r },
      legs: { l: front, r: rear },
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'drive',
      label: { en: 'Drive up', zh: '起身' },
      cue: { en: 'Push through the front foot to stand', zh: '前脚发力蹬地站起' },
      trunk: trunk(68, -2),
      arms: { l: hold, r: bothArms(hold).r },
      legs: { l: front, r: rear },
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hips', toward: 0, offsetCm: [26, 0, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/barbell-romanian-deadlift.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec } from '../pose/poseSpec';

const grip: ArmGoal = { to: { hold: 'barbell', alongCm: 24 }, elbow: [0.3, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] } };
const legs = bothLegs({ to: { bodyCm: [12, 0, 14] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.1, 0, 1], contact: 'flat' });

/** Barbell Romanian deadlift (hip hinge): hips back, bar close to the legs, knees soft. */
export const BARBELL_ROMANIAN_DEADLIFT: PoseFigureSpec = {
  kind: 'pose',
  id: 'barbell-romanian-deadlift',
  name: { en: 'Barbell Romanian Deadlift', zh: '杠铃罗马尼亚硬拉' },
  scene: {},
  camera: { azimuthDeg: 70, elevationDeg: 6, distanceCm: 460, target: { bodyCm: [0, 80, 5] } },
  frames: [
    {
      id: 'stand',
      label: { en: 'Stand tall', zh: '站直' },
      cue: { en: 'Bar against the thighs, shoulders back', zh: '杠铃贴近大腿，肩膀后收' },
      trunk: { hips: { bodyCm: [0, 94, 0] }, pitchDeg: 2 },
      arms: bothArms(grip),
      legs,
      props: { barbell: { from: 'body.shoulders', bodyCm: [0, -57.3, 5.7] } },
      arrow: { track: 'hips', toward: 1, offsetCm: [0, 18, -14] },
    },
    {
      id: 'hinge',
      label: { en: 'Hinge', zh: '屈髋' },
      cue: { en: 'Push the hips back until the bar is just below the knees', zh: '臀部向后推，直到杠铃略低于膝盖' },
      trunk: { hips: { bodyCm: [0, 90, -18] }, pitchDeg: 78, spine: { flexDeg: 6 }, head: { flexDeg: -12 } },
      arms: bothArms(grip),
      legs,
      props: { barbell: { from: 'body.shoulders', bodyCm: [0, -50.3, -16.9] } },
    },
    {
      id: 'drive',
      label: { en: 'Drive the hips', zh: '伸髋' },
      cue: { en: 'Squeeze the glutes and stand back up', zh: '收紧臀部，站回直立' },
      trunk: { hips: { bodyCm: [0, 92.5, -10] }, pitchDeg: 42, spine: { flexDeg: 3 }, head: { flexDeg: -6 } },
      arms: bothArms(grip),
      legs,
      props: { barbell: { from: 'body.shoulders', bodyCm: [0, -54.3, -11.7] } },
      arrow: { track: 'hips', toward: 0, offsetCm: [0, 18, -14] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/band-pull-apart.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

const trunk: TrunkPose = { hips: { bodyCm: [0, 94.4, 0] } };
const legs = bothLegs({ to: { bodyCm: [13, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.12, 0, 1], contact: 'flat' });
/** The band runs across the fists: side to side with the arms forward, front to back with the arms out. */
const arm = (to: [number, number, number], axis: [number, number, number] = [1, 0, 0]): ArmGoal => ({ to: { from: 'body.shoulder_l', bodyCm: to }, elbow: [0.3, -1, 0], hand: { grip: 'bar', axis, palm: [0, -1, 0] } });

/** Band pull-apart (rear delts): straight arms at shoulder height pull a loop band apart. */
export const BAND_PULL_APART: PoseFigureSpec = {
  kind: 'pose',
  id: 'band-pull-apart',
  name: { en: 'Band Pull-Apart', zh: '弹力带拉开' },
  scene: {},
  camera: { azimuthDeg: 30, elevationDeg: 12, distanceCm: 380, target: { bodyCm: [0, 115, 10] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Arms straight in front at shoulder height', zh: '手臂在胸前伸直，与肩同高' },
      trunk,
      arms: bothArms(arm([-5, -3, 58])),
      legs,
      props: { band: 'between-hands' },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [0, 10, 0] },
    },
    {
      id: 'apart',
      label: { en: 'Pull apart', zh: '拉开' },
      cue: { en: 'Pull the band to your chest, squeezing the shoulder blades', zh: '将弹力带拉至胸前，夹紧肩胛骨' },
      trunk,
      arms: bothArms(arm([52, -3, 26], [0.5, 0, -1])),
      legs,
      props: { band: 'between-hands' },
    },
    {
      id: 'return',
      label: { en: 'Return', zh: '还原' },
      cue: { en: 'Let the band back slowly', zh: '慢慢还原' },
      trunk,
      arms: bothArms(arm([30, -3, 50], [1, 0, -0.6])),
      legs,
      props: { band: 'between-hands' },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [0, 10, 0] },
    },
  ],
};
```

**Edit `src/lib/figure/fixtures/index.ts`** (2 changes):

1. Replace

```ts
import type { PoseFigureSpec } from '../pose/poseSpec';
import { DB_CURL } from './db-curl';
import { DB_INCLINE_PRESS } from './db-incline-press';
import { DB_SHOULDER_PRESS } from './db-shoulder-press';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

   with

```ts
import type { PoseFigureSpec } from '../pose/poseSpec';
import { BAND_PULL_APART } from './band-pull-apart';
import { BARBELL_ROMANIAN_DEADLIFT } from './barbell-romanian-deadlift';
import { DB_CALF_RAISE } from './db-calf-raise';
import { DB_CURL } from './db-curl';
import { DB_INCLINE_PRESS } from './db-incline-press';
import { DB_LATERAL_RAISE } from './db-lateral-raise';
import { DB_SHOULDER_PRESS } from './db-shoulder-press';
import { DB_SPLIT_SQUAT } from './db-split-squat';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

2. Replace

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS];

```

   with

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART];

```


Notes on the numbers: standing hips at 94.4 cm (at 175 cm) leave the knees soft; a bar grip's axis must cross the forearm, so the pull-apart turns the band from side to side (arms forward) to front to back (arms out), with axes pointing the same way in every frame so the in-between poses turn with the forearm. Held dumbbells hang beside the legs, not in front of them: the implement check fails a dumbbell more than 4 cm inside a thigh (the split squat holds them 7 cm out from the shoulder at 175 cm).

- [ ] **Step 5: Run the sweep and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: the coverage test passes; `figure-sweep.test.ts` 60 passed (10 figures × five statures, 150–200 cm, keyframes and in-between poses, plus a Play budget test per figure: at most 5 solver runs per in-between pose), with no errors and no warnings (the sweep fails on either); 0 lint and type errors. If a frame fails after an edit, the finding names the check, the part and the distance; adjust that frame's numbers (hips `bodyCm`, a limb target, an elbow or knee pole, a grip's `alongCm`) and rerun. A wrist finding usually means the forearm is not under the hand: move the elbow pole or widen the grip rather than turning the hand.

- [ ] **Step 6: Render and look**

Run: `npm run render:figures`, then `npm run dev -- --ignore-lock` and open `http://localhost:4321/ai_health/en/dev/figures/` and each new figure's page.
Expected: the new frames render (only the new figures render; the rest come from the cache); every pose reads as the exercise named and matches its cues, hands hold what they hold with straight wrists, held weights stay clear of the body, feet and body rest on what they declare, and the height picker keeps the pose valid at 150 and 200 cm.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/fixtures/db-lateral-raise.ts src/lib/figure/fixtures/db-calf-raise.ts src/lib/figure/fixtures/db-split-squat.ts src/lib/figure/fixtures/barbell-romanian-deadlift.ts src/lib/figure/fixtures/band-pull-apart.ts src/lib/figure/fixtures/index.ts src/lib/figure/fixtures/coverage.test.ts
git commit -m $'feat(figures): add the figures for standing free weights\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figures: standing free weights" \
  --body $'Adds the db-lateral-raise, db-calf-raise, db-split-squat, barbell-romanian-deadlift, band-pull-apart figures (spec §5.4 patterns; M3 representative set, controller decision 2).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the five figures pose cleanly at every stature, and the barbell never passes through the floor.

---
### Task 11: Figures — cable station

Three patterns on the left cable column: the seated cable row (horizontal pull: seated on the floor facing the column, feet flat on the seated-row footplate, close-grip handle on the low pulley), the rope triceps pushdown (elbow extension: rope on the high pulley) and the Pallof press (core anti-rotation, unilateral: side-on to the column, both hands on a single handle at chest height). The handles follow the hands and the cable runs from the pulley to where the handle hooks on, so what is drawn is always held.

**Files:**
- Create: `src/lib/figure/fixtures/cable-seated-row.ts`, `src/lib/figure/fixtures/cable-triceps-pushdown.ts`, `src/lib/figure/fixtures/cable-pallof-press.ts`
- Modify: `src/lib/figure/fixtures/index.ts`, `src/lib/figure/fixtures/coverage.test.ts`

**Interfaces:**
- Consumes: the pose library (Tasks 4–6: `PoseFigureSpec`, `bothArms`, `bothLegs`, `PointRef` anchors), scene builders (Task 3).
- Produces: figures `cable-seated-row`, `cable-triceps-pushdown`, `cable-pallof-press` in `FIGURES`, each posed cleanly by the sweep at 150–200 cm.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figures-cable
```

- [ ] **Step 2: Write the failing test** (the coverage table gains this task's patterns)

**Edit `src/lib/figure/fixtures/coverage.test.ts`** (2 changes):

1. Replace

```ts
  'vertical-push': 'db-shoulder-press',
  squat: 'smith-squat',
```

   with

```ts
  'vertical-push': 'db-shoulder-press',
  'horizontal-pull': 'cable-seated-row',
  squat: 'smith-squat',
```

2. Replace

```ts
  'elbow-flexion': 'db-curl',
  'shoulder-abduction': 'db-lateral-raise',
  'rear-delt': 'band-pull-apart',
} as const;
```

   with

```ts
  'elbow-flexion': 'db-curl',
  'elbow-extension': 'cable-triceps-pushdown',
  'shoulder-abduction': 'db-lateral-raise',
  'rear-delt': 'band-pull-apart',
  'core-anti-rotation': 'cable-pallof-press',
} as const;
```


- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/fixtures/coverage.test.ts`
Expected: FAIL — the registry lacks `cable-seated-row`, `cable-triceps-pushdown`, `cable-pallof-press`.

- [ ] **Step 4: Add the figures**

**Create `src/lib/figure/fixtures/cable-seated-row.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/**
 * Seated on the floor facing the left column (−z), so the body's left is world −x; feet flat on the
 * seated-row footplate, a close-grip handle on the low pulley.
 */
const trunk = (pitchDeg: number, flexDeg: number): TrunkPose => ({ hips: { from: 'footplate', yFromFloor: true, bodyCm: [0, 10, 94] }, yawDeg: 180, pitchDeg, spine: { flexDeg } });
const handle = (to: [number, number, number], elbow: [number, number, number]): ArmGoal => ({ to: { from: 'body.shoulders', bodyCm: to }, elbow, hand: { grip: 'bar', axis: [0, 1, 0], palm: [1, 0, 0] } });
/** The ball of each foot on the plate's face, a little above its centre (the plate leans back 20°). */
const legs = bothLegs({ to: { from: 'footplate', cm: [-9, 3.76, -1.37] }, knee: [0, 1, 0.2], sole: [0, -0.342, -0.94], toes: [0, 0.94, -0.342], contact: 'flat', on: 'footplate' });
const props = { cable: { column: 'left', pulley: 'low', handle: 'close-grip-row-handle' } } as const;
const contacts = [{ part: 'pelvis', on: 'floor' }] as const;

/** Seated cable row (horizontal pull): pull the handle to the stomach, shoulder blades back. */
export const CABLE_SEATED_ROW: PoseFigureSpec = {
  kind: 'pose',
  id: 'cable-seated-row',
  name: { en: 'Seated Cable Row', zh: '坐姿绳索划船' },
  scene: { trainer: { pulleys: { left: 'low' }, footplate: true } },
  camera: { azimuthDeg: 75, elevationDeg: 10, distanceCm: 460, target: { from: 'footplate', cm: [0, 45, 70] } },
  frames: [
    {
      id: 'reach',
      label: { en: 'Reach', zh: '前伸' },
      cue: { en: 'Arms long, knees soft, chest tall', zh: '手臂伸直，膝盖微屈，挺胸' },
      trunk: trunk(12, 0),
      arms: bothArms(handle([-3.5, -22, -50], [-0.3, -0.6, 0.4])),
      legs,
      contacts,
      props,
      arrow: { track: 'hands', toward: 1, offsetCm: [0, 14, 0] },
    },
    {
      id: 'row',
      label: { en: 'Row', zh: '划船' },
      cue: { en: 'Pull the handle to your stomach, elbows back', zh: '把手拉向腹部，肘部向后' },
      trunk: trunk(-6, 0),
      arms: bothArms(handle([-3.5, -32, -20], [-0.3, -0.3, 1])),
      legs,
      contacts,
      props,
    },
    {
      id: 'return',
      label: { en: 'Return', zh: '还原' },
      cue: { en: 'Let the arms extend without rounding your back', zh: '手臂伸展还原，背部不要弓起' },
      trunk: trunk(4, 0),
      arms: bothArms(handle([-3.5, -28, -36], [-0.3, -0.5, 0.8])),
      legs,
      contacts,
      props,
      arrow: { track: 'hands', toward: 0, offsetCm: [0, 14, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/cable-triceps-pushdown.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Standing a step back from the left column, facing it (−z), so the body's left is world −x; rope on the high pulley. */
const trunk: TrunkPose = { hips: { from: 'cable.left.high', yFromFloor: true, bodyCm: [0, 94, 36] }, yawDeg: 180, pitchDeg: 10, head: { flexDeg: 5 } };
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [-12, 0, -12] }, knee: [-0.1, 0, -1], sole: [0, -1, 0], toes: [-0.1, 0, -1], contact: 'flat' });
/**
 * The rope runs through each fist across the forearm (upright with the forearms level, more front to back
 * as they lower). The axes point the same way in every frame, so in-between poses turn with the forearm.
 */
const rope = (to: [number, number, number], axis: [number, number, number]): ArmGoal => ({ to: { from: 'body.shoulder_l', bodyCm: to }, elbow: [-0.15, -0.3, 1], hand: { grip: 'bar', axis, palm: [1, 0, 0] } });
const props = { cable: { column: 'left', pulley: 'high', handle: 'rope' } } as const;

/** Rope triceps pushdown (elbow extension): elbows pinned at the sides, push the rope down and apart. */
export const CABLE_TRICEPS_PUSHDOWN: PoseFigureSpec = {
  kind: 'pose',
  id: 'cable-triceps-pushdown',
  name: { en: 'Rope Triceps Pushdown', zh: '绳索三头肌下压' },
  scene: { trainer: { pulleys: { left: 'high' } } },
  camera: { azimuthDeg: 110, elevationDeg: 6, distanceCm: 460, target: { from: 'cable.left.high', yFromFloor: true, cm: [0, 110, 20] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Elbows at your sides, forearms up', zh: '肘部贴在身体两侧，前臂抬起' },
      trunk,
      arms: bothArms(rope([13, -26, -24], [0, -0.98, 0.18])),
      legs,
      props,
      arrow: { track: 'hands', toward: 1, offsetCm: [22, 0, 0] },
    },
    {
      id: 'push',
      label: { en: 'Push down', zh: '下压' },
      cue: { en: 'Straighten the elbows and spread the rope ends', zh: '伸直肘部，将绳索两端向外分开' },
      trunk,
      arms: bothArms(rope([6, -57, -10], [0, -0.47, 0.88])),
      legs,
      props,
    },
    {
      id: 'return',
      label: { en: 'Return', zh: '还原' },
      cue: { en: 'Let the forearms rise without moving the elbows', zh: '前臂慢慢回到起始位置，肘部不动' },
      trunk,
      arms: bothArms(rope([11, -44, -22], [0, -0.84, 0.5])),
      legs,
      props,
      arrow: { track: 'hands', toward: 0, offsetCm: [22, 0, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/cable-pallof-press.ts`:**

```ts
import type { Side } from '../pose/hands';
import { type ArmGoal, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Standing side-on to the left column (it is on the body's left), facing the camera (+z); chest-height pulley. */
const trunk: TrunkPose = { hips: { from: 'cable.left.chest', yFromFloor: true, bodyCm: [-72, 93.5, 6] } };
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [16, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.12, 0, 1], contact: 'flat' });
/** Both hands on one upright handle: the left hand above the right, palms facing each other around it (and back toward the chest). */
const hands = (reachCm: number): Record<Side, ArmGoal> => ({
  l: { to: { from: 'body.chest', bodyCm: [1, 2, reachCm] }, elbow: [1, -0.3, -0.3], hand: { grip: 'bar', axis: [0, 1, 0], palm: [-1, 0, -1] } },
  r: { to: { from: 'body.chest', bodyCm: [1, -7, reachCm] }, elbow: [-1, -0.3, -0.3], hand: { grip: 'bar', axis: [0, 1, 0], palm: [1, 0, -1] } },
});
const props = { cable: { column: 'left', pulley: 'chest', handle: 'single-handle', hand: 'both' } } as const;

/** Pallof press (core anti-rotation): press the handle straight out and resist the pull toward the column. */
export const CABLE_PALLOF_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'cable-pallof-press',
  name: { en: 'Pallof Press', zh: '帕洛夫推' },
  scene: { trainer: { pulleys: { left: 'chest' } } },
  camera: { azimuthDeg: 50, elevationDeg: 8, distanceCm: 470, target: { from: 'cable.left.chest', yFromFloor: true, cm: [-40, 100, 10] } },
  unilateral: true,
  frames: [
    {
      id: 'set',
      label: { en: 'Set', zh: '准备' },
      cue: { en: 'Side-on to the column, handle at the chest, brace', zh: '侧对立柱，手柄贴近胸前，收紧核心' },
      trunk,
      arms: hands(30),
      legs,
      props,
      arrow: { track: 'hands', toward: 1, offsetCm: [0, 16, 0] },
    },
    {
      id: 'press',
      label: { en: 'Press out', zh: '推出' },
      cue: { en: 'Press straight out and keep the hips square', zh: '向正前方推出，髋部保持正对前方' },
      trunk,
      arms: hands(56),
      legs,
      props,
    },
    {
      id: 'return',
      label: { en: 'Return', zh: '收回' },
      cue: { en: 'Bring the handle back to the chest without turning', zh: '把手柄收回胸前，身体不要转动' },
      trunk,
      arms: hands(38),
      legs,
      props,
      arrow: { track: 'hands', toward: 0, offsetCm: [0, 16, 0] },
    },
  ],
};
```

**Edit `src/lib/figure/fixtures/index.ts`** (2 changes):

1. Replace

```ts
import { BARBELL_ROMANIAN_DEADLIFT } from './barbell-romanian-deadlift';
import { DB_CALF_RAISE } from './db-calf-raise';
```

   with

```ts
import { BARBELL_ROMANIAN_DEADLIFT } from './barbell-romanian-deadlift';
import { CABLE_PALLOF_PRESS } from './cable-pallof-press';
import { CABLE_SEATED_ROW } from './cable-seated-row';
import { CABLE_TRICEPS_PUSHDOWN } from './cable-triceps-pushdown';
import { DB_CALF_RAISE } from './db-calf-raise';
```

2. Replace

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART];

```

   with

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART, CABLE_SEATED_ROW, CABLE_TRICEPS_PUSHDOWN, CABLE_PALLOF_PRESS];

```


Notes on the numbers: bodies facing the column are turned 180° (`yawDeg: 180`), so the body's left is world −x — the left hand's offsets point toward +x for the midline, and `bothArms`/`bothLegs` mirror across it. The seated row places the hips from the footplate with body-scaled offsets, so the knees bend the same at every stature. The rope's axis in each fist crosses the forearm and points the same way in every frame. The seated row keeps the chest tall, as its cues say: the lean comes from the hips (`pitchDeg` 12 reaching, 4 at the finish) and the spine stays straight (`spine.flexDeg: 0`). The Pallof press keeps its elbows down and slightly out (poles `[±1, −0.3, −0.3]`) so both wrists stay within 30° on the single handle.

- [ ] **Step 5: Run the sweep and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: the coverage test passes; `figure-sweep.test.ts` 78 passed (13 figures × five statures, 150–200 cm, keyframes and in-between poses, plus a Play budget test per figure: at most 5 solver runs per in-between pose), with no errors and no warnings (the sweep fails on either); 0 lint and type errors. If a frame fails after an edit, the finding names the check, the part and the distance; adjust that frame's numbers (hips `bodyCm`, a limb target, an elbow or knee pole, a grip's `alongCm`) and rerun. A wrist finding usually means the forearm is not under the hand: move the elbow pole or widen the grip rather than turning the hand.

- [ ] **Step 6: Render and look**

Run: `npm run render:figures`, then `npm run dev -- --ignore-lock` and open `http://localhost:4321/ai_health/en/dev/figures/` and each new figure's page.
Expected: the new frames render (only the new figures render; the rest come from the cache); every pose reads as the exercise named and matches its cues, hands hold what they hold with straight wrists, held weights stay clear of the body, feet and body rest on what they declare, and the height picker keeps the pose valid at 150 and 200 cm.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/fixtures/cable-seated-row.ts src/lib/figure/fixtures/cable-triceps-pushdown.ts src/lib/figure/fixtures/cable-pallof-press.ts src/lib/figure/fixtures/index.ts src/lib/figure/fixtures/coverage.test.ts
git commit -m $'feat(figures): add the figures for cable station\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figures: cable station" \
  --body $'Adds the cable-seated-row, cable-triceps-pushdown, cable-pallof-press figures (spec §5.4 patterns; M3 representative set, controller decision 2).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the three cable figures pose cleanly at every stature with the handles in the hands and the cables to their pulleys.

---
### Task 12: Figures — hanging and kneeling

Four patterns that rest on something other than the feet: the pull-up (vertical pull: a bent-knee hang from the pull-up bar, `hanging: true` on every frame so the feet must clear the floor — spec §8.1 — and the head's height at the top is the ceiling envelope), the Nordic curl (knee flexion: kneeling on the roller hold-down's pad in its Nordic-curl use, shins declared on the pad, ankles under the roller, hands catching on the floor), the ab-wheel rollout (core anti-extension: kneeling, toes tucked, hands on the wheel's handles), and the half-kneeling hip flexor stretch (mobility, unilateral: right knee down, toes tucked).

**Files:**
- Create: `src/lib/figure/fixtures/pull-up.ts`, `src/lib/figure/fixtures/nordic-curl.ts`, `src/lib/figure/fixtures/ab-wheel-rollout.ts`, `src/lib/figure/fixtures/half-kneeling-hip-flexor-stretch.ts`
- Modify: `src/lib/figure/fixtures/index.ts`, `src/lib/figure/fixtures/coverage.test.ts`

**Interfaces:**
- Consumes: the pose library (Tasks 4–6: `PoseFigureSpec`, `bothArms`, `bothLegs`, `PointRef` anchors), scene builders (Task 3).
- Produces: figures `pull-up`, `nordic-curl`, `ab-wheel-rollout`, `half-kneeling-hip-flexor-stretch` in `FIGURES`, each posed cleanly by the sweep at 150–200 cm.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figures-hanging-kneeling
```

- [ ] **Step 2: Write the failing test** (the coverage table gains this task's patterns)

**Edit `src/lib/figure/fixtures/coverage.test.ts`** (3 changes):

1. Replace

```ts
  'horizontal-pull': 'cable-seated-row',
  squat: 'smith-squat',
```

   with

```ts
  'horizontal-pull': 'cable-seated-row',
  'vertical-pull': 'pull-up',
  squat: 'smith-squat',
```

2. Replace

```ts
  'hip-hinge': 'barbell-romanian-deadlift',
  calf: 'db-calf-raise',
```

   with

```ts
  'hip-hinge': 'barbell-romanian-deadlift',
  'knee-flexion': 'nordic-curl',
  calf: 'db-calf-raise',
```

3. Replace

```ts
  'rear-delt': 'band-pull-apart',
  'core-anti-rotation': 'cable-pallof-press',
} as const;
```

   with

```ts
  'rear-delt': 'band-pull-apart',
  'core-anti-extension': 'ab-wheel-rollout',
  'core-anti-rotation': 'cable-pallof-press',
  mobility: 'half-kneeling-hip-flexor-stretch',
} as const;
```


- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/fixtures/coverage.test.ts`
Expected: FAIL — the registry lacks `pull-up`, `nordic-curl`, `ab-wheel-rollout`, `half-kneeling-hip-flexor-stretch`.

- [ ] **Step 4: Add the figures**

**Create `src/lib/figure/fixtures/pull-up.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type LegGoal, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/**
 * Hanging from the pull-up bar, facing the rack (−z), so the body's left is world −x. Knees bent with the
 * feet behind: the bent-knee hang keeps the feet off the floor under a bar within reach (spec §8.1).
 */
const grip = (shrugDeg: number): ArmGoal => ({ to: { hold: 'pullup-bar', alongCm: -35 }, elbow: [-1, -0.4, 0.3], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] }, shrugDeg });
const legs: LegGoal = { to: { from: 'body.hips', bodyCm: [-9, -46, 34] }, knee: [0, -0.2, -1], sole: [0, 0.3, 1], toes: [0, -1, 0.3], contact: 'none' };
const trunk = (y: number, z: number, pitchDeg: number): TrunkPose => ({ hips: { from: 'pullup.bar', bodyCm: [0, y, z] }, yawDeg: 180, pitchDeg, head: { flexDeg: -8 } });

/** Pull-up (vertical pull): from a dead hang to the chin over the bar. */
export const PULL_UP: PoseFigureSpec = {
  kind: 'pose',
  id: 'pull-up',
  name: { en: 'Pull-Up', zh: '引体向上' },
  scene: { trainer: {} },
  camera: { azimuthDeg: 48, elevationDeg: 4, distanceCm: 560, target: { from: 'pullup.bar', cm: [0, -60, 10] } },
  frames: [
    {
      id: 'hang',
      label: { en: 'Hang', zh: '悬垂' },
      cue: { en: 'Hands wider than the shoulders, knees bent, body still', zh: '双手宽于肩，屈膝，身体保持稳定' },
      trunk: trunk(-106, 6, -2),
      arms: bothArms(grip(14)),
      legs: bothLegs(legs),
      hanging: true,
      arrow: { track: 'chest', toward: 1, offsetCm: [0, 0, 26] },
    },
    {
      id: 'top',
      label: { en: 'Pull up', zh: '上拉' },
      cue: { en: 'Pull the elbows down until the chin clears the bar', zh: '肘部向下拉，直到下巴超过横杆' },
      trunk: trunk(-58, 11, -10),
      arms: bothArms(grip(0)),
      legs: bothLegs(legs),
      hanging: true,
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower under control to straight arms', zh: '有控制地下放至手臂伸直' },
      trunk: trunk(-82, 8, -6),
      arms: bothArms(grip(6)),
      legs: bothLegs(legs),
      hanging: true,
      arrow: { track: 'chest', toward: 0, offsetCm: [0, 0, 26] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/nordic-curl.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/**
 * Kneeling on the roller hold-down's pad (its Nordic-curl use), facing away from the rack; ankles hooked
 * under the roller at the pad's back edge, feet hanging off it. The body leans forward from the knees.
 */
const lean = (deg: number): TrunkPose => {
  const a = (deg * Math.PI) / 180;
  return {
    hips: { from: 'hold-down.roller', cm: [0, -15, 0], bodyCm: [0, 5.2 + 43.4 * Math.cos(a), 44 + 43.4 * Math.sin(a)] },
    pitchDeg: deg,
    head: { flexDeg: -Math.min(deg, 40) / 2 },
  };
};
const legs = bothLegs({ to: { from: 'hold-down.roller', cm: [0, -15, 0], bodyCm: [9, 5.2, 0] }, knee: [0, -1, 0.2], sole: [0, -0.24, -0.97], toes: [0, -1, 0.25], contact: 'none' });
const ready: ArmGoal = { to: { from: 'body.shoulder_l', bodyCm: [-10, -13, 22] }, elbow: [0.6, -1, 0], hand: { grip: 'free', palm: [-1, -0.3, 0] } };
const catchFloor: ArmGoal = { to: { from: 'body.shoulder_l', yFromFloor: true, bodyCm: [4, 0, 12] }, elbow: [0.4, 0, -1], hand: { grip: 'flat', palm: [0, -1, 0], fingers: [0, 0, 1] } };
const contacts = [
  { part: 'shank_l', on: 'hold-down.pad' },
  { part: 'shank_r', on: 'hold-down.pad' },
] as const;

/** Nordic curl (knee flexion): lower the body forward from the knees as slowly as possible. */
export const NORDIC_CURL: PoseFigureSpec = {
  kind: 'pose',
  id: 'nordic-curl',
  name: { en: 'Nordic Curl', zh: '北欧腿弯举' },
  scene: { trainer: { holdDown: true } },
  camera: { azimuthDeg: -70, elevationDeg: 8, distanceCm: 540, target: { from: 'hold-down.pad', cm: [0, 25, 60] } },
  frames: [
    {
      id: 'kneel',
      label: { en: 'Kneel tall', zh: '跪直' },
      cue: { en: 'Ankles under the roller, hips straight', zh: '脚踝固定在滚轴下，髋部伸直' },
      trunk: lean(4),
      arms: bothArms(ready),
      legs,
      contacts,
      arrow: { track: 'head', toward: 1, offsetCm: [0, 10, 0] },
    },
    {
      id: 'lower',
      label: { en: 'Lower slowly', zh: '缓慢下放' },
      cue: { en: 'Lean forward from the knees as slowly as you can', zh: '以膝为轴尽量缓慢地前倾' },
      trunk: lean(40),
      arms: bothArms(ready),
      legs,
      contacts,
    },
    {
      id: 'catch',
      label: { en: 'Catch', zh: '撑地' },
      cue: { en: 'Catch yourself with your hands, then push back up', zh: '用双手撑住，再推回起始位置' },
      trunk: lean(80),
      arms: bothArms(catchFloor),
      legs,
      contacts,
      arrow: { track: 'head', toward: 0, offsetCm: [0, 10, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/ab-wheel-rollout.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type PoseFrame, type TrunkPose } from '../pose/poseSpec';

const grip = (palm: [number, number, number]): ArmGoal => ({ to: { hold: 'ab-wheel', alongCm: 1 }, elbow: [0.3, 0.2, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm } });
/** Kneeling, toes tucked under. */
const legs = bothLegs({ to: { from: 'floor', bodyCm: [11, 0, -44] }, knee: [0, -1, 0.3], sole: [0, -0.31, -0.95], toes: [0, -0.95, 0.31], contact: 'ball' });
const trunk = (hipsY: number, hipsZ: number, pitchDeg: number, flexDeg: number): TrunkPose => ({ hips: { bodyCm: [0, hipsY, hipsZ] }, pitchDeg, spine: { flexDeg }, head: { flexDeg: -10 } });
const frame = (f: Pick<PoseFrame, 'id' | 'label' | 'cue' | 'trunk' | 'arrow'> & { wheelZ: number; palm: [number, number, number] }): PoseFrame => ({
  id: f.id,
  label: f.label,
  cue: f.cue,
  trunk: f.trunk,
  arms: bothArms(grip(f.palm)),
  legs,
  contacts: [
    { part: 'shank_l', on: 'floor' },
    { part: 'shank_r', on: 'floor' },
  ],
  props: { abWheel: { from: 'body.shoulders', yFromFloor: true, cm: [0, 9, 0], bodyCm: [0, 0, f.wheelZ] } },
  ...(f.arrow && { arrow: f.arrow }),
});

/** Ab-wheel rollout (core anti-extension): from kneeling, roll out with a braced trunk and roll back. */
export const AB_WHEEL_ROLLOUT: PoseFigureSpec = {
  kind: 'pose',
  id: 'ab-wheel-rollout',
  name: { en: 'Ab Wheel Rollout', zh: '健腹轮前推' },
  scene: {},
  camera: { azimuthDeg: 78, elevationDeg: 14, distanceCm: 420, target: { bodyCm: [0, 35, 35] } },
  frames: [
    frame({
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Kneel with the wheel under your shoulders, brace the trunk', zh: '跪姿，健腹轮在肩膀下方，收紧核心' },
      trunk: trunk(48.1, 8, 62, 12),
      wheelZ: 22,
      palm: [0, -0.4, -1],
      arrow: { track: 'hands', toward: 1, offsetCm: [0, 22, 0] },
    }),
    frame({
      id: 'out',
      label: { en: 'Roll out', zh: '前推' },
      cue: { en: 'Roll forward as far as you can keep the lower back flat', zh: '在下背部保持平直的前提下尽量向前推' },
      trunk: trunk(36.5, 32, 84, 2),
      wheelZ: 47,
      palm: [0, -1, -0.1],
    }),
    frame({
      id: 'back',
      label: { en: 'Roll back', zh: '回拉' },
      cue: { en: 'Pull back with the abs, not the hips', zh: '用腹部发力回拉，不要用髋部' },
      trunk: trunk(44.6, 20, 72, 8),
      wheelZ: 36,
      palm: [0, -0.7, -0.6],
      arrow: { track: 'hands', toward: 0, offsetCm: [0, 22, 0] },
    }),
  ],
};
```

**Create `src/lib/figure/fixtures/half-kneeling-hip-flexor-stretch.ts`:**

```ts
import type { ArmGoal, LegGoal, PoseFigureSpec, TrunkPose } from '../pose/poseSpec';

const front: LegGoal = { to: { bodyCm: [11, 0, 52] }, knee: [0.1, 0.2, 1], sole: [0, -1, 0], toes: [0.08, 0, 1], contact: 'flat' };
/** Rear knee down, toes tucked under. */
const rear: LegGoal = { to: { from: 'body.hips', yFromFloor: true, bodyCm: [-11, 0, -52] }, knee: [0, -1, 0.3], sole: [0, -0.31, -0.95], toes: [0, -0.95, 0.31], contact: 'ball' };
const onHips = (side: 'l' | 'r'): ArmGoal => ({
  to: { from: `body.shoulder_${side}`, bodyCm: [side === 'l' ? -3 : 3, -36, 4] },
  elbow: [side === 'l' ? 1 : -1, 0, -0.5],
  hand: { grip: 'free', palm: [side === 'l' ? -1 : 1, 0, 0] },
});
const trunk = (hipsY: number, hipsZ: number, extra: Partial<TrunkPose> = {}): TrunkPose => ({ hips: { bodyCm: [0, hipsY, hipsZ] }, pitchDeg: -3, ...extra });

/** Half-kneeling hip flexor stretch (mobility): right knee down; shift forward to stretch the front of the right hip. */
export const HALF_KNEELING_HIP_FLEXOR_STRETCH: PoseFigureSpec = {
  kind: 'pose',
  id: 'half-kneeling-hip-flexor-stretch',
  name: { en: 'Half-Kneeling Hip Flexor Stretch', zh: '半跪髋屈肌拉伸' },
  scene: {},
  camera: { azimuthDeg: 78, elevationDeg: 8, distanceCm: 440, target: { bodyCm: [0, 72, 5] } },
  unilateral: true,
  frames: [
    {
      id: 'set',
      label: { en: 'Set up', zh: '准备' },
      cue: { en: 'Back knee under the hip, front foot flat, torso tall', zh: '后膝在髋部正下方，前脚踩实，上身挺直' },
      trunk: trunk(48.2, 0),
      arms: { l: onHips('l'), r: onHips('r') },
      legs: { l: front, r: rear },
      contacts: [{ part: 'shank_r', on: 'floor' }],
      arrow: { track: 'hips', toward: 1, offsetCm: [28, 0, 0] },
    },
    {
      id: 'shift',
      label: { en: 'Shift forward', zh: '重心前移' },
      cue: { en: 'Tuck the pelvis and shift forward until you feel the stretch', zh: '骨盆后倾，重心前移，直到感到拉伸' },
      trunk: trunk(47.6, 3, { pitchDeg: -4, spine: { flexDeg: 4 } }),
      arms: { l: onHips('l'), r: onHips('r') },
      legs: { l: front, r: { ...rear, to: { ...rear.to, bodyCm: [-11, 0, -54] } } },
      contacts: [{ part: 'shank_r', on: 'floor' }],
    },
    {
      id: 'reach',
      label: { en: 'Reach', zh: '上举' },
      cue: { en: 'Reach the right arm up and slightly left', zh: '右臂向上并略向左伸展' },
      trunk: trunk(47.6, 3, { pitchDeg: -4, spine: { flexDeg: 4, sideDeg: 8 } }),
      arms: { l: onHips('l'), r: { to: { from: 'body.shoulder_r', bodyCm: [8, 56, 2] }, elbow: [-1, 0, -0.3], hand: { grip: 'free', palm: [1, 0, 0] }, shrugDeg: 10 } },
      legs: { l: front, r: { ...rear, to: { ...rear.to, bodyCm: [-11, 0, -54] } } },
      contacts: [{ part: 'shank_r', on: 'floor' }],
      arrow: { track: 'hips', toward: 0, offsetCm: [28, 0, 0] },
    },
  ],
};
```

**Edit `src/lib/figure/fixtures/index.ts`** (3 changes):

1. Replace

```ts
import type { PoseFigureSpec } from '../pose/poseSpec';
import { BAND_PULL_APART } from './band-pull-apart';
```

   with

```ts
import type { PoseFigureSpec } from '../pose/poseSpec';
import { AB_WHEEL_ROLLOUT } from './ab-wheel-rollout';
import { BAND_PULL_APART } from './band-pull-apart';
```

2. Replace

```ts
import { DB_SPLIT_SQUAT } from './db-split-squat';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

   with

```ts
import { DB_SPLIT_SQUAT } from './db-split-squat';
import { HALF_KNEELING_HIP_FLEXOR_STRETCH } from './half-kneeling-hip-flexor-stretch';
import { NORDIC_CURL } from './nordic-curl';
import { PULL_UP } from './pull-up';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

3. Replace

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART, CABLE_SEATED_ROW, CABLE_TRICEPS_PUSHDOWN, CABLE_PALLOF_PRESS];

```

   with

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART, CABLE_SEATED_ROW, CABLE_TRICEPS_PUSHDOWN, CABLE_PALLOF_PRESS, PULL_UP, NORDIC_CURL, AB_WHEEL_ROLLOUT, HALF_KNEELING_HIP_FLEXOR_STRETCH];

```


Notes on the numbers: hanging and kneeling bodies are placed from the thing they rest on (`pullup.bar`, `hold-down.roller`, the floor), so the pose scales about it. In-between poses settle back onto the first declared contact, so the knees stay on the pad and the floor while the body swings (controller decision 6). The Nordic catch reaches the floor at every stature because the hands are placed from the shoulders' floor projection, a little in front of them so the wrists bend less than 85°. The hip flexor stretch tucks the pelvis, as its cue says: the trunk tilts back a little (`pitchDeg: −4`) and the spine curves forward by the same amount (`spine.flexDeg: 4`), so the chest stays upright and the rear hip extends.

- [ ] **Step 5: Run the sweep and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: the coverage test passes; `figure-sweep.test.ts` 102 passed (17 figures × five statures, 150–200 cm, keyframes and in-between poses, plus a Play budget test per figure: at most 5 solver runs per in-between pose), with no errors and no warnings (the sweep fails on either); 0 lint and type errors. If a frame fails after an edit, the finding names the check, the part and the distance; adjust that frame's numbers (hips `bodyCm`, a limb target, an elbow or knee pole, a grip's `alongCm`) and rerun. A wrist finding usually means the forearm is not under the hand: move the elbow pole or widen the grip rather than turning the hand.

- [ ] **Step 6: Render and look**

Run: `npm run render:figures`, then `npm run dev -- --ignore-lock` and open `http://localhost:4321/ai_health/en/dev/figures/` and each new figure's page.
Expected: the new frames render (only the new figures render; the rest come from the cache); every pose reads as the exercise named and matches its cues, hands hold what they hold with straight wrists, held weights stay clear of the body, feet and body rest on what they declare, and the height picker keeps the pose valid at 150 and 200 cm.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/fixtures/pull-up.ts src/lib/figure/fixtures/nordic-curl.ts src/lib/figure/fixtures/ab-wheel-rollout.ts src/lib/figure/fixtures/half-kneeling-hip-flexor-stretch.ts src/lib/figure/fixtures/index.ts src/lib/figure/fixtures/coverage.test.ts
git commit -m $'feat(figures): add the figures for hanging and kneeling\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figures: hanging and kneeling" \
  --body $'Adds the pull-up, nordic-curl, ab-wheel-rollout, half-kneeling-hip-flexor-stretch figures (spec §5.4 patterns; M3 representative set, controller decision 2).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the four figures pose cleanly at every stature; hanging frames keep the feet off the floor, and kneeling frames keep the knees on their surface through every in-between pose.

---
### Task 13: Figures — floor and ball

The last three patterns, and the coverage test in its final form: the glute bridge (hip extension: shoulders on the floor, hips driven up, the chin tucked about 22° so the head stays on the floor), the side plank (core lateral, unilateral: on the left forearm, which lies along the floor — `along: true` — the top hand resting on the hip, then reaching up), and the exercise-ball crunch (core flexion: the lower back on the ball, a sphere surface, placed from the ball's top so the contact holds at every stature).

**Files:**
- Create: `src/lib/figure/fixtures/glute-bridge.ts`, `src/lib/figure/fixtures/side-plank.ts`, `src/lib/figure/fixtures/ball-crunch.ts`
- Modify: `src/lib/figure/fixtures/index.ts`, `src/lib/figure/fixtures/coverage.test.ts`

**Interfaces:**
- Consumes: the pose library (Tasks 4–6: `PoseFigureSpec`, `bothArms`, `bothLegs`, `PointRef` anchors), scene builders (Task 3).
- Produces: figures `glute-bridge`, `side-plank`, `ball-crunch` in `FIGURES`, each posed cleanly by the sweep at 150–200 cm.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-figures-floor
```

- [ ] **Step 2: Write the failing test** (the coverage table gains this task's patterns)

**Edit `src/lib/figure/fixtures/coverage.test.ts`** (5 changes):

1. Replace

```ts
import { CARDIO_PATTERNS, PATTERNS } from '../../content/vocab';

```

   with

```ts
import { CARDIO_PATTERNS, PATTERNS } from '../../content/vocab';
import { figureMeta } from '../figures';

```

2. Replace

```ts
 * M3 poses one representative figure per movement pattern (spec §5.4) except the two cardio patterns,
 * whose machine sessions may omit figures (§5.3). M5 adds the rest of the v1 exercises. Each figure
 * task adds its rows here.
 */
```

   with

```ts
 * M3 poses one representative figure per movement pattern (spec §5.4) except the two cardio patterns,
 * whose machine sessions may omit figures (§5.3). M5 adds the rest of the v1 exercises.
 */
```

3. Replace

```ts
  'hip-hinge': 'barbell-romanian-deadlift',
  'knee-flexion': 'nordic-curl',
```

   with

```ts
  'hip-hinge': 'barbell-romanian-deadlift',
  'hip-extension': 'glute-bridge',
  'knee-flexion': 'nordic-curl',
```

4. Replace

```ts
  'core-anti-rotation': 'cable-pallof-press',
  mobility: 'half-kneeling-hip-flexor-stretch',
```

   with

```ts
  'core-anti-rotation': 'cable-pallof-press',
  'core-flexion': 'ball-crunch',
  'core-lateral': 'side-plank',
  mobility: 'half-kneeling-hip-flexor-stretch',
```

5. Replace

```ts
describe('M3 figure coverage', () => {
  it('has a figure for every pattern posed so far, and no others', () => {
    expect(Object.keys(FIGURES).sort()).toEqual(Object.values(BY_PATTERN).sort());
  });
  it('uses only the non-cardio patterns of the content vocabulary', () => {
    const nonCardio = PATTERNS.filter((p) => !CARDIO_PATTERNS.includes(p));
    for (const p of Object.keys(BY_PATTERN)) expect(nonCardio, p).toContain(p);
  });
```

   with

```ts
describe('M3 figure coverage', () => {
  it('has a figure for every non-cardio movement pattern, and no others', () => {
    expect(Object.keys(FIGURES).sort()).toEqual(Object.values(BY_PATTERN).sort());
  });
  it('covers exactly the non-cardio patterns of the content vocabulary', () => {
    const nonCardio = PATTERNS.filter((p) => !CARDIO_PATTERNS.includes(p));
    expect(Object.keys(BY_PATTERN).sort()).toEqual([...nonCardio].sort());
  });
  it('marks the one-side-at-a-time figures unilateral', () => {
    const unilateral = Object.values(FIGURES).filter((f) => figureMeta(f).unilateral).map((f) => f.id).sort();
    expect(unilateral).toEqual(['cable-pallof-press', 'db-split-squat', 'half-kneeling-hip-flexor-stretch', 'side-plank']);
  });
```


- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/figure/fixtures/coverage.test.ts`
Expected: FAIL — the registry lacks `glute-bridge`, `side-plank`, `ball-crunch`.

- [ ] **Step 4: Add the figures**

**Create `src/lib/figure/fixtures/glute-bridge.ts`:**

```ts
import { type ArmGoal, bothArms, bothLegs, type LegGoal, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Lying on the back, head toward −z; hands flat beside the hips, feet flat near the buttocks. */
const hands: ArmGoal = { to: { from: 'body.shoulder_l', yFromFloor: true, bodyCm: [9, 0, 46] }, elbow: [0.3, 1, 0], hand: { grip: 'flat', palm: [0, -1, 0], fingers: [0.1, 0, 1] } };
const feet: LegGoal = { to: { from: 'floor', bodyCm: [13, 0, 60] }, knee: [0.1, 1, 0.3], sole: [0, -1, 0], toes: [0.1, 0, 1], contact: 'flat' };
const trunk = (hipsY: number, hipsZ: number, pitchDeg: number, headFlexDeg: number): TrunkPose => ({ hips: { bodyCm: [0, hipsY, hipsZ] }, pitchDeg, head: { flexDeg: headFlexDeg } });

/** Glute bridge (hip extension): feet flat, drive the hips up until knees, hips and shoulders line up. */
export const GLUTE_BRIDGE: PoseFigureSpec = {
  kind: 'pose',
  id: 'glute-bridge',
  name: { en: 'Glute Bridge', zh: '臀桥' },
  scene: {},
  camera: { azimuthDeg: 70, elevationDeg: 16, distanceCm: 430, target: { bodyCm: [0, 22, -8] } },
  frames: [
    {
      id: 'set',
      label: { en: 'Set up', zh: '准备' },
      cue: { en: 'Feet flat, knees bent, arms by your sides', zh: '双脚踩实，屈膝，手臂放在身体两侧' },
      trunk: trunk(9.9, 0, -90, -6),
      arms: bothArms(hands),
      legs: bothLegs(feet),
      contacts: [
        { part: 'pelvis', on: 'floor' },
        { part: 'chest', on: 'floor' },
      ],
      arrow: { track: 'hips', toward: 1, offsetCm: [30, 0, 0] },
    },
    {
      id: 'bridge',
      label: { en: 'Bridge', zh: '顶髋' },
      cue: { en: 'Squeeze the glutes and lift the hips in line with the knees', zh: '收紧臀部，抬髋至与膝盖成一直线' },
      trunk: trunk(22.54, -3, -108, 22),
      arms: bothArms(hands),
      legs: bothLegs(feet),
      contacts: [{ part: 'chest', on: 'floor' }],
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower slowly without arching the lower back', zh: '慢慢下放，下背部不要拱起' },
      trunk: trunk(19.4, -1, -104, 8),
      arms: bothArms(hands),
      legs: bothLegs(feet),
      contacts: [{ part: 'chest', on: 'floor' }],
      arrow: { track: 'hips', toward: 0, offsetCm: [30, 0, 0] },
    },
  ],
};
```

**Create `src/lib/figure/fixtures/side-plank.ts`:**

```ts
import type { ArmGoal, LegGoal, PoseFigureSpec, TrunkPose } from '../pose/poseSpec';

/**
 * Lying on the left side, facing +z, head toward +x; propped on the left forearm, feet staggered on the
 * floor (right foot in front). Written for this orientation, so both sides are spelled out.
 */
/** The forearm lies on the floor pointing forward, the fist resting on its side. */
const support: ArmGoal = { to: { from: 'body.shoulder_l', yFromFloor: true, bodyCm: [2, 3.2, 26] }, elbow: [0, -1, 0.2], hand: { grip: 'free', palm: [1, 0, 0] } };
const topArm = (to: [number, number, number], palm: [number, number, number] = [0, -1, 0]): ArmGoal => ({ to: { from: 'body.shoulder_r', bodyCm: to }, elbow: [0, 0, -1], hand: { grip: 'free', palm } });
/** Ankle heights: the legs lie on the floor in the set-up and rest on the feet once the hips lift. */
const legs = (yl: number, yr: number): Record<'l' | 'r', LegGoal> => ({
  l: { to: { from: 'body.hips', yFromFloor: true, bodyCm: [-80, yl, -5] }, knee: [0, 0.2, 1], sole: [-1, 0, 0], toes: [0, 0, 1], contact: 'none' },
  r: { to: { from: 'body.hips', yFromFloor: true, bodyCm: [-77, yr, 13] }, knee: [0, 0.2, 1], sole: [-1, 0, 0], toes: [0, 0, 1], contact: 'none' },
});
const trunk = (hipsY: number, rollDeg: number): TrunkPose => ({ hips: { bodyCm: [0, hipsY, 0] }, rollDeg, head: { turnDeg: 0 } });

/** Side plank (core lateral): propped on the forearm, hips lifted in line with the shoulders and feet. */
export const SIDE_PLANK: PoseFigureSpec = {
  kind: 'pose',
  id: 'side-plank',
  name: { en: 'Side Plank', zh: '侧平板支撑' },
  scene: {},
  camera: { azimuthDeg: 8, elevationDeg: 14, distanceCm: 420, target: { bodyCm: [0, 30, 0] } },
  unilateral: true,
  frames: [
    {
      id: 'set',
      label: { en: 'Set up', zh: '准备' },
      cue: { en: 'Elbow under the shoulder, feet staggered', zh: '肘部在肩膀正下方，双脚前后错开' },
      trunk: trunk(19.28, 58),
      arms: { l: support, r: topArm([-35, -25, 4]) },
      legs: legs(5.5, 5.5),
      contacts: [
        { part: 'pelvis', on: 'floor' },
        { part: 'forearm_l', on: 'floor', along: true },
      ],
      arrow: { track: 'hips', toward: 1, offsetCm: [0, 0, 28] },
    },
    {
      id: 'lift',
      label: { en: 'Lift', zh: '抬髋' },
      cue: { en: 'Lift the hips until the body is straight', zh: '抬起髋部，使身体成一直线' },
      trunk: trunk(34.84, 76),
      arms: { l: support, r: topArm([-43, -13, 4]) },
      legs: legs(3, 2.6),
      contacts: [
        { part: 'forearm_l', on: 'floor', along: true },
        { part: 'foot_l', on: 'floor' },
        { part: 'foot_r', on: 'floor' },
      ],
    },
    {
      id: 'hold',
      label: { en: 'Hold', zh: '保持' },
      cue: { en: 'Hold the line; reach the top arm up', zh: '保持身体成直线，上方手臂向上伸' },
      trunk: trunk(34.84, 76),
      arms: { l: support, r: topArm([0, 56, 4], [0, 0, 1]) },
      legs: legs(3, 2.6),
      contacts: [
        { part: 'forearm_l', on: 'floor', along: true },
        { part: 'foot_l', on: 'floor' },
        { part: 'foot_r', on: 'floor' },
      ],
    },
  ],
};
```

**Create `src/lib/figure/fixtures/ball-crunch.ts`:**

```ts
import { bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Lying back over the exercise ball (lower back on it), head toward −z, feet flat on the floor in front. */
const trunk = (hipsY: number, pitchDeg: number, flexDeg: number): TrunkPose => ({ hips: { from: 'exercise-ball.top', bodyCm: [0, hipsY, 34] }, pitchDeg, spine: { flexDeg }, head: { flexDeg: 10 } });
/** Arms crossed on the chest. */
const arms = bothArms({ to: { from: 'body.chest', bodyCm: [-6, 10, 2] }, elbow: [0.6, 0.4, 0.5], hand: { grip: 'free', palm: [0, -1, 0] } });
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [17, 0, 52] }, knee: [0.2, 1, 0.3], sole: [0, -1, 0], toes: [0.15, 0, 1], contact: 'flat' });
const contacts = [{ part: 'abdomen', on: 'exercise-ball' }] as const;

/** Exercise-ball crunch (core flexion): curl the ribs toward the hips over the ball, then lower back over it. */
export const BALL_CRUNCH: PoseFigureSpec = {
  kind: 'pose',
  id: 'ball-crunch',
  name: { en: 'Exercise Ball Crunch', zh: '瑞士球卷腹' },
  scene: { items: [{ model: 'exercise-ball', at: [0, 0, 0] }] },
  camera: { azimuthDeg: 80, elevationDeg: 12, distanceCm: 380, target: { from: 'exercise-ball.center', cm: [0, 20, 20] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Lower back on the ball, feet wide, arms crossed', zh: '下背部贴在球上，双脚分开，双臂交叉于胸前' },
      trunk: trunk(-0.64, -68, -4),
      arms,
      legs,
      contacts,
      arrow: { track: 'chest', toward: 1, offsetCm: [0, 16, 0] },
    },
    {
      id: 'crunch',
      label: { en: 'Crunch', zh: '卷腹' },
      cue: { en: 'Curl the ribs toward the hips; the lower back stays on the ball', zh: '肋骨向髋部卷起，下背部保持贴球' },
      trunk: trunk(-4.43, -60, 30),
      arms,
      legs,
      contacts,
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Uncurl slowly back over the ball', zh: '慢慢展开，回到球面上' },
      trunk: trunk(-1.84, -66, 10),
      arms,
      legs,
      contacts,
      arrow: { track: 'chest', toward: 0, offsetCm: [0, 16, 0] },
    },
  ],
};
```

**Edit `src/lib/figure/fixtures/index.ts`** (4 changes):

1. Replace

```ts
import { AB_WHEEL_ROLLOUT } from './ab-wheel-rollout';
import { BAND_PULL_APART } from './band-pull-apart';
```

   with

```ts
import { AB_WHEEL_ROLLOUT } from './ab-wheel-rollout';
import { BALL_CRUNCH } from './ball-crunch';
import { BAND_PULL_APART } from './band-pull-apart';
```

2. Replace

```ts
import { DB_SPLIT_SQUAT } from './db-split-squat';
import { HALF_KNEELING_HIP_FLEXOR_STRETCH } from './half-kneeling-hip-flexor-stretch';
```

   with

```ts
import { DB_SPLIT_SQUAT } from './db-split-squat';
import { GLUTE_BRIDGE } from './glute-bridge';
import { HALF_KNEELING_HIP_FLEXOR_STRETCH } from './half-kneeling-hip-flexor-stretch';
```

3. Replace

```ts
import { PULL_UP } from './pull-up';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

   with

```ts
import { PULL_UP } from './pull-up';
import { SIDE_PLANK } from './side-plank';
import { SMITH_BENCH_PRESS } from './smith-bench-press';
```

4. Replace

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART, CABLE_SEATED_ROW, CABLE_TRICEPS_PUSHDOWN, CABLE_PALLOF_PRESS, PULL_UP, NORDIC_CURL, AB_WHEEL_ROLLOUT, HALF_KNEELING_HIP_FLEXOR_STRETCH];

```

   with

```ts
/** Generalized pose specs, one per exercise figure (see docs/figure-pipeline.md). */
export const POSE_SPECS: readonly PoseFigureSpec[] = [DB_CURL, SMITH_BENCH_PRESS, DB_INCLINE_PRESS, DB_SHOULDER_PRESS, DB_LATERAL_RAISE, DB_CALF_RAISE, DB_SPLIT_SQUAT, BARBELL_ROMANIAN_DEADLIFT, BAND_PULL_APART, CABLE_SEATED_ROW, CABLE_TRICEPS_PUSHDOWN, CABLE_PALLOF_PRESS, PULL_UP, NORDIC_CURL, AB_WHEEL_ROLLOUT, HALF_KNEELING_HIP_FLEXOR_STRETCH, GLUTE_BRIDGE, SIDE_PLANK, BALL_CRUNCH];

```


Notes on the numbers: a part lying along a surface (`along`) must touch at both ends, which fixes the forearm flat in the side plank; the side plank is written for its orientation (lying on the left side facing +z), so both arms and legs are spelled out instead of mirrored.

- [ ] **Step 5: Run the sweep and the checks**

Run: `npx vitest run src/lib/figure tests/assets && npm run lint && npm run check`
Expected: the coverage test passes; `figure-sweep.test.ts` 120 passed (20 figures × five statures, 150–200 cm, keyframes and in-between poses, plus a Play budget test per figure: at most 5 solver runs per in-between pose), with no errors and no warnings (the sweep fails on either); 0 lint and type errors. If a frame fails after an edit, the finding names the check, the part and the distance; adjust that frame's numbers (hips `bodyCm`, a limb target, an elbow or knee pole, a grip's `alongCm`) and rerun. A wrist finding usually means the forearm is not under the hand: move the elbow pole or widen the grip rather than turning the hand.

- [ ] **Step 6: Render and look**

Run: `npm run render:figures`, then `npm run dev -- --ignore-lock` and open `http://localhost:4321/ai_health/en/dev/figures/` and each new figure's page.
Expected: the new frames render (only the new figures render; the rest come from the cache); every pose reads as the exercise named and matches its cues, hands hold what they hold with straight wrists, held weights stay clear of the body, feet and body rest on what they declare, and the height picker keeps the pose valid at 150 and 200 cm.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/figure/fixtures/glute-bridge.ts src/lib/figure/fixtures/side-plank.ts src/lib/figure/fixtures/ball-crunch.ts src/lib/figure/fixtures/index.ts src/lib/figure/fixtures/coverage.test.ts
git commit -m $'feat(figures): add the figures for floor and ball\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figures: floor and ball" \
  --body $'Adds the glute-bridge, side-plank, ball-crunch figures (spec §5.4 patterns; M3 representative set, controller decision 2).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the coverage test confirms one figure per non-cardio movement pattern (20), the four unilateral figures are marked, and the whole sweep is green.

---
### Task 14: Engine probes from the pose library; 3D model checks

Closes #74. The engine's geometry check (spec §7.1 check 4) poses an exercise's figure with a probe; M2 had one, for the Smith squat. `figureProbe` turns any library figure into a probe: it poses every frame at the stature on the typical equipment, with the pull-up bar at the height the engine resolved (the user's measurement, else the typical value), and reports the envelope (head, body and held implements), the Smith bar heights for figures that move it, and the error findings (ROM separately; bar travel and ceiling are left to the engine, which checks them against the profile's or the typical values). `DEFAULT_PROBES` covers the whole library, so overhead work is measured from the posed figure instead of a stature ratio; the estimates remain for exercises without a figure (controller decision 11). The catalog checks `model3d` against `EQUIPMENT_MODELS`, and that the typical values a model draws match the content's `illustrativeDefaults` (controller decisions 8 and 12); the existing content files get their `model3d`.

The M2 synthetic fixture `db-shoulder-press` stands for a *standing* overhead press in the engine's ceiling tests; with the library's seated press as its probe its envelope would drop by about 60 cm and those tests would no longer test the ceiling. It is pointed at a figure id the library does not have, so it keeps using the stature envelope; the seated press is tested on its own.

**Files:**
- Replace: `src/lib/engine/probes.ts`, `src/lib/engine/probes.test.ts`
- Modify: `src/lib/engine/geometry.ts`, `src/lib/engine/testing/fixtures.ts`, `src/lib/content/catalog.ts`, `src/lib/content/catalog.test.ts`, `src/lib/content/schemas.ts`, `src/content/equipment/{smith-functional-trainer,adjustable-bench,dumbbells}.yaml`, `src/content/attachments/*.yaml` (7), `docs/architecture.md`

**Interfaces:**
- Consumes: Task 6 `FIGURES`, `FigureModel`; Task 3 `EQUIPMENT_MODELS`, `EquipmentModel`, `sceneParamsWith`, `ILLUSTRATIVE_TRAINER`; M2 `GeometryProbe`, `ProbeRegistry`, `checkGeometry`, `numberParam`, `ENGINE_CHECKED`.
- Produces: `ProbeInput { statureCm; pullUpBarHeightCm?: number }`, `figureProbe(sk, figure): GeometryProbe`, `DEFAULT_PROBES` keyed by every figure id (`smithSquatProbe` is kept and matches `DEFAULT_PROBES['smith-squat']`); `CatalogOptions.models`; catalog problems `unknown 3D model "<id>"` and `illustrative default "<name>" is <a> but the 3D model draws <b>`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-engine-probes
```

- [ ] **Step 2: Write the failing tests**

**Replace `src/lib/engine/probes.test.ts` with:**

```ts
import { describe, expect, it } from 'vitest';
import { SMITH_SQUAT } from '../figure/fixtures/smith-squat';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
import { checkFigureFrame } from '../figure/pose/checkFigureFrame';
import { syntheticSkeleton } from '../figure/pose/synthetic';
import type { Profile } from '../profile/schema';
import { checkGeometry } from './geometry';
import { FIGURES } from '../figure/fixtures';
import { REAL_SKELETON } from '../figure/pose/realSkeleton';
import { DEFAULT_PROBES, figureProbe, smithSquatProbe } from './probes';
import { EIGHT_FT_CEILING_CM, fullHomeGym, nothingMeasured, syntheticCatalog } from './testing/fixtures';

const STATURES = [150, 165, 175, 190, 200];

describe('smithSquatProbe', () => {
  const probes = { real: DEFAULT_PROBES['smith-squat']!, synthetic: smithSquatProbe(syntheticSkeleton({ randomRestSeed: 5 }), SMITH_SQUAT) };

  for (const [skeleton, probe] of Object.entries(probes)) {
    it.each(STATURES)(`${skeleton} skeleton: poses all three frames cleanly at %i cm`, (statureCm) => {
      const r = probe({ statureCm });
      expect(r.rom).toEqual([]);
      expect(r.posing).toEqual([]);
      expect(r.barCentersCm).toHaveLength(3);
      // The head is the highest point; plates never rise above it in a back squat.
      expect(r.topCm).toBeGreaterThan(statureCm * 0.95);
      expect(r.topCm).toBeLessThan(statureCm + 5);
    });
  }

  it('lowers the bar at the bottom frame and scales with stature', () => {
    const short = probes.real({ statureCm: 150 }).barCentersCm!;
    const tall = probes.real({ statureCm: 200 }).barCentersCm!;
    expect(short[1]!).toBeLessThan(short[0]!);
    expect(tall[0]!).toBeGreaterThan(short[0]!);
    expect(tall[1]!).toBeGreaterThan(short[1]!);
  });

  it('reports bar-centre heights, the datum of the stops and SmithParams', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    const r = smithSquatProbe(sk, SMITH_SQUAT)({ statureCm: 175 });
    SMITH_SQUAT.frames.forEach((frame, i) => {
      const { solution } = checkFigureFrame(sk, SMITH_SQUAT, frame, { statureCm: 175, smith: ILLUSTRATIVE_SMITH });
      expect(r.barCentersCm![i]).toBeCloseTo(solution.barCenter[1], 6);
    });
  });

  it('passes the pose layer ROM findings through, per frame', () => {
    const narrow = { ...SMITH_SQUAT, grip: { ...SMITH_SQUAT.grip, halfWidthCm: 20 } };
    const r = smithSquatProbe(syntheticSkeleton(), narrow)({ statureCm: 190 });
    expect(r.rom.some((m) => m.startsWith('unrack: elbowFlex_'))).toBe(true);
    expect(r.posing).toEqual([]);
  });

  it('throws when a frame cannot be solved', () => {
    const far = { ...SMITH_SQUAT, stance: { ...SMITH_SQUAT.stance, forwardOfRailCm: 150 } };
    expect(() => smithSquatProbe(syntheticSkeleton(), far)({ statureCm: 175 })).toThrow(/no trunk angle/);
  });
});

describe('checkGeometry with the default probes', () => {
  const catalog = syntheticCatalog();
  const squat = catalog.exercises.get('smith-squat')!;
  const withLowest = (cm: number): Profile => {
    const p = fullHomeGym();
    return { ...p, equipment: p.equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { ...e.params, smithLowestBarHeightCm: cm } } : e)) };
  };

  it('passes the Smith squat for a synthetic user with height and ceiling entered', () => {
    expect(checkGeometry(squat, fullHomeGym(), catalog, DEFAULT_PROBES)).toEqual({ reasons: [], notes: [] });
  });
  it('passes it at a typical height on the typical machine (D12)', () => {
    expect(checkGeometry(squat, nothingMeasured(), catalog, DEFAULT_PROBES)).toEqual({ reasons: [], notes: [] });
  });
  it('fails it when the lowest stop is above the bottom of the squat', () => {
    const o = checkGeometry(squat, withLowest(130), catalog, DEFAULT_PROBES);
    expect(o.reasons.map((r) => r.message.key)).toEqual(['engine.reason.barBelowStop']);
  });
});

describe('figureProbe (the pose library, issue #74)', () => {
  it('covers every figure in the library', () => {
    expect(Object.keys(DEFAULT_PROBES).sort()).toEqual(Object.keys(FIGURES).sort());
  });

  it('reports the same Smith squat as the M1 probe', () => {
    for (const statureCm of STATURES) {
      const a = DEFAULT_PROBES['smith-squat']!({ statureCm });
      const b = smithSquatProbe(REAL_SKELETON, SMITH_SQUAT)({ statureCm });
      expect(a.topCm).toBeCloseTo(b.topCm, 6);
      a.barCentersCm!.forEach((y, i) => expect(y).toBeCloseTo(b.barCentersCm![i]!, 6));
      expect([a.rom, a.posing]).toEqual([b.rom, b.posing]);
    }
  });

  it('poses every library figure cleanly at every sweep stature', () => {
    for (const [id, probe] of Object.entries(DEFAULT_PROBES)) {
      for (const statureCm of STATURES) expect(probe({ statureCm }), `${id} ${statureCm}`).toMatchObject({ rom: [], posing: [] });
    }
  });

  it('measures overhead work from the posed figure, not a stature ratio', () => {
    const seated = DEFAULT_PROBES['db-shoulder-press']!({ statureCm: 175 });
    expect(seated.topCm).toBeGreaterThan(150);
    expect(seated.topCm).toBeLessThan(1.33 * 175 - 40);
    expect(seated.barCentersCm).toBeUndefined();
  });

  it('hangs the pull-up from the pull-up bar height it is given', () => {
    const typical = DEFAULT_PROBES['pull-up']!({ statureCm: 175 });
    const higher = DEFAULT_PROBES['pull-up']!({ statureCm: 175, pullUpBarHeightCm: 225 });
    expect(higher.topCm - typical.topCm).toBeCloseTo(15, 0);
    // A bar too low for a hang puts the feet on the floor: the pose fails.
    expect(DEFAULT_PROBES['pull-up']!({ statureCm: 200, pullUpBarHeightCm: 160 }).posing.join()).toMatch(/hanging/);
  });

  it('reports the Smith bar heights of figures that move it', () => {
    expect(DEFAULT_PROBES['smith-bench-press']!({ statureCm: 175 }).barCentersCm).toHaveLength(3);
  });

  it('throws on a figure that cannot be posed, which the engine reports as a pose failure', () => {
    const broken = { ...FIGURES['db-curl']!, pose: () => { throw new Error('no pose'); } };
    expect(() => figureProbe(REAL_SKELETON, broken)({ statureCm: 175 })).toThrow('no pose');
  });
});

describe('checkGeometry with posed library figures', () => {
  const catalog = syntheticCatalog();
  const pullUp = catalog.exercises.get('pull-up')!;
  const withBar = (cm: number): Profile => {
    const p = fullHomeGym();
    return { ...p, equipment: p.equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { ...e.params, pullUpBarHeightCm: cm } } : e)) };
  };

  it('fits pull-ups under an 8 ft ceiling with the typical bar', () => {
    expect(fullHomeGym().room.ceilingHeightCm).toBe(EIGHT_FT_CEILING_CM);
    expect(checkGeometry(pullUp, fullHomeGym(), catalog, DEFAULT_PROBES).reasons).toEqual([]);
  });
  it('rules them out when a measured bar puts the head too close to the ceiling', () => {
    expect(checkGeometry(pullUp, withBar(228), catalog, DEFAULT_PROBES).reasons.map((r) => r.check)).toEqual(['ceiling']);
  });
});
```

**Edit `src/lib/content/catalog.test.ts`** (1 change):

1. Replace

```ts

  it('checks attachments fit some equipment', () => {
```

   with

```ts

  it('checks figure specs against the injected ids (issue #74)', () => {
    const ex = exercise({ figure: { spec: 'goblet-squat' } });
    expect(problemsOf(input({ exercises: [ex] }))).toEqual(['exercise "smith-squat": unknown figure spec "goblet-squat"']);
    expect(() => buildCatalog(input({ exercises: [ex] }), { figureIds: new Set(['goblet-squat']) })).not.toThrow();
    expect(() => buildCatalog(input(), { figureIds: new Set(['goblet-squat']) })).toThrow(/unknown figure spec "smith-squat"/);
  });

  it('checks 3D models and that they draw the illustrative defaults', () => {
    const models = { 'smith-functional-trainer': { kind: 'equipment' as const, drawsWith: { smithLowestBarHeightCm: 40 } }, rope: { kind: 'attachment' as const } };
    const withModel = (m: string) => EquipmentSchema.parse({ ...smith, model3d: m });
    expect(() => buildCatalog(input({ equipment: [withModel('smith-functional-trainer')], attachments: [{ ...rope, model3d: 'rope' }, holdDown] }), { models })).not.toThrow();
    const wrong = (e: unknown) => (e instanceof CatalogError ? e.problems : []);
    const run = (i: CatalogInput) => {
      try {
        buildCatalog(i, { models });
        return [];
      } catch (e) {
        return wrong(e);
      }
    };
    expect(run(input({ equipment: [withModel('rack')] }))).toEqual(['equipment "smith-functional-trainer": unknown 3D model "rack"']);
    expect(run(input({ attachments: [{ ...rope, model3d: 'smith-functional-trainer' }, holdDown] }))).toEqual(['attachment "rope": unknown 3D model "smith-functional-trainer"']);
    const drift = EquipmentSchema.parse({ ...smith, model3d: 'smith-functional-trainer', illustrativeDefaults: { ...smith.illustrativeDefaults, smithLowestBarHeightCm: 45 } });
    expect(run(input({ equipment: [drift] }))).toEqual(['equipment "smith-functional-trainer": illustrative default "smithLowestBarHeightCm" is 45 but the 3D model draws 40']);
  });

  it('checks attachments fit some equipment', () => {
```


- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/engine/probes.test.ts src/lib/content/catalog.test.ts`
Expected: FAIL — `figureProbe` is not exported; the catalog ignores `models` and `model3d`.

- [ ] **Step 4: Implement**

**Replace `src/lib/engine/probes.ts` with:**

```ts
import type { FigureModel } from '../figure/figures';
import { FIGURES } from '../figure/fixtures';
import { sceneParamsWith } from '../figure/geometry/scene';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
import { ILLUSTRATIVE_TRAINER } from '../figure/geometry/trainer';
import { checkFigureFrame } from '../figure/pose/checkFigureFrame';
import { REAL_SKELETON } from '../figure/pose/realSkeleton';
import type { SkeletonDef } from '../figure/pose/skeleton';
import type { SmithSquatSpec } from '../figure/pose/smithSquat';
import { carriedBarCenter, type Finding, headTop } from '../figure/pose/validate';
import type { GeometryProbe, ProbeRegistry } from './geometry';

/**
 * Findings the engine checks itself, against the profile's or the typical values and with localized
 * messages. (The probe passes no ceiling, and the illustrative machine's stops are not the user's.)
 */
const ENGINE_CHECKED: ReadonlySet<Finding['check']> = new Set(['bar-travel', 'ceiling']);

/**
 * Poses every Smith-squat frame at the stature with `checkFigureFrame` on the typical machine (D12) and
 * reports the envelope (head or plates), the bar-centre heights (the datum of the stops and `SmithParams`),
 * the ROM findings (signed limits; this solver's elbows are checked by magnitude only, see
 * `validateSmithSquat`) and every other pose finding. Throws when a frame cannot be solved.
 */
export function smithSquatProbe(sk: SkeletonDef, spec: SmithSquatSpec): GeometryProbe {
  const smith = ILLUSTRATIVE_SMITH;
  return ({ statureCm }) => {
    let topCm = 0;
    const barCentersCm: number[] = [];
    const rom: string[] = [];
    const posing: string[] = [];
    for (const frame of spec.frames) {
      const { solution, findings } = checkFigureFrame(sk, spec, frame, { statureCm, smith });
      const barY = carriedBarCenter(sk, solution, spec.barRestOffsetCm)[1];
      barCentersCm.push(barY);
      topCm = Math.max(topCm, headTop(sk, solution.world, solution.scaleFactor)[1], barY + smith.plateDiameterCm / 2);
      for (const f of findings) {
        if (f.check === 'rom') rom.push(`${frame.id}: ${f.message}`);
        else if (!ENGINE_CHECKED.has(f.check)) posing.push(`${frame.id}: ${f.message}`);
      }
    }
    return { topCm, barCentersCm, rom, posing };
  };
}

/**
 * Poses every frame of a library figure at the stature (spec §7.1 check 4) on the typical equipment
 * (D12), with the pull-up bar at the height the engine resolved (measured or typical), and reports the
 * envelope (head, body and implements), the Smith bar's centre heights when the figure moves it, the ROM
 * findings and every other error-level pose finding. Bar travel and the ceiling are left to the engine.
 */
export function figureProbe(sk: SkeletonDef, figure: FigureModel): GeometryProbe {
  return ({ statureCm, pullUpBarHeightCm }) => {
    const params =
      pullUpBarHeightCm === undefined
        ? undefined
        : sceneParamsWith({ trainer: { pullUpBarHeightCm, rackHeightCm: Math.max(ILLUSTRATIVE_TRAINER.rackHeightCm, pullUpBarHeightCm + 5) } });
    let topCm = 0;
    const barCentersCm: number[] = [];
    const rom: string[] = [];
    const posing: string[] = [];
    figure.frames.forEach((frame, i) => {
      const posed = figure.pose(sk, i, { statureCm, params });
      topCm = Math.max(topCm, posed.topCm);
      if (posed.smithBarCm !== undefined) barCentersCm.push(posed.smithBarCm);
      for (const f of posed.findings) {
        if (f.severity !== 'error' || ENGINE_CHECKED.has(f.check)) continue;
        (f.check === 'rom' ? rom : posing).push(`${frame.id}: ${f.message}`);
      }
    });
    return { topCm, ...(barCentersCm.length > 0 && { barCentersCm }), rom, posing };
  };
}

/**
 * Probes the site uses, keyed by figure id: every figure in the library (issue #74), posed on the
 * committed human skeleton. Exercises without a figure (cardio machines) use the stature envelope.
 */
export const DEFAULT_PROBES: ProbeRegistry = Object.fromEntries(Object.values(FIGURES).map((f) => [f.id, figureProbe(REAL_SKELETON, f)]));
```

**Edit `src/lib/engine/geometry.ts`** (2 changes):

1. Replace

```ts
  statureCm: number;
}
```

   with

```ts
  statureCm: number;
  /** The pull-up bar's height (measured, else typical), for figures that hang from it. */
  pullUpBarHeightCm?: number;
}
```

2. Replace

```ts
    try {
      probed = probe({ statureCm });
    } catch {
```

   with

```ts
    try {
      probed = probe({ statureCm, pullUpBarHeightCm: numberParam(profile, catalog, 'pullUpBarHeightCm') });
    } catch {
```


**Edit `src/lib/engine/testing/fixtures.ts`** (1 change):

1. Replace

```ts
  syntheticExercise({ id: 'push-up', pattern: 'horizontal-push', jointStress: stress('low', 'low', 'moderate', 'high') }),
  syntheticExercise({ id: 'db-shoulder-press', pattern: 'vertical-push', requires: { capabilities: ['dumbbells', 'incline-bench'] }, setupState: { station: 'bench', benchAngleDeg: 90 }, jointStress: stress('low', 'low', 'high', 'low') }),
  syntheticExercise({ id: 'db-lateral-raise', pattern: 'shoulder-abduction', requires: { capabilities: ['dumbbells'] }, repSeconds: 3 }),
```

   with

```ts
  syntheticExercise({ id: 'push-up', pattern: 'horizontal-push', jointStress: stress('low', 'low', 'moderate', 'high') }),
  // A standing overhead press with no figure in the library: the ceiling tests exercise the stature envelope.
  // (The library's seated `db-shoulder-press` figure tops out far lower.)
  syntheticExercise({ id: 'db-shoulder-press', pattern: 'vertical-push', requires: { capabilities: ['dumbbells', 'incline-bench'] }, setupState: { station: 'bench', benchAngleDeg: 90 }, jointStress: stress('low', 'low', 'high', 'low'), figure: { spec: 'standing-overhead-press' } }),
  syntheticExercise({ id: 'db-lateral-raise', pattern: 'shoulder-abduction', requires: { capabilities: ['dumbbells'] }, repSeconds: 3 }),
```


**Edit `src/lib/content/catalog.ts`** (5 changes):

1. Replace

```ts
import { FIGURES } from '../figure/fixtures';
import { paramValueMatches } from './params';
```

   with

```ts
import { FIGURES } from '../figure/fixtures';
import { EQUIPMENT_MODELS, type EquipmentModel } from '../figure/geometry/models';
import { paramValueMatches } from './params';
```

2. Replace

```ts
  figureIds?: ReadonlySet<string>;
}
```

   with

```ts
  figureIds?: ReadonlySet<string>;
  /** 3D models by `model3d` id; defaults to lib/figure/geometry's EQUIPMENT_MODELS. */
  models?: Readonly<Record<string, Pick<EquipmentModel, 'kind' | 'drawsWith'>>>;
}
```

3. Replace

```ts
  const figureIds = opts.figureIds ?? new Set(Object.keys(FIGURES));
  const equipment = byId('equipment', input.equipment, problems);
```

   with

```ts
  const figureIds = opts.figureIds ?? new Set(Object.keys(FIGURES));
  const models = opts.models ?? EQUIPMENT_MODELS;
  const equipment = byId('equipment', input.equipment, problems);
```

4. Replace

```ts
  for (const eq of equipment.values()) {
    for (const [name, value] of Object.entries(eq.illustrativeDefaults)) {
```

   with

```ts
  for (const eq of equipment.values()) {
    // M3: a 3D model must exist for `model3d`, and draw the same typical values the engine uses.
    if (eq.model3d !== undefined) {
      const m = models[eq.model3d];
      if (!m || m.kind !== 'equipment') problems.push(`equipment "${eq.id}": unknown 3D model "${eq.model3d}"`);
      for (const [name, drawn] of Object.entries(m?.drawsWith ?? {})) {
        const typical = eq.illustrativeDefaults[name];
        if (typical !== undefined && typical !== drawn) {
          problems.push(`equipment "${eq.id}": illustrative default "${name}" is ${String(typical)} but the 3D model draws ${String(drawn)}`);
        }
      }
    }
    for (const [name, value] of Object.entries(eq.illustrativeDefaults)) {
```

5. Replace

```ts
  for (const at of attachments.values()) {
    for (const cap of at.fits) {
```

   with

```ts
  for (const at of attachments.values()) {
    if (at.model3d !== undefined && models[at.model3d]?.kind !== 'attachment') problems.push(`attachment "${at.id}": unknown 3D model "${at.model3d}"`);
    for (const cap of at.fits) {
```


**Edit `src/lib/content/schemas.ts`** (2 changes):

1. Replace

```ts
  illustrativeDefaults: z.record(ParamNameSchema, ParamValueSchema).default({}),
  /** Parametric builder id in lib/figure (checked from M3). */
  model3d: IdSchema.optional(),
```

   with

```ts
  illustrativeDefaults: z.record(ParamNameSchema, ParamValueSchema).default({}),
  /** 3D model id in lib/figure/geometry/models (EQUIPMENT_MODELS), checked by the catalog. */
  model3d: IdSchema.optional(),
```

2. Replace

```ts
  fits: z.array(IdSchema).min(1),
  model3d: IdSchema.optional(),
```

   with

```ts
  fits: z.array(IdSchema).min(1),
  /** 3D model id in lib/figure/geometry/models (EQUIPMENT_MODELS), checked by the catalog. */
  model3d: IdSchema.optional(),
```


Give each content file its model (the id equals the file's id):

**Edit `src/content/equipment/smith-functional-trainer.yaml`** (1 change):

1. Replace

```yaml
capabilities: [smith-bar, rack-uprights, j-hooks, spotter-arms, safety-catches, cable-column, pull-up-bar]
parameters:
```

   with

```yaml
capabilities: [smith-bar, rack-uprights, j-hooks, spotter-arms, safety-catches, cable-column, pull-up-bar]
model3d: smith-functional-trainer
parameters:
```

**Edit `src/content/equipment/adjustable-bench.yaml`** (1 change):

1. Replace

```yaml
capabilities: [flat-bench, incline-bench]
parameters:
```

   with

```yaml
capabilities: [flat-bench, incline-bench]
model3d: adjustable-bench
parameters:
```

**Edit `src/content/equipment/dumbbells.yaml`** (1 change):

1. Replace

```yaml
capabilities: [dumbbells]
parameters:
```

   with

```yaml
capabilities: [dumbbells]
model3d: dumbbells
parameters:
```

**Edit `src/content/attachments/rope.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: rope
```

**Edit `src/content/attachments/close-grip-row-handle.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: close-grip-row-handle
```

**Edit `src/content/attachments/single-handle.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: single-handle
```

**Edit `src/content/attachments/lat-bar.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: lat-bar
```

**Edit `src/content/attachments/ankle-strap.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: ankle-strap
```

**Edit `src/content/attachments/row-footplate.yaml`** (1 change):

1. Replace

```yaml
fits: [cable-column]
```

   with

```yaml
fits: [cable-column]
model3d: row-footplate
```

**Edit `src/content/attachments/roller-hold-down.yaml`** (1 change):

1. Replace

```yaml
fits: [rack-uprights]
uses:
```

   with

```yaml
fits: [rack-uprights]
model3d: roller-hold-down
uses:
```


The engine paragraph of the architecture doc was written by M2's exit task (#61); update its probe sentence:

**Edit `docs/architecture.md`** (1 change):

1. Replace

```markdown

`src/lib/engine` implements spec §7: `checkFeasibility` (capabilities, attachments, exclusions, geometry; feasible or infeasible), `buildWeek` (pattern slots, ranking, overrides, supersets, empty slots, assumptions), `estimateDay` / `fitToTime` and `shortSession`. Nothing waits on a measurement (spec D12): an unknown height poses at a typical 175 cm, an unknown ceiling is assumed to be 240 cm (exceeding it adds a "check overhead clearance" note; a measured ceiling that is too low makes the exercise infeasible), and unmeasured equipment uses its `illustrativeDefaults`. Heights are compared unrounded; a reason shows them rounded apart (the need up and the ceiling down; a bar past a stop and the stop each away from the other), so a refusal never reads as a fit. Geometry poses an exercise with a probe from `DEFAULT_PROBES` (the Smith squat, through `checkFigureFrame` on the typical machine); exercises without a probe use a conservative stature-based envelope until the M3 pose library, and Smith-bar exercises without a probe are never planned. Geometry fails safe: a stop or bench-fit value that cannot be resolved makes the exercise infeasible (`stopsUnknown`, `benchFitUnknown`) instead of skipping the check, and the catalog build prevents it for equipment the geometry checks depend on. Ties in ranking break by id in code-unit order (`compareIds`), never by the runtime locale. Tests use synthetic catalogs and profiles from `src/lib/engine/testing/fixtures.ts`; `scenarios.test.ts` runs the whole engine on four of them (the M2 exit criterion), also under a 10-minute budget and on a day with five priority-1 slots so the fit-to-time and short-session bounds are exercised, and formats every message it emits in both languages.

```

   with

```markdown

`src/lib/engine` implements spec §7: `checkFeasibility` (capabilities, attachments, exclusions, geometry; feasible or infeasible), `buildWeek` (pattern slots, ranking, overrides, supersets, empty slots, assumptions), `estimateDay` / `fitToTime` and `shortSession`. Nothing waits on a measurement (spec D12): an unknown height poses at a typical 175 cm, an unknown ceiling is assumed to be 240 cm (exceeding it adds a "check overhead clearance" note; a measured ceiling that is too low makes the exercise infeasible), and unmeasured equipment uses its `illustrativeDefaults`. Heights are compared unrounded; a reason shows them rounded apart (the need up and the ceiling down; a bar past a stop and the stop each away from the other), so a refusal never reads as a fit. Geometry poses an exercise's figure with a probe from `DEFAULT_PROBES`: every figure in the pose library, on the typical equipment with the pull-up bar at the profile's (or typical) height, giving the envelope for the ceiling, the Smith bar heights, and joint-range and pose findings. Exercises without a figure (cardio machines) use a conservative stature-based envelope, and Smith-bar exercises without a probe are never planned. Geometry fails safe: a stop or bench-fit value that cannot be resolved makes the exercise infeasible (`stopsUnknown`, `benchFitUnknown`) instead of skipping the check, and the catalog build prevents it for equipment the geometry checks depend on. Ties in ranking break by id in code-unit order (`compareIds`), never by the runtime locale. Tests use synthetic catalogs and profiles from `src/lib/engine/testing/fixtures.ts`; `scenarios.test.ts` runs the whole engine on four of them (the M2 exit criterion), also under a 10-minute budget and on a day with five priority-1 slots so the fit-to-time and short-session bounds are exercised, and formats every message it emits in both languages.

```


- [ ] **Step 5: Run the tests, the checks and the build**

Run: `npm test && npm run lint && npm run check && npm run build`
Expected: `probes.test.ts` 26 and `catalog.test.ts` 24 passed; the M2 engine and scenario tests pass unchanged; 0 lint and type errors; the build validates the content (every `model3d` exists and draws the content's typical values).

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine src/lib/content src/content docs/architecture.md
git commit -m $'feat(engine): pose every library figure for feasibility; check 3D models in the catalog\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Engine probes from the pose library; 3D model checks" \
  --body $'Every library figure is an engine probe (posed envelope, Smith bar heights, ROM and pose findings), with the pull-up bar at the resolved height; the catalog checks model3d ids and that models draw the content typical values; buildCatalog figureIds is tested.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** every figure is a probe, a measured pull-up bar moves the pull-up's envelope (and a bar too low for a hang makes it infeasible), the M2 engine tests pass unchanged, and a wrong `model3d` or a drawn value that disagrees with the content fails the build.

---
### Task 15: Owner review — the look of the M3 figures (MAIN AGENT ONLY — HARD STOP)

> **MAIN AGENT ONLY. HARD STOP.** The controller does this task itself; it is never dispatched to a subagent, and no subagent may mark it done. The controller posts the review link to the owner in chat, then **ends its turn and waits for the owner's reply in chat**. A comment on an issue, a green CI run or silence is not a reply. Task 16 does not start until the owner has answered.

A human gate (its own `gate:user-review` issue from Task 0; spec §14: "Visual approval of the 3D look is a human gate"; the owner's realism bar: realistic 3D, never 2D vectors). Issue #47 (elbow twist) is decided here too, as a separate question with its own issue.

**Files:** none in this task. A throwaway branch renders the #47 comparison and is deleted; changes the owner asks for become their own issues and PRs.

- [ ] **Step 1: Make sure the review pages are deployed**

After Tasks 1–14 are merged and the deploy workflow has run (`gh run list --repo tomqwu/ai_health --workflow deploy.yml --limit 1` shows `completed success`), open `https://tomqwu.github.io/ai_health/en/dev/figures/` and check that every figure and equipment still loads, and that each figure page shows 0 errors and 0 warnings.

- [ ] **Step 2: Render the #47 comparison**

Option (a), the shortest swing without `bendSide`, is one flag per arm (`hinge: false`, controller decision 3). Render the curl both ways on a throwaway branch:

```bash
git checkout main && git pull && git checkout -b tmp/elbow-compare
mkdir -p .cache/compare47 && npm run render:figures
for i in 0 1 2; do cp public/figures/db-curl/frame-$i.webp .cache/compare47/option-b-frame-$i.webp; done
sed -i.bak "s/hand: { grip: 'bar'/hinge: false, hand: { grip: 'bar'/g" src/lib/figure/fixtures/db-curl.ts && rm src/lib/figure/fixtures/db-curl.ts.bak
npx vitest run tests/assets/figure-sweep.test.ts -t db-curl && npm run render:figures
for i in 0 1 2; do cp public/figures/db-curl/frame-$i.webp .cache/compare47/option-a-frame-$i.webp; done
node -e '
const sharp = require("sharp");
(async () => {
  const d = ".cache/compare47/";
  const b = await sharp(d + "option-b-frame-1.webp").png().toBuffer();
  const a = await sharp(d + "option-a-frame-1.webp").png().toBuffer();
  const { width, height } = await sharp(b).metadata();
  await sharp({ create: { width: width * 2, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: b, left: 0, top: 0 }, { input: a, left: width, top: 0 }]).png().toFile(d + "curl-top-b-vs-a.png");
})();'
git checkout src/lib/figure/fixtures/db-curl.ts && git checkout main && git branch -D tmp/elbow-compare && npm run render:figures
```
Expected: the sweep passes for the flagged curl (6 tests); `.cache/compare47/curl-top-b-vs-a.png` shows the curl's top frame with option (b) on the left and option (a) on the right. Look at it before sending: the difference is in how the upper arm rolls, visible at the shoulder and the sleeve.

- [ ] **Step 3: Ask the owner in chat, then stop**

Post the same text on the gate issue, then send it to the owner in chat. A terminal controller cannot attach a file, so give the image's local path, `.cache/compare47/curl-top-b-vs-a.png` (full path from `realpath`), and upload it to the gate issue comment if the owner reads it on GitHub:
```text
The M3 figures are ready for your review: https://tomqwu.github.io/ai_health/en/dev/figures/
- 20 exercise figures (one per movement pattern) and 20 equipment models, all with typical dimensions.
- Each figure page has the live 3D view (drag to orbit, Play, and a height picker from 150 to 200 cm) and the check table.
Please tell me what looks wrong or unrealistic: the person, poses, hands, camera angles, equipment.

One decision (#47, elbow twist). The comparison image (path below) is the curl's top frame both ways:
(b) Current: elbows and knees always bend on their hinges, and the joint checks know which way they bend. The upper arm rolls, which can fold the sleeve at the shoulder. [left]
(c) Keep (b) and add twist bones to the 3D person, so the roll spreads along the upper arm and the sleeve does not fold. Needs Blender on your machine to rebuild the model; a follow-up issue.
(a) The arm swings the shortest way; elbows are checked by how much they bend, not which way. Looks slightly different at the shoulder, and a wrongly bent elbow would no longer be caught. [right]
Which do you prefer: keep (b), (b) now and (c) later, or (a)?
Comparison image: <full path to .cache/compare47/curl-top-b-vs-a.png>
```
Then **end the turn**. Do not start Task 16, do not close any issue, and do not treat anything but the owner's own reply in chat as an answer.

- [ ] **Step 4: Record the owner's answers**

When the owner replies in chat:
- **#47:** comment the chosen option and close it. For (c), open a follow-up issue (label `area:figures`, milestone M5, "Twist bones in the human model; needs Blender on the owner's machine"). For (a), open an issue to set `hinge: false` on every library arm and update decision 3 of this plan; it is done before Task 16.
- **The look:** open one issue per requested change (label `area:figures`, milestone M3 if it changes what M3 shipped, else M5), fix the M3 ones through the usual task flow, and show the owner the result.
- **The gate issue:** close it only when the owner has said in chat that the look is signed off.

**Done when:** the owner has signed off on the look in chat, the gate issue is closed, #47 is closed with the owner's option, and every requested change has an issue.

---
### Task 16: Figure docs and M3 exit

Brings `docs/figure-pipeline.md` up to date with the pose library (layers, how to add or tune a figure, the viewer), updates the README for what M3 shipped, and closes the epic and the milestone once the exit criterion holds. Starts only after the owner has answered Task 15.

**Files:**
- Modify: `docs/figure-pipeline.md`, `README.md`

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m3/<issue>-m3-exit
```

- [ ] **Step 2: Write the docs**

**Edit `docs/figure-pipeline.md`** (3 changes):

1. Replace

```markdown
|---|---|---|
| Math | `src/lib/figure/math` | Vectors and quaternions (three.js-compatible semantics) |
| Pose | `src/lib/figure/pose` | Skeleton from `skeleton.json`, forward kinematics, `PoseBuilder` (aim with optional roll, two-bone IK), hand curl, the Smith squat solver, validators, `checkFigureFrame` (solve + validate with one set of inputs) |
| Geometry | `src/lib/figure/geometry` | Equipment primitives built from parameters (`SmithParams`, checked by `smithProblems`); `ILLUSTRATIVE_SMITH` holds labelled drawing defaults (not measurements of anyone's machine) |
| Fixtures | `src/lib/figure/fixtures` | Exercise data: `SMITH_SQUAT` and the `FIGURES` registry the renderer reads |
| 3D | `src/lib/figure/scene3d` | Stage (lights, floor, camera), equipment meshes, human loader and `applyPose`, `mountFigure` |
| Output | `scripts/render-figures.ts`, `src/pages/render/[figure].astro` (dev-only; never built into `dist/`), `src/components/figure/` | Pre-rendered WebP frames; the interactive `FigureViewer.tsx`; the spike page `/<lang>/dev/figure-spike/` |

```

   with

```markdown
|---|---|---|
| Math | `src/lib/figure/math` | Vectors and quaternions (three.js-compatible semantics), `fromTwoPairs` for orientations from two directions |
| Pose | `src/lib/figure/pose` | Skeleton from `skeleton.json`, forward kinematics, `PoseBuilder` (aim with roll, two-bone IK with `bendSide`), the generalized pose library (`poseSpec.ts` data, `solvePose`, `interpolatePoseFrame`, body capsules, `validatePose`), moving props, and the M1 Smith squat solver with `checkFigureFrame` |
| Geometry | `src/lib/figure/geometry` | Primitives (boxes, cylinders, spheres; signed distances), every v1 equipment and attachment builder (`trainer.ts`, `bench.ts`, `implements.ts`, `cardio.ts`), figure scenes (`scene.ts`) and the model registry `EQUIPMENT_MODELS` that content `model3d` ids refer to. `ILLUSTRATIVE_*` hold typical drawing values (D12), not anyone's equipment |
| Figures | `src/lib/figure/figures.ts`, `src/lib/figure/fixtures` | `FigureModel`: the one interface the renderer, viewer, engine probes and sweep use. `poseFigure` wraps a pose spec; `smithSquatFigure` wraps the M1 squat unchanged. `FIGURES` registers one figure per non-cardio movement pattern |
| 3D | `src/lib/figure/scene3d` | Stage (lights, floor, camera), equipment meshes from shared unit shapes (`createEquipment`), human loader and `applyPose`, `mountFigure` and `mountEquipment` |
| Output | `scripts/render-figures.ts`, `scripts/lib/figureKeys.ts`, `src/pages/render/[figure].astro` (dev-only; never built into `dist/`), `src/components/figure/` | Cached pre-rendered WebP frames and equipment stills; the `FigureViewer` island; the review pages `/<lang>/dev/figures/` and `/<lang>/dev/figures/<id>/` |

```

2. Replace

```markdown

1. Frames are data (`src/lib/figure/fixtures/*.ts`): joint targets and anchors, never pixel art. Register a new figure in `fixtures/index.ts` so the renderer finds it.
2. Run `npx vitest run src/lib/figure tests/assets`. Every frame, and the in-between Play poses, must pass at 150–200 cm on both the synthetic skeleton (`src/lib/figure/pose`) and the real one (`tests/assets`). Check frames through `checkFigureFrame(sk, spec, frame, { statureCm, smith })`: it takes the rail from `smith` and the bar offset from the spec, so the solver and `validateSmithSquat` always see the same inputs. The bar-on-rail check re-derives the bar from the posed body (`carriedBarCenter`), so it catches a bar that drifts off the rail.
   - Joint limits (`ROM_LIMITS`) are signed ranges. Knee, elbow and hip are measured about each joint's hinge axis, derived from the rig's rest pose and carried by the proximal bone, so hyperextension reads negative. Ankle dorsiflexion is the shank-to-foot angle relative to rest.
   - Known limitation: the Smith squat solver leaves the humerus at its shortest-swing twist, so its elbows are checked for bend magnitude only (see `validateSmithSquat`). `twoBoneIK`'s `bendSide` rolls the humerus into true hinge flexion, but on this rig (no twist bones) that twists the shirt sleeve.
   - The signed metric takes its size from the full angle between the two segments and only its sign from the hinge axis, so a bend off the hinge plane (sideways) is not flagged. The Smith squat's knees bend up to about 25° off the thigh's hinge on the real rig, from the same shortest-swing thigh twist; the sign stays right. `bendSide` on the thighs would fix it (see `signedBendDeg`).
   - An arm that may swing far from rest (overhead) needs a roll hint (`aim(..., { up })`, `twoBoneIK(..., { upperRoll, lowerRoll })`); without one its twist is only deterministic, not controlled.
3. `npm run render:figures` and look at `public/figures/<id>/frame-*.webp`, or open `/<lang>/dev/figure-spike/`, which shows the live viewer, the frames and the validator table for 150–200 cm.

```

   with

```markdown

1. A figure is data: a `PoseFigureSpec` in `src/lib/figure/fixtures/<id>.ts` (scene, camera, three frames), registered in `fixtures/index.ts`. Each frame places the hips (`trunk.hips`, a `PointRef`), leans and bends the trunk, and gives each limb a goal: a hand's grip point and how it holds (`bar`, `flat`, `free`), a foot's contact point and orientation (`flat`, `ball`, `none`). Contacts with surfaces (`pelvis` on `bench.seat`, `shank_l` on `floor`…) are declared and checked.
2. Points are `{ from, cm, bodyCm, yFromFloor }`: an anchor (the floor, equipment such as `bench.hinge` or `pullup.bar`, or the posed body such as `body.shoulder_l`), a fixed offset and an offset written for 175 cm that scales with stature. A pose that uses only body offsets is the same pose at every stature; fixed equipment is where statures differ, and the sweep checks each one.
3. Run `npx vitest run src/lib/figure tests/assets`. The figure sweep (`tests/assets/figure-sweep.test.ts`) poses every figure × frame × stature {150, 165, 175, 190, 200}, and the in-between Play poses, on the real rig. Any error or warning fails it. A case that genuinely cannot be posed is declared in `expectedFailures` with its reason; the sweep checks it still fails. It also budgets Play by solver runs, which do not depend on the machine: an unvalidated in-between pose may run the solver at most 5 times (`PosedFigure.solves`), so its contact settle must converge.
   - Elbows and knees bend on their hinges: `solvePose` rolls the upper arm and thigh with `twoBoneIK`'s `bendSide` (issue #47, option b), so their signed limits apply. `hinge: false` on an arm goal gives option (a): the shortest swing, with a magnitude-only elbow check. The M1 Smith squat keeps option (a) and its approved look.
   - Joint limits (`ROM_LIMITS`) are signed. The hip reads 0 standing and is measured about its hinge only, so spreading the legs does not read as extension; it may extend to −20°. The authored spine and neck have limits too (`SPINE_LIMITS_DEG`).
   - Wrists (`wristBendDeg`, in the forearm's frame) stay within 30° of rest when holding something, 25° when pressing (`seat: 'palm'`) and 85° when flat on a surface. A bar grip keeps the wrist straight by construction; a wrist finding means the forearm is not under the hand, so move the elbow pole or widen the grip.
   - Held implements may not sink into the body (more than 2 cm warns, more than 4 cm fails) unless the frame declares the touch in `touches`. A `loose` contact (thighs on a seat) is allowed but not measured.
   - In-between poses blend numbers, turn directions along the shorter arc, swing hands placed from a shoulder around it, and settle onto the first measured contact both frames declare (a secant search of at most five steps; a part lying `along` a surface settles on the mean of its two end gaps, so the search converges). Both frames must measure each point from the same anchor. Play poses with `{ validate: false }`.
4. `npm run render:figures` and open `/<lang>/dev/figures/<id>/`: the live viewer with a height picker, the frames and the sweep table.

```

3. Replace

```markdown

`FigureViewer.tsx` reports its state through `data-figure-status`:

```

   with

```markdown

`FigureViewer.tsx` takes a figure's metadata (`figureMeta`), loads three.js, the solver and the figure only when it mounts, and poses it at `statureCm` (a typical 175 cm by default; M4 passes the profile's). `statureChoices` adds a height picker (the dev pages). Unilateral figures show a "both sides" badge. It reports its state through `data-figure-status`:

```


Move the figure system from "Coming next" to what the app has today:

**Edit `README.md`** (3 changes):

1. Replace

```markdown
- **Two languages, one toggle.** Every page is available in English and Simplified Chinese. The first visit follows your browser's language, and you can switch at any time.
- **Realistic 3D exercise figures.** An interactive 3D person demonstrates each exercise on the equipment. You can orbit the camera, step through the key positions, or press Play to watch the whole movement. Movement arrows show which way to move. Without 3D support, the site shows still images instead.
- **Safety first.** A safety page lists the warning signs that mean stop and get checked, plus everyday habits for training safely at home.
```

   with

```markdown
- **Two languages, one toggle.** Every page is available in English and Simplified Chinese. The first visit follows your browser's language, and you can switch at any time.
- **Realistic 3D exercise figures.** An interactive 3D person demonstrates each exercise on the equipment. You can orbit the camera, step through the key positions, or press Play to watch the whole movement. Movement arrows show which way to move. Without 3D support, the site shows still images instead. So far, twenty exercises have figures, one for each kind of movement, and every piece of equipment has a 3D model.
- **Safety first.** A safety page lists the warning signs that mean stop and get checked, plus everyday habits for training safely at home.
```

2. Replace

```markdown
|---|---|
| Figure system | 3D figures for every exercise and piece of equipment |
| Planner and PDF | A setup wizard, a week view where you can swap exercises, and printable PDF plans |
| Equipment guides and programs | Step-by-step guides for each machine, the full exercise library, and ready-made weekly programs |
| Later | Nutrition and daily habit tracking |
```

   with

```markdown
|---|---|
| Planner and PDF | A setup wizard, a week view where you can swap exercises, and printable PDF plans |
| Equipment guides and programs | Step-by-step guides for each machine, the full exercise library with a 3D figure for each exercise, and ready-made weekly programs |
| Later | Nutrition and daily habit tracking |
```

3. Replace

```markdown
npx playwright install chromium   # once per machine
npm run render:figures   # pre-render 3D exercise frames into public/figures/
npm run test:e2e   # end-to-end tests (run render:figures first)
```

   with

```markdown
npx playwright install chromium   # once per machine
npm run render:figures   # pre-render 3D exercise frames and equipment stills into public/figures/ (cached in .cache/figures/)
npm run test:e2e   # end-to-end tests (run render:figures first)
```


- [ ] **Step 3: Full verification**

Run: `npm test && npm run lint && npm run check && npm run render:figures && npm run build && npm run test:e2e`
Expected: every unit test passes, including the figure sweep (120: 20 figures × 5 statures plus the Play budget tests, with no errors or warnings); 0 lint and type errors; every image comes from the cache or renders; the build completes; every end-to-end test passes, with and without WebGL.

- [ ] **Step 4: Privacy check**

Run: `grep -rinwE "brand|model no|serial (no|number)" src/lib/figure src/content docs/figure-pipeline.md || echo clean`
Expected: `clean`. This grep cannot know actual brand names, so the controller also greps `src docs README.md` locally for the brand and model names kept in its private memory (never committed, never written into an issue or PR), expecting no match. Then read the new geometry defaults and fixtures once more: every dimension is typical or invented, never a measurement shared by the owner.

- [ ] **Step 5: Commit, open the PR, merge when CI is green**

```bash
git add docs/figure-pipeline.md README.md
git commit -m $'docs(figures): document the pose library, the equipment models and the render cache\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Figure docs and M3 exit" \
  --body $'Updates docs/figure-pipeline.md and the README for the M3 figure system.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

- [ ] **Step 6: Close the milestone**

First list what is still open:
```bash
gh issue list --repo tomqwu/ai_health --milestone "M3 Figure system" --state open
```
Expected: only the epic, #18. If any other issue is listed (the Task 15 gate, #47, a change the owner asked for, this task's own issue if its PR did not close it), stop and finish it first. When #18 is the only one:
```bash
gh issue close 18 --repo tomqwu/ai_health --comment "M3 exit criterion met: the figure sweep is green, the viewer works with and without WebGL, and the owner signed off on the look."
M=$(gh api repos/tomqwu/ai_health/milestones --jq '.[] | select(.title=="M3 Figure system") | .number')
gh api -X PATCH repos/tomqwu/ai_health/milestones/$M -f state=closed
```

**Done when (M3 exit):** the figure sweep is green, the viewer works with and without WebGL, CI passes on `main`, and the owner has signed off on the look (Task 15). Next: write the M4 plan.

---
## Self-review

**Spec coverage.**
- §16 M3 scope: generalized pose library (Tasks 4–6), all equipment builders (Tasks 1–3: the 13 v1 equipment classes of §5.1 and the 7 attachments of §5.2, checked by `stations.test.ts`), viewer island (Task 6; review pages Task 8), pre-render pipeline in CI (Task 7), figure sweep (Task 6, filled by Tasks 9–13). Exit criterion: sweep green (Tasks 6, 9–13, 16) and the viewer with and without WebGL (Tasks 6 and 8 end-to-end tests, `figure-fallback.spec.ts`).
- §5.3: exactly three frames per figure (`figures.test.ts`), unilateral figures work the side nearest the camera and show the "both sides" badge (Tasks 6, 13), cardio machines have no figure (controller decision 2).
- §8.1: skeleton from the rig, scaled uniformly (`solvePose` uses `REAL_SKELETON`, `scaleFactor`); keyframes as partial goals and anchors (`hands → smith-bar` is `{ hold: 'smith-bar' }`, `feet → floor` is a foot contact, `hips → bench-seat` is `pelvis` on `bench.seat`, `upper-back` is `chest` on a surface); two-bone IK with pole vectors (Task 4); the rail constraint — the M1 squat's trunk solver is kept, and pose figures hold the Smith bar on the rail by construction and re-check it from the hands (Task 5); floor contact for feet (Task 4); ROM limits (Task 4); the bent-knee hang with the feet clear of the floor and the head's height as the envelope (Task 12, `hang-clearance`); every validator in the table (Task 5, positive and negative fixtures).
- §8.2: collision proxies from parameters for uprights, rails, bar, plates, stops, catches, bench, cable column, pulleys, dumbbells and attachments (Tasks 1–3); body capsules from the skeleton (Task 4); the validators and `scene3d` consume the same primitives (`frameProps` feeds both).
- §8.3: equipment meshes from the same parameters, illustrative label (viewer note, gallery), studio lighting unchanged; arrows composited into WebP (D11, Task 7) and drawn as an SVG overlay in the viewer (Task 6).
- §8.4: pre-render every figure × 3 frames at 175 cm with illustrative equipment, cached by a hash of skeleton/model, pose output (covers the figure spec and equipment defaults) and renderer version (Task 7); the interactive viewer re-renders at a stature, animates and orbits, and falls back to the pre-renders (Task 6; the profile's stature and measurements are wired in M4). Print capture is M4.
- §9, §9.3: review pages under `/en/` and `/zh/` with the base path; no third-party requests (smoke test covers the new pages); 375 px checks (Task 8).
- §11: WebGL unavailable or model failure → pre-rendered frames (Task 6 viewer, Task 8 tests).
- §12: no bypassed stops or catches (bar travel, including the safety catches), no equipment through structure or the body (bench-rack, implement), attachments used as designed (the hold-down's Nordic-curl use, the footplate at its column).
- §14: pose/geometry unit tests incl. every validator (Tasks 1–5); figure sweep with no errors or warnings, and a Play timing budget (Task 6); WebGL-off end-to-end for the Smith squat and a library figure (Task 8); the human look gate (Task 15, controller only, a hard stop), with an early non-blocking look after Task 8.
- §15: CI runs the sweep in `npm test` and the cached render; deploy renders with the same cache (Task 7).
- Issues: #47 decided by default (controller decision 3), put to the owner at the gate with options (a), (b) and (c) and a rendered comparison, and closed with the owner's choice (Task 15); #74 both items (Task 14: `figureIds` test, posed envelopes).
- §7.1 via the engine: posed envelopes for every figure, typical stature 175 cm, pull-up bar height from the profile or typical values (Task 14).

**Placeholder scan.** Every code step contains complete files or exact replacements taken from the dry-run tree. `<issue>` is the number from the Task 0 table, filled in at execution time. No step says "add tests", "similar to", or leaves a value to be decided; tuning guidance in the figure tasks applies only if a later edit breaks a frame.

**Type consistency.** `PointRef`, `ArmGoal`, `LegGoal`, `HandPose`, `BodyContact` (with `along` and `loose`), `PropTouch`, `ArmGoal.hinge`, `wristBendDeg`, `PoseOptions`, `FrameProps` (`cable.hand: Side | 'both'`), `PoseFigureSpec`, `PoseSolution` (`k`, `handTargets`, `footTargets`, `smithBar`), `GripKind`/`gripKind`, `FigureModel` (`scene(sk, ctx)`, `camera(ctx)`, `pose(sk, frame, ctx)`), `PosedFigure` (`topCm`, `smithBarCm`), `FigureMeta`, `EquipmentModel` (`drawsWith`), `SceneSpec`/`SceneParams`, `ProbeInput.pullUpBarHeightCm` and `Finding['check']` are used with the same names and shapes in every task. `FIGURES` changes type once (Task 6) and every consumer moves in that task.

**Dry run (2026-09-30, after the plan review).** A script extracted this plan's code blocks and applied them task by task (every Create, Replace, Edit and Delete, and the Task 8 `git mv`) to a scratch clone of `main` at 2e6d71e (#81), outside the repository. The replayed tree is identical to the tree the figures were tuned in.
- After every task: `tsc --noEmit`, `vitest run` and `eslint .` passed, with the per-file counts each task states (total tests after Tasks 1–8: 448, 459, 490, 503, 524, 554, 557, 557; after Tasks 9–14: 577, 607, 625, 649, 668, 679).
- Task 6: `astro check` 0 errors; `render:figures` (still on the M1 harness protocol) rendered the dumbbell curl and the Smith squat, whose frames pass the Task 1 Step 6 comparison with `main`'s render (frame 0: max 15 levels, 0.012% of values off by more than 8; frame 1: max 6; frame 2 identical); 44 end-to-end tests passed.
- Task 8: 52 end-to-end tests passed, including the WebGL-off fallback for the Smith squat and the dumbbell curl, the model-failure fallback and zero errors and warnings in the check table.
- After Task 16: 45 test files and 679 tests passed (the sweep is 120 of them: 20 figures × 5 statures, each covering the keyframes and in-between poses with no errors or warnings, and 20 Play budget tests: every unvalidated in-between pose at every stature runs the solver at most 5 times; the most any figure needed was 4, the side plank 3 now that its forearm settles on the mean end gap, at about 1.8 ms a pose locally); 0 lint problems; `astro check` 0 errors and 0 warnings; `astro build` built 50 pages (only the expected "templates" warning); a cold `render:figures` produced all 80 images (60 frames, 20 stills) in about 1.5 min locally, and a second run took all 80 from the cache; 52 end-to-end tests passed. Task 15's `hinge: false` comparison was rendered too, and the flagged curl passes the sweep.
- Every figure's frames were rendered and inspected after the review changes (curl dumbbells beside the thighs, straight wrists on the presses and the Pallof press, the deadlift's gaze, the upright stretch with the pelvis tucked, the whole body in frame).
- Not dry-run: the GitHub side (issues, the `actions/cache` step on hosted runners, the deploy), CI's timing with software WebGL on runners, and the owner's answers (Tasks 8 and 15).

### Execution note (Task 2 review)

The cardio machines in Task 2's code were changed so no part floats (checked by a connectivity test): the treadmill deck now reaches its top (`deckTopCm`) so the belt sits on it, and its rails end at the deck's edge; the rower's fan is 37 cm across (`fanRadiusCm` 18.5, new `fanCentreYCm` 40), the rail runs into the fan cage, and the front foot sits under a new `rower-fan-stand`; the bike gains a `bike-bottom-bracket` tube that carries the crank, and its seat tube runs up into the saddle. No later task reads these dimensions: every name, anchor and surface keeps its value (`treadmill.belt`, `rower.seat`, `rower.handle` at y 48, `rower.footplates`, `bike.saddle`, `bike.handlebars`, `bike.crank`), and Tasks 3 and 7 and 9-13 use none of the cardio constants.

> **Execution note (Task 3 review):** spotter arms sit against the uprights' inner faces (centre `X − u/2 − 2.5`, clear of the Smith rail by 1.5 cm) and hang from sleeves `spotter-sleeve-{left|right}-{front|back}` around each upright; a stations test asserts arm → sleeve → upright contact and rail clearance. The trainer's weight stacks are tied to the frame, the bench's rear foot bar reaches the wheels, and attachment stills hang from a cable to the pulley stub (connectivity tests).

> **Execution note (Task 4 review):** two fixes change the Task 4 code above; the plan's code blocks elsewhere are updated where later data depended on them.
> - **The hip is read from the pelvis bone's own orientation**, not the `pelvis − spine_03` line: `jointAngles` rotates the rest trunk line with the pelvis (`RigFrame.trunkLineLocal`), so an authored spine bend no longer counts as hip flexion (about 28% of it leaked in on the real rig). Standing still reads 0, the hinge and `sagittalBendDeg` are unchanged, and the Smith squat's hip readings are unchanged (to 5e-7°; it bends no spine bones), so its limits and pre-renders are unchanged. Figures that bend the spine now read their true hip angle: on the real rig, the ab-wheel rollout reads 49.6° at `start` (was 52.9), the ball crunch 12.3° at `crunch` (was 20.7 at 175 cm), the Romanian deadlift 100.1° at `hinge` (was 101.8), and the half-kneeling stretch's back hip −20.44° at `shift`/`reach` (was −19.33), past the −20° limit. Task 12's stretch therefore drops `pitchDeg: -4` from `shift` and `reach` (the trunk keeps the `-3` of `set`), which reads −19.44° at every stature; the limit is not loosened.
> - **An ambiguous palm hint throws** instead of silently choosing a grip: `solvePose` throws `frame "<id>": the left|right hand's palm hint [...] is nearly perpendicular to both palm sides, so overhand or underhand is ambiguous` when a bar grip's hint is within about 14.5° of perpendicular to both palm sides (`|dot| < PALM_HINT_MIN = 0.25`, exported from `solvePose.ts`), and `... lies nearly along the forearm` for a free hand whose hint is within 14.5° of the forearm (the old fallback to +Y/+Z is gone). The check runs on the solver's last pass, so it applies to in-between poses too (Play and the sweep): a palm hint that turns between two keyframes must stay clear of the band throughout. Every figure in Tasks 8–13 was solved on both rigs at all five statures with this check; only Task 11's Pallof press tripped it (`set`: |dot| 0.09 on the synthetic rig, 0.35 on the real one, so the rigs chose opposite grips). Its hints are now `[-1, 0, -1]` / `[1, 0, -1]` (toward the other hand and back toward the chest), which picks the same side the real rig already drew (the solved real-rig pose is identical) with margins above 0.45 everywhere.
> - Smaller fixes: an ab-wheel hand with `alongCm: 0` throws (it named no handle); a two-hand single handle whose grips coincide lies across the left palm instead of along rounding noise; `SMITH_BAR_PART` is exported from `geometry/trainer.ts` and re-exported by `pose/props.ts` (same name and pattern).

> **Execution note (Task 4 re-review):** the hip flexor stretch keeps its pelvis tuck (`pitchDeg: −4` on `shift` and `reach`, so the pelvis moves on the "Tuck the pelvis" cue) and instead moves the rear knee to `bodyCm [−11, 0, −54]` (was −55). With the pelvis-based hip reading this measures about −19.15° (real rig) and −18.72° (synthetic), inside the −20° limit. This supersedes the earlier note that removed `pitchDeg: −4`.

> **Execution note (Task 5 review):** the review's three Important findings change the Task 5 code above (spec §8.1 and §14 govern; no limit is loosened).
> - **Toes.** `footPoints` (body.ts) also returns `toe`: the toe tip, `TOE_LENGTH_CM` = 7 (exported; at 175 cm, scaled by stature ÷ 175: a foot about 15% of stature with the ball at about 73% of its length from the heel) past the ball, at sole level, along the `ball_` bone (in line with the foot, or along the surface for a raised heel). The skeleton ends at the ball, so this point is the toes. The floor and hanging-clearance checks read it through `Object.values(footPoints(...))`; the foot capsule still runs heel to ball.
> - **Overlaps.** New `overlapDepth(a, b)` in `geometry/primitives.ts`: symmetric; the larger of `penetrationDepth` both ways and the diameter of the largest ball inside both primitives, found on a lattice (0.25–1 cm, a quarter of the thinner part's thickness, at most 6000 points) through the overlap of their bounding boxes, with an early exit when the boxes are apart. `implement` (held implement against equipment) and `bench-rack` use it with the same 0.5 cm threshold, so a rail, bar or tube through a dumbbell, plate or bench is caught wherever it pierces it (the review's probe missed 280 of 360 placements; now 0). `capsuleDepth` samples each capsule's axis every 1 cm (was 7 points) behind a bounding-box test. `validatePose` is about 10× faster than before (about 0.3 ms a frame on the Smith press with a bench, synthetic rig).
> - **Smaller changes.** `feet-flat` uses `CONTACT_TOLERANCE_CM` (1 cm, decision 5; was a bare 1.5). `bar-on-rail` compares the hands with the scene's `smith.rail` anchor (both X and Z), not the solver's `smithBar`, so a caller whose `railZCm` disagrees with the drawn rail fails. A `free` hand takes the `held` wrist limit (documented).
> - **For Tasks 6–14:** the figures in this plan were dry-run against the looser checks, and in-between frames stay unchecked until Task 6's sweep runs. Known consequence: `db-curl` `start` at 150 cm (real rig) sank each thigh 2.1 cm into its dumbbell head, which the stricter overlap check flags; its start hands move out from `bodyCm` x 8 to 10 (Task 6 code above; the Task 6 review moved it from 9 for height headroom: clean 150–200 cm, first warning at 140 cm). The pull-up does *not* need an `expectedFailures` entry: its toes clear the floor by 25.0 cm (190 cm) and 15.4 cm (200 cm) under the 210 cm bar, and an entry for a case that passes turns the sweep red. If the sweep flags any other frame (a heel lifted 1–1.5 cm on a flat foot, an implement or bench grazing a thin frame member, a thin bar across a limb), move the pose or the equipment, or declare the touch if it is real. Do not loosen a limit.

> **Execution note (Task 9 review):** a pose figure's Smith safety catches can now follow the bar, per stature.
> - `SceneSpec.trainer` takes `catchBelowLowestBarCm` (`geometry/scene.ts`; `buildScene` ignores it). `poseFigure` then solves the keyframes against the placed equipment, takes the lowest Smith bar and draws the catches that far below it (`catchHeightFor(p, lowest, belowCm)`, whose new third argument defaults to `catchBelowBottomCm`). That figure's `scene(sk, ctx)` is built once per skeleton, stature and set of dimensions; figures without it still build one scene per set of dimensions. The camera target resolves against the placed equipment (no `smith.catch`). A figure that sets it but moves no Smith bar throws.
> - `smith-bench-press` uses `catchBelowLowestBarCm: 3` instead of the fixed `catchHeightCm: 60`, so the catches sit 3 cm below the bar at the chest at every stature (64.6–72.8 cm at 150–200). Its bar at `lower` is `bodyCm [0, 16.5, 0]` (was 18), the bench offset is the named `BENCH_Z_CM`, and the camera is `azimuthDeg 25, elevationDeg 50, distanceCm 450`, target `smith.rail` + `[0, 70, 8]`. `db-incline-press` uses one elbow pole `[0.8, -1, 1]` in all three frames, and `press` holds the hands at `[14, 32, 20]` (was `[19, 29, 9]` with pole `[1, -0.5, -0.2]`).
> - New `src/lib/figure/fixtures/press-figures.test.ts` pins the catch setting and the elbow and forearm angles of both presses (13 tests; `figures.test.ts` gains 1). Later tasks: a Smith figure that should show catches (Task 14's probes read `FIGURES`, Task 16 documents `SceneSpec`) should use `catchBelowLowestBarCm`; no later task in this plan sets a fixed `catchHeightCm` on a figure.
