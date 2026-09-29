# Healthy-Living Platform — Fitness v1 Design

- **Date:** 2026-09-29
- **Status:** Approved in brainstorming; pending written-spec review
- **Scope:** Platform foundation + Fitness section. Nutrition and daily tracking get their own specs later.

## 1. Summary

A bilingual (English / 简体中文) static website hosted on GitHub Pages that grows into a platform for every
aspect of healthy living. Version 1 delivers the **Fitness** section:

- **Equipment modules** — how a class of equipment works, how to adjust it safely, and what training it supports.
- **Exercise library** — every exercise illustrated with **three realistic 3D-rendered frames** that are
  mechanically validated against equipment geometry and room constraints.
- **Illustrated guide** — eight sections (chest, back, shoulders, arms, squat/lunge, hinge/glutes/calves, core,
  setup/safety/warm-up) showing the exercises in the user's plan.
- **Weekly planner** — pick a template split; the engine fills each slot with an exercise that fits the user's
  equipment, space and time budget; the user can swap picks.
- **PDF export** — weekly overview, daily sessions, progression rules and guide pages.

The repository holds **only generic knowledge**. Everything personal (profile, measurements, plans) lives in the
visitor's browser.

## 2. Goals and non-goals

### Goals

1. Generic, reusable content: a new piece of equipment is added as data files, not new pages.
2. Accuracy over decoration: no exercise is recommended or illustrated if the user's equipment, bar travel,
   bench fit or ceiling height makes it impossible or unsafe.
3. Practical output: short evening sessions (typically 25–35 min) that fit a time budget including setup changes.
4. Full EN / 中文 support for every page, cue, guide and PDF.
5. Privacy by construction: nothing personal is ever committed, built, uploaded or transmitted.
6. Extensible: nutrition, sleep and daily tracking plug in as new areas without reworking fitness.

### Non-goals (v1)

- Nutrition/diet, supplements, shopping lists, daily tracking or workout logging.
- Accounts, servers, cross-device sync (JSON export/import covers portability).
- A custom template editor (built-in templates + per-slot swaps only).
- Body-shape customization of the 3D human beyond stature.
- Floor-space planning for the room (only ceiling height and equipment geometry are modeled).

## 3. Decisions log

| # | Decision | Chosen | Why |
|---|----------|--------|-----|
| D1 | Where personal data lives | Browser `localStorage` + JSON export/import | Public repo, no server; nothing personal is published |
| D2 | User photos | Reference only — source of truth for geometry; never published | Keeps home/brands off a public site; content stays generic |
| D3 | Language | Full EN / 中文 toggle for all UI and content | Owner request; `zh` means Simplified Chinese (`zh-Hans`) |
| D4 | Schedule generation | Templates with pattern slots + constraint-aware fill + swaps | Predictable, testable, safe |
| D5 | Illustration technique | Rigged 3D human + parametric 3D equipment, driven by renderer-independent pose data | 2D vector figures were judged not realistic enough; 3D keeps validation |
| D6 | Stack | Astro + TypeScript, Preact islands, GitHub Actions → Pages | Static content pages + small interactive tools; build-time content validation; built-in i18n routing |
| D7 | PDF | Print-optimized route + browser "Save as PDF" | Native CJK font support, crisp output, zero PDF dependencies |
| D8 | Project tracking | GitHub milestones, labels, issues; one PR per issue | Owner request |
| D9 | Setup positions | Words on public pages ("chest height"); approximate hole numbers only in personal plans, computed from the user's own measurements | Practical beside the machine without inventing settings |
| D10 | Cable loads | Shown as the numbers printed on the stack; the cable ratio is optional and never guessed | Plans use RIR, so the ratio isn't needed |

## 4. Architecture

### 4.1 Repository layout

```
ai_health/
├─ docs/
│  ├─ architecture.md
│  ├─ content-authoring.md          # how to add equipment, attachments, exercises, templates
│  ├─ figure-pipeline.md            # how the 3D human is generated and exported
│  └─ superpowers/specs/            # design specs (this file)
├─ assets-src/
│  └─ human/                        # Blender/MPFB generation script, export settings, LICENSE (CC0)
├─ public/
│  └─ models/human.glb              # exported, compressed human model (committed, target ≤ 8 MB)
├─ scripts/
│  └─ render-figures.ts             # pre-renders exercise frames with headless Chromium
├─ src/
│  ├─ content/                      # GENERIC knowledge only, validated at build time
│  │  ├─ equipment/                 # one YAML per equipment class
│  │  ├─ attachments/               # one YAML per attachment
│  │  ├─ exercises/                 # one YAML per exercise (requirements, text, figure frames)
│  │  ├─ templates/                 # weekly splits made of pattern slots
│  │  └─ guides/{en,zh}/            # long-form MDX (safety, warm-up, choosing weights, equipment guides)
│  ├─ lib/                          # pure TypeScript — no DOM, no Astro, no storage → unit-testable
│  │  ├─ areas.ts                   # area registry (fitness today; nutrition/tracking later)
│  │  ├─ engine/                    # feasibility, slot filling, ranking, time estimates, short sessions
│  │  ├─ figure/
│  │  │  ├─ pose/                   # skeleton, keyframes, IK, rail solver, ROM limits, validators
│  │  │  ├─ geometry/               # equipment + body collision proxies from parameters
│  │  │  └─ scene3d/                # three.js: human rig, equipment meshes, lighting, camera, render
│  │  ├─ profile/                   # profile schema, storage adapter, import/export, migrations
│  │  └─ i18n/                      # UI dictionaries + helpers
│  ├─ components/                   # Astro components + Preact islands (viewer, planner, wizard)
│  └─ pages/[lang]/…                # /en/… and /zh/…
├─ tests/e2e/                       # Playwright; unit tests are colocated with the code they test
└─ .github/
   ├─ workflows/ci.yml, deploy.yml
   └─ ISSUE_TEMPLATE/feature.yml, content.yml, bug.yml
```

### 4.2 Boundaries

- `lib/engine`, `lib/figure/pose` and `lib/figure/geometry` are pure functions. They run at build time
  (static pages, figure sweep in CI) and in the browser (planner, viewer) unchanged.
- `lib/figure/scene3d` is the only module that depends on three.js/WebGL. Swapping the renderer changes nothing else.
- `lib/profile` is the only module that touches `localStorage`. Everything else receives a `Profile` value.
- Pages read content through Astro content collections; they never parse YAML themselves.
- New areas add `src/content/<area>/`, `src/lib/<area>/`, `src/pages/[lang]/<area>/` and one entry in
  `lib/areas.ts`. The home page and navigation are generated from the registry. No placeholder pages ship for
  areas that do not exist yet.

## 5. Content model

All user-facing text is `I18n = { en: string; zh: string }`. The build fails if either language is missing.
IDs are kebab-case and unique per collection. All cross-references are checked at build time.
The YAML below is abbreviated: `…` marks text omitted from the example, not missing requirements.

### 5.1 Equipment

```yaml
# src/content/equipment/smith-functional-trainer.yaml
id: smith-functional-trainer
kind: station                     # station | bench | free-weight | cardio | accessory
name: { en: Smith machine + functional trainer, zh: 史密斯机综合训练器 }
capabilities: [smith-bar, rack-uprights, j-hooks, safety-catches, cable-column, pull-up-bar]
parameters:                       # measured by the user; never invented
  holeNumbering:           { type: holes, how: { en: "If the uprights are numbered: floor to the center of the lowest and highest numbered holes, and their numbers", zh: "…" } }
  smithLowestBarHeightCm:  { type: cm,   how: { en: "Lower the bar onto its bottom stop; measure floor to top of bar", zh: "…" } }
  smithHighestBarHeightCm: { type: cm,   how: { en: "…", zh: "…" } }
  smithRailAngleDeg:       { type: deg,  how: { en: "0 = vertical rails", zh: "…" } }
  rackInnerDepthCm:        { type: cm,   how: { en: "…", zh: "…" } }
  rackInnerWidthCm:        { type: cm,   how: { en: "…", zh: "…" } }
  rackHeightCm:            { type: cm,   how: { en: "…", zh: "…" } }
  pullUpBarHeightCm:       { type: cm,   how: { en: "Floor to top of the pull-up bar", zh: "…" } }
  safetyCatchMinHeightCm:  { type: cm,   how: { en: "…", zh: "…" } }
  cableColumns:            { type: count, how: { en: "Number of independent pulley columns", zh: "…" } }
  pulleyPositions:         { type: enum-set, values: [high, chest, low], how: { en: "…", zh: "…" } }
  pulleyHoleRange:         { type: holes-range, optional: true, how: { en: "Adjustable carriages: lowest and highest hole the carriage pins into", zh: "…" } }
  cableStack:              { type: stack, how: { en: "First and last number printed on the stack, the step, and the unit", zh: "…" } }
  cableRatio:              { type: enum, values: ["1:1", "2:1", "4:1", unknown], optional: true, how: { en: "From the manual; leave unknown if unsure", zh: "…" } }
  benchFitsInsideRack:     { type: bool, how: { en: "Can the bench, backrest included, sit fully between the uprights at every angle you use?", zh: "…" } }
illustrativeDefaults:             # used only for drawing when unmeasured; always labeled "illustrative"
  smithLowestBarHeightCm: 40
  smithRailAngleDeg: 0
  rackInnerDepthCm: 90
  # …
model3d: smith-functional-trainer # parametric builder id in lib/figure/geometry + scene3d
guide: smith-functional-trainer   # MDX: parts, adjustment, hooks/catches, safety, supported training
```

Rules:

- `parameters` describe what can be measured. Values live only in the user's profile.
- `illustrativeDefaults` exist so generic pages can draw the equipment. They are never used for feasibility.
- Public content describes pulley, J-hook and catch positions in words (high / chest height / low). Hole numbers
  appear only in a user's personal plan, computed from their own measurements (§7.5).
- Cable loads are shown as the numbers printed on the stack, in the stack's unit. `cableRatio` is optional and
  never guessed.
- Parameter types: `cm`, `deg`, `bool`, `count`, `enum`, `enum-set`, `holes` (first/last hole number and
  height; linear spacing, validated as increasing), `holes-range` (min/max hole number), `stack`
  (first, last, step, unit `lb` or `kg`) and `weights` (a list of owned loads with a unit, e.g. dumbbell pairs).

v1 equipment: `smith-functional-trainer`, `adjustable-bench`, `dumbbells`, `barbell` (with bumper plates),
`resistance-bands`, `treadmill`, `rowing-machine`, `exercise-bike`, plus the small tools the owner confirms
(e.g. foam roller, massage ball, ab wheel, exercise ball, balance trainer).

### 5.2 Attachments

```yaml
id: rope
name: { en: Rope attachment, zh: 绳索把手 }
fits: [cable-column]
model3d: rope
```

v1 attachments: `rope`, `close-grip-row-handle`, `single-handle`, `lat-bar`, `ankle-strap`, `row-footplate` and
`roller-hold-down` (a fixed kneeling pad with rollers). Nothing else is assumed: no leg-extension/curl attachment,
dip station or landmine unless added as content and owned in the profile. Exercises that use the roller hold-down
declare how (Nordic curl, sit-up anchor or thigh restraint), and owners exclude any use their attachment doesn't
support.

### 5.3 Exercise

```yaml
id: smith-squat
name: { en: Smith Machine Squat, zh: 史密斯机深蹲 }
pattern: squat
muscles: { primary: [quadriceps, glutes], secondary: [adductors, spinal-erectors] }
requires:
  capabilities: [smith-bar]
  attachments: []
tags: []                          # unilateral | isometric | low-impact
jointStress: { knee: moderate, lowBack: moderate, shoulder: low, wrist: low }   # low | moderate | high
guideSection: lower-squat         # one of the eight guide sections
setupState: { station: smith }    # station: smith | cable | bench | floor | barbell | cardio
                                  # plus benchAngleDeg and/or pulley (high | chest | low) where relevant
setupSeconds: 60
repSeconds: 4                     # average tempo, for time estimates
setup:    { en: "…", zh: "…" }    # bench position, cable height in words, foot placement
cues:     [ { en: "…", zh: "…" }, { en: "…", zh: "…" } ]     # 2–3
mistakes: [ { en: "…", zh: "…" } ]
warmup:   { en: "…", zh: "…" }    # exercise-specific preparation
safety:   { en: "…", zh: "…" }    # optional
alternatives: [goblet-squat, db-split-squat]
figure:
  camera: { azimuthDeg: 35, elevationDeg: 8 }   # one camera for all three frames
  scene:  { equipment: [smith-functional-trainer], barLoad: plates-medium }
  frames:
    - label: { en: Unrack, zh: 出杠 }
      cue:   { en: Rotate the bar off the hooks and brace, zh: "…" }
      joints: { hip: [0, 0, 0], knee: [4, 0, 0], … }        # partial; unspecified joints stay neutral
      anchors: [ { part: hands, to: smith-bar }, { part: feet, to: floor }, { part: upper-back, to: smith-bar } ]
      arrows:  [ { along: smith-rail, direction: down } ]
    - label: { en: Bottom, zh: 最低点 } …
    - label: { en: Drive up, zh: 起身 } …
```

- Frame phases fit the movement (e.g. setup / loaded / finish, or setup / hold / alignment check for isometrics).
  There are always exactly three.
- `unilateral` exercises render the working side nearest the camera and show a "both sides" badge.
- Cardio-machine sessions (treadmill, rower) may omit `figure`; every strength, core and mobility exercise has one.

### 5.4 Movement patterns

`horizontal-push`, `incline-push`, `vertical-push`, `horizontal-pull`, `vertical-pull`, `squat`, `lunge`,
`hip-hinge`, `hip-extension`, `knee-flexion`, `calf`, `elbow-flexion`, `elbow-extension`, `shoulder-abduction`,
`rear-delt`, `core-anti-extension`, `core-anti-rotation`, `core-flexion`, `core-lateral`, `cardio-steady`,
`cardio-intervals`, `mobility`.

### 5.5 Template

```yaml
id: split-6day-push-legs-core-pull-full-mobility
name: { en: "6-day split: push / legs / cardio+core / pull / full body / mobility", zh: "…" }
days:
  - weekday: mon
    kind: strength                # strength | cardio-core | mobility | rest
    focus: { en: Upper-body push, zh: 上肢推 }
    minutes: 35
    slots:
      - { pattern: horizontal-push, sets: 3, reps: [8, 10],  rir: 2, restSec: 90, priority: 1 }
      - { pattern: vertical-push,   sets: 2, reps: [10, 12], rir: 2, restSec: 75, priority: 2 }
      - { pattern: elbow-extension,    sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3 }
      - { pattern: shoulder-abduction, sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3, supersetWith: 2 }
  - weekday: sun
    kind: rest
```

- `pattern` may be a list (any of these patterns can fill the slot).
- `reps` may be `{ seconds: 30 }` for holds and intervals.
- `supersetWith` is a zero-based slot index on the same day. The engine keeps the pairing only when both picks
  share a station; otherwise the two slots run as straight sets.
- The full-body day is volume-capped (at most 10 working sets, all at RIR ≥ 2) so it does not compete with the
  other strength days.

v1 templates: the 6-day split above (default) and a 3-day full-body split.

## 6. Profile (browser only)

```ts
type Profile = {
  version: 1;
  locale: 'en' | 'zh';
  units: { length: 'cm' | 'in'; mass: 'kg' | 'lb' };        // display only; storage is metric
  statureCm?: number;
  room: { ceilingHeightCm?: number; clearanceMarginCm: number /* default 10 */ };
  equipment: { id: string; params: Record<string, number | boolean | string[]> }[];
  attachments: string[];
  exclusions: string[];                                     // exercise ids the user never wants
  limitations: ('knee-sensitive' | 'shoulder-sensitive' | 'low-back-sensitive' | 'wrist-sensitive')[];
  schedule: { templateId: string; sessionMinutes: number; overrides: Record<string, string> /* "mon/0" → exerciseId */ };
};
```

- Stored under `localStorage` key `aih.profile`. Every read goes through the Zod schema. Every schema change bumps
  `version` and adds a migration.
- Export produces a JSON file; import validates before overwriting anything.
- No age, weight, name or free-text health notes are collected in v1.

## 7. Engine (`lib/engine`)

### 7.1 Feasibility

`checkFeasibility(exercise, profile, catalog) → { status, reasons[], missing[] }`

| Status | Meaning |
|---|---|
| `feasible` | All checks pass |
| `infeasible` | At least one check fails; `reasons` explains each (localized) |
| `needs-info` | A check depends on an unmeasured parameter; `missing` lists what to measure and how |

Checks, in order:

1. Required capabilities are provided by owned equipment.
2. Required attachments are owned and fit an owned capability.
3. Not in the user's `exclusions`.
4. **Geometry:** the exercise's frames are posed at the profile's stature by `lib/figure/pose` and validated
   against the profile's measurements: ceiling clearance (head, hands, implements + margin), bar travel versus
   the lower and upper stops, bench fit inside the rack, and the joint range-of-motion limits.

Unknown inputs never pass silently:

- Unknown stature → every geometry check returns `needs-info` (the wizard asks for stature first).
- Unknown ceiling height → assume a 210 cm ceiling; exercises whose envelope plus margin exceeds that are
  `needs-info`, and the rest pass.
- An unmeasured equipment parameter → only the checks that depend on it return `needs-info`.

`limitations` never change feasibility. They affect ranking and add safety notes.

### 7.2 Filling a week

`buildWeek(template, profile, catalog) → Week`

For each slot in each day:

1. Candidates are exercises whose pattern matches and whose feasibility is `feasible`.
   (`needs-info` candidates are listed separately with what to measure.)
2. A user override for that slot wins if it is still feasible. Otherwise it is dropped with a notice.
3. Ranking (highest first, deterministic tie-break by id):
   - +3 same station as the previous pick of the day (fewer transitions)
   - +2 for each declared limitation whose joint has `low` stress (e.g. `knee-sensitive` → `jointStress.knee: low`)
   - −3 for each declared limitation whose joint has `high` stress
   - −2 already used earlier in the week for another slot
4. An unfillable slot stays in the week as an empty slot with reasons and "what would unlock it".

### 7.3 Time estimate and budget

`minutes = warm-up + Σ sets × (reps × repSeconds + restSec) + transitions`

A transition (`setupSeconds` of the incoming exercise) is charged whenever `setupState` changes: station,
bench angle or pulley height. If a day exceeds
its budget, the planner shows a warning and a one-click "fit to time", which removes priority-3 slots first,
then trims sets on priority-2 slots.

### 7.4 Short session

`shortSession(day)` keeps up to three priority-1 slots at 2 sets each with RIR ≥ 3. It is used for poor sleep,
little time or incomplete recovery.

### 7.5 Personal setup numbers

When a station's `holeNumbering` is measured, the planner converts each exercise's descriptive setup heights into
the nearest hole number for the user's stature. For example, `pulley: chest` becomes chest height from the pose
layer's standing skeleton, then the nearest hole, shown as "≈ hole 17 (chest height)". The same applies to J-hooks
and safety catches. Hole numbers appear only in personal views and the PDF. If the ideal height is outside the
carriage's `pulleyHoleRange`, the planner shows the nearest reachable hole and flags it.

### 7.6 Starting weight and progression (content + UI copy)

- Week 1 is calibration: choose a load you could lift for the top of the rep range with about 3–4 reps in reserve.
- Double progression: when every working set reaches the top of the rep range at the target RIR, increase by the
  smallest available increment next session. Otherwise, add reps first.
- Owned loads come from the profile (dumbbell `weights`, `cableStack` step). When the next available load is more
  than about 15% heavier, progress first with extra reps, an extra set or a slower lowering phase, then move up.
- Warm-up sets are light and listed separately from working sets.

## 8. Figure system (`lib/figure`)

### 8.1 Pose layer (`pose/`) — pure TypeScript

- **Skeleton:** bone hierarchy, rest offsets and bone names are **extracted from the human glTF rig at build time**
  into `skeleton.json`. The pure-TS layer and the 3D renderer therefore share one skeleton. It is scaled
  uniformly to the stature.
- **Keyframes:** partial joint rotations + anchors (`hands → smith-bar`, `feet → floor`, `hips → bench-seat`,
  `upper-back → smith-bar`).
- **Solvers:** two-bone IK for arms and legs with pole vectors; a rail constraint that adjusts trunk/hip angles so a
  Smith bar stays on its rail; floor contact for feet.
- **Range-of-motion limits:** per-joint ranges (e.g. elbow flexion 0–145°).
- **Hanging exercises** use a bent-knee hang when the bar is below the user's standing overhead reach. The feet must
  clear the floor in the hang, and the head must clear the ceiling at the top.
- **Validators** (`error` fails CI, `warn` is reported):

| Check | Severity |
|---|---|
| Anchored parts within 1 cm of their targets (hands on grip, feet on floor) | error |
| Smith bar on its rail and within its stops | error |
| Bone lengths constant across frames | error |
| Joint angles within ROM limits | error |
| Head, hands and implements below the ceiling minus margin (profile only) | error |
| Feet clear the floor in hanging positions | error |
| Bench does not intersect rack parts; implements do not intersect the frame | error |
| Body proxies do not interpenetrate equipment except at declared contacts | warn |

### 8.2 Geometry layer (`geometry/`) — pure TypeScript

It turns equipment parameters into collision proxies (boxes, cylinders, capsules): uprights, rails, bar, plates,
stops, catches, bench (seat + backrest at angle), cable column, pulleys, dumbbells and attachments. It also
provides body capsules derived from the skeleton. The validators and `scene3d` both consume the same geometry, so
what is checked is what is drawn.

### 8.3 3D layer (`scene3d/`) — three.js

- **Human:** a realistic rigged human generated in Blender with MPFB (MakeHuman) using CC0 assets: base mesh,
  skin, neutral athletic clothing, short hair. Exported to glTF with mesh compression and compressed textures.
  The generation script and settings live in `assets-src/human/`, so the model can be reproduced. The `.blend`
  file is not committed.
- **Equipment:** meshes built from the same parameters as the geometry layer. Unmeasured values use
  `illustrativeDefaults`, and the view shows an "illustrative dimensions" label.
- **Look:** studio lighting, soft contact shadows, neutral floor. On profile renders, the ceiling is drawn as a
  translucent plane.
- **Annotations:** arrows and labels are an SVG overlay positioned by projecting 3D points to the screen. Text is
  never baked into images, so one render serves both languages and stays crisp.
- **Stretch goal:** tint the target muscles.

### 8.4 Rendering paths

| Path | When | Output |
|---|---|---|
| Pre-render | Build (CI) | `scripts/render-figures.ts` drives headless Chromium (software WebGL) to render every exercise × 3 frames at the default stature (175 cm) with illustrative equipment. It writes WebP plus overlay JSON. Results are cached by a hash of skeleton, model, figure spec, equipment defaults and renderer version. |
| Interactive viewer | Exercise pages, planner | A lazy-loaded Preact island re-renders at the profile's stature and measurements, animates between frames (▶), and allows orbiting the camera. It falls back to the pre-renders without WebGL. |
| Print capture | "Export PDF" | Renders the needed frames off-screen at the profile's stature into images for the print page, falling back to the pre-renders. |

## 9. Pages and UX

Every route exists under `/en/` and `/zh/`. The base path is `/ai_health/`.

| Route | Content |
|---|---|
| `/` | Picks a locale from the browser language (with plain links as fallback) |
| `/[lang]/` | Home: one card per registered area |
| `/[lang]/fitness/` | Fitness overview |
| `/[lang]/fitness/equipment/` and `/[id]/` | Equipment module: what it is; parts and accessories (labeled 3D view); safe adjustment (hooks, catches, pulley pins, stops); how to measure each parameter; supported exercises grouped by pattern, with ✅ ❌ ❓ badges when a profile exists |
| `/[lang]/fitness/exercises/` and `/[id]/` | Library with filters (muscle, pattern, equipment, "fits my setup"). Exercise page: 3 frames + viewer, setup, dose guidance, RIR target, cues, mistakes, warm-up, alternatives, safety notes |
| `/[lang]/fitness/guide/[section]` | The eight guide sections. Each shows the exercises in the current plan by default, with a toggle for all |
| `/[lang]/fitness/planner/` | Wizard → template → generated week → swaps → export |
| `/[lang]/fitness/planner/print` | Print layout |
| `/[lang]/settings` | Language, units, export / import / reset data |
| `/[lang]/safety` | Disclaimer and "stop and get checked" red flags |

### 9.1 Planner flow

1. **Wizard** (first visit, editable later): stature, ceiling height, owned equipment and attachments, equipment
   measurements (each may be "not measured yet"), limitations, session length, template.
2. **Week view:** a compact overview, then detailed days. Each pick shows why it was chosen and has a ⇄ swap that
   lists only feasible alternatives. Also shown: excluded exercises with reasons, the time estimate and any
   over-budget warning.
3. **Per-day "short session" toggle.**
4. Auto-save to the browser. Buttons: **Export PDF**, **Export JSON**, **Import JSON**.

### 9.2 Print / PDF

- `@page` supports A4 and Letter; every day and guide section starts on a new sheet.
- Order: week overview → one sheet per training day → starting-weight and progression rules → guide sections
  (only exercises in the plan, two exercises per sheet, three large frames each) → safety red flags.
- Fonts come from the system stack (PingFang SC / Microsoft YaHei / Noto Sans CJK), so no fonts are downloaded.

### 9.3 Design system

Plain CSS with custom properties (colors, spacing, type scale), light and dark themes, mobile-first layout,
WCAG AA contrast and keyboard-accessible controls. No runtime third-party requests: no CDNs, web fonts or
analytics.

## 10. Internationalization and units

- Astro i18n routing: locales `en` and `zh` (Simplified Chinese), both prefixed. The toggle maps the current page to
  its counterpart.
- UI strings live in typed dictionaries (`lib/i18n/en.ts`, `zh.ts`); a missing key is a type error.
- Content fields are `I18n` objects checked by Zod. MDX guides must exist in both `guides/en/` and `guides/zh/`
  (a build check).
- Units are converted for display only; profiles and content are stored in metric.

## 11. Error handling

| Situation | Behavior |
|---|---|
| Saved profile fails validation | Raw copy kept under `aih.profile.backup.<timestamp>`; banner offers Import or Reset; the site keeps working |
| `localStorage` unavailable | Planner runs in memory; banner says changes won't be saved and suggests export |
| Invalid import file | Field-level errors in the current language; nothing is overwritten |
| Slot has no feasible exercise | Empty slot with reasons and what would unlock it |
| Day over time budget | Warning + "fit to time" |
| Override no longer feasible | Dropped with a notice; slot refilled |
| WebGL unavailable or model fails to load | Pre-rendered frames |
| Older profile version | Migrated on load; the migration is covered by tests |

## 12. Safety and content policy

- Site-wide notice: educational content, not medical advice.
- The safety page and every PDF list red flags that mean stop and seek medical care: chest pain or pressure;
  new or returning numbness, tingling or weakness; joint swelling, locking or giving way; dizziness or fainting.
- Limitations re-rank exercises and add notes. They never diagnose.
- Exercises are only illustrated in configurations the equipment genuinely supports. No figure shows a
  bypassed stop, an unsupported attachment or equipment moved through structure.
- Program content tuned for a specific person is finalized only after a safety-screening conversation in chat.
  Screening answers are never committed.

## 13. Privacy rules

- No personal data in the repository, issues, pull requests, commit messages, test fixtures or build logs.
  Fixtures use synthetic profiles.
- Personal photos are used only in private chat sessions as geometry references. They are never committed or
  attached to issues.
- The site makes no network requests with profile data. There are no analytics.

## 14. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Engine | Vitest | Feasibility tri-state for every check, ranking, overrides, unfillable slots, time estimates, fit-to-time, short session |
| Pose / geometry | Vitest | IK accuracy, rail solver, ROM limits, every validator (positive and negative fixtures) |
| Profile | Vitest | Schema, migrations, import error messages, backup-on-corruption |
| i18n | Vitest + build | Dictionary parity, `I18n` completeness, MDX pairs |
| Content integrity | Build (Zod + cross-reference checks) | Every reference resolves; every template pattern has at least one exercise |
| Figure sweep | Vitest in CI | Every exercise × frame × stature {150, 165, 175, 190, 200} passes validators with illustrative equipment, or declares an expected infeasibility with a reason |
| End-to-end | Playwright | Every route in both languages without console errors; wizard → week → swap → print; JSON round-trip; 375 px viewport; WebGL-off fallback |

Visual approval of the 3D look is a human gate (milestone M1). Automated screenshot diffs are deferred until the
figures stabilize.

## 15. CI/CD and hosting

- `ci.yml` (pull requests): typecheck, lint, unit tests, content checks, figure sweep, build, Playwright.
- `deploy.yml` (push to `main`): build, pre-render figures (cached), deploy to GitHub Pages with
  `actions/deploy-pages`. Site URL: `https://tomqwu.github.io/ai_health/`.
- Pages source is set to "GitHub Actions".

## 16. Project tracking

**Milestones**

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 Foundation | Astro scaffold, layout and design system, i18n, area registry, CI/CD, Pages deploy, `docs/` | Empty bilingual site live on Pages; CI green |
| M1 3D figure spike | Human model pipeline, Smith machine geometry + mesh, pose layer with skeleton extraction, IK and rail solver, validators, 3 frames of `smith-squat`, pre-render + viewer on an unlisted page | **Owner sign-off on the look** (`gate:user-review`) |
| M2 Content model & engine | Zod schemas, catalog loader, feasibility, week builder, time estimates, short session, profile module | Engine tests green on synthetic profiles |
| M3 Figure system | Generalized pose library, all equipment builders, viewer island, pre-render pipeline in CI, figure sweep | Sweep green; viewer works with and without WebGL |
| M4 Planner & PDF | Wizard, week view, swaps, settings, import/export, print route | E2E flow green; PDF reviewed by owner |
| M5 Smith module & program | Equipment guides, v1 exercises (templates + alternatives) in EN/中文 with figures, eight guide sections, both templates | Owner's setup produces a feasible, in-budget week; guide and PDF reviewed |

A separate **Roadmap** issue tracks future areas (nutrition, daily tracking). It has no milestone and no code.

**Labels:** `area:platform`, `area:fitness`, `area:figures`, `type:feature`, `type:content`, `type:docs`,
`type:bug`, `gate:user-review`.

**Issue templates:** feature, content (new equipment / exercise: includes the measurement checklist and a notice
not to attach personal photos), bug.

**Workflow:** one branch and PR per issue (`Closes #N`), squash-merged when CI is green. Issues labeled
`gate:user-review` wait for the owner's sign-off.

**Planning:** implementation plans are written per milestone, not for the whole spec. The first plan covers M0
and M1. Later plans are written after the M1 gate, because the spike may refine the figure design.

## 17. Inputs needed from the owner

1. **Photos** of the home setup (received 2026-09-29 in a private session; used as geometry reference only).
   Still useful: a side view of the Smith rails and a view of the bench inside the rack.
2. **Measurements:** the parameters listed in §5.1 (starting with the hole numbering, lowest Smith bar height,
   pull-up bar height and ceiling above it, inner depth and width) plus bench seat height, backrest length and
   available backrest angles. Any can be marked "not measured yet".
3. **Which small tools and roller hold-down uses** to include, and whether free-barbell safeties exist (before M5).
4. **Screening answers** (chat only) before M5 program content is finalized.

## 18. Definition of done (v1)

1. Site live at `https://tomqwu.github.io/ai_health/` in EN and 中文.
2. The Smith machine + functional trainer module is complete, with a labeled 3D parts view and measuring guide.
3. Every v1 exercise has three validated 3D frames and complete bilingual text.
4. A profile matching the owner's setup produces a week with no infeasible picks and every session within budget.
5. The PDF contains the overview, daily sessions, rules, guide sections and red flags, and is readable when printed.
6. CI is green, and the repository contains no personal data.
