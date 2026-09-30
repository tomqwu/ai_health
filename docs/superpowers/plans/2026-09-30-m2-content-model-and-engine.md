# M2 Content Model & Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: approved, 2026-09-30.** The owner answered the draft's open questions; the answers and spec decision D12 (equipment measurements are never required) are recorded in [Owner decisions (2026-09-30)](#owner-decisions-2026-09-30) and applied to every task below. Tasks 8 and 9 are written against the pose layer as merged in #45 (issue #40).

**Goal:** Validated generic content (Zod schemas + Astro content collections + a cross-checked catalog), a browser-only profile module, and a pure planning engine (feasibility, week builder, time estimates, fit-to-time, short session), with engine tests green on synthetic profiles (spec §16 M2 exit criterion).

**Architecture:** Zod schemas in `src/lib/content` define the content model once; `src/content.config.ts` feeds them to Astro content collections, and `src/catalog.ts` (the only Astro-aware piece) builds a cross-checked `Catalog` that fails the build on any broken reference. `src/lib/profile` owns the profile schema, migrations, JSON import/export and the only `localStorage` adapter. `src/lib/engine` is pure TypeScript: it takes a `Profile` and a `Catalog` and returns localizable `Message` objects, never finished strings; geometry checks pose exercises through "probes" (the M1 Smith-squat solver today, the M3 pose library later). Unmeasured stature, ceiling and equipment dimensions fall back to typical values (D12), so every check has an answer and nothing waits on a measurement.

**Tech Stack:** Astro 7.3.5 content collections (`glob` loader, `src/content.config.ts`), Zod 4.6.5 (new direct dependency, same version Astro 7.3.5 bundles), TypeScript 6.0.3, Vitest 5.0.2, the M1 pose layer (`src/lib/figure/pose`), typed i18n dictionaries (`src/lib/i18n/{en,zh}.ts`).

**Spec:** `docs/superpowers/specs/2026-09-29-fitness-platform-design.md` (§4–§7, §10–§14, §16: this plan covers M2 only).

## Global Constraints

Copied from the spec unless marked *(plan)*. Every task's requirements include this section.

- Stack as installed: Astro **7.3.5**, TypeScript **6.0.3** (do not install TypeScript 7), Vitest **5.0.2**, Node ≥ 22.12.0. *(plan)* Add Zod as `"zod": "4.6.5"` (exact). `astro@7.3.5` depends on `zod ^4.5.4` and Astro's `BaseSchema` is `zod/v4/core`, so schemas built with our Zod work in `defineCollection` unchanged. Use `import { z } from 'zod'` in `src/lib/**`, never `astro/zod` or `astro:content`.
- §4.2: "`lib/engine`, `lib/figure/pose` and `lib/figure/geometry` are pure functions. They run at build time … and in the browser (planner, viewer) unchanged."
- §4.2: "`lib/profile` is the only module that touches `localStorage`. Everything else receives a `Profile` value."
- §4.2: "Pages read content through Astro content collections; they never parse YAML themselves." *(plan)* `src/content.config.ts` and `src/catalog.ts` are the only files that import `astro:content`; nothing under `src/lib/**` imports Astro, the DOM or three.js.
- §5: "All user-facing text is `I18n = { en: string; zh: string }`. The build fails if either language is missing. IDs are kebab-case and unique per collection. All cross-references are checked at build time."
- §3 D12: "Equipment measurements (2026-09-30): Never required. Plans and guides describe general movements and setups for each device type; geometry checks use typical (illustrative) dimensions, and a user can optionally enter their own. Hole numbers (§7.5) are dropped from v1."
- §5.1: "`parameters` describe what can be measured. Values live only in the user's profile, and none is ever required (D12): nothing prompts for them." "`illustrativeDefaults` are the equipment's typical values (D12). Generic pages draw them, labeled "illustrative", and feasibility (§7.1) uses them for every parameter the user has not measured. The build fails if a parameter that a geometry check reads (`smithLowestBarHeightCm`, `smithHighestBarHeightCm`, `pullUpBarHeightCm`, `benchFitsInsideRack`) has no illustrative default."
- §5.1: "Smith bar heights (the stops and every bar height the engine compares with them) are measured from the floor to the centre of the bar, the same datum as the geometry layer."
- §5.1: "Pulley, J-hook and catch positions are described in words (high / chest height / low), in public content and in personal plans alike. There are no hole numbers in v1 (D9, D12)." "Cable loads are shown as the numbers printed on the stack, in the stack's unit. `cableRatio` is optional and never guessed."
- §5.3: "Cardio-machine sessions (treadmill, rower) may omit `figure`; every strength, core and mobility exercise has one."
- §5.5: "`supersetWith` is a zero-based slot index on the same day. The engine keeps the pairing only when both picks share a station; otherwise the two slots run as straight sets." "The full-body day is volume-capped (at most 10 working sets, all at RIR ≥ 2)."
- §9.1: "optional stature, ceiling height and limitations. No equipment measurements are asked for (D12)." *(plan)* The profile keeps `equipment[].params` as optional overrides of the typical dimensions; nothing in M2 prompts for them.
- §6: "Stored under `localStorage` key `aih.profile`. Every read goes through the Zod schema. Every schema change bumps `version` and adds a migration." "Export produces a JSON file; import validates before overwriting anything." "No age, weight, name or free-text health notes are collected in v1."
- §7.1 unknown inputs (D12): "Unknown stature → pose at a typical adult stature (175 cm); figures and checks say "typical height"." "Unknown ceiling height → assume a 240 cm ceiling. Exercises whose envelope plus margin exceeds it stay plannable but carry a localized "check overhead clearance" note." "An unmeasured equipment parameter → the equipment's `illustrativeDefaults` are used; the build guarantees one for every parameter a geometry check reads (§5.1)." "Every input can be defaulted, so there is no "needs info" status in v1." "`limitations` never change feasibility. They affect ranking and add safety notes." `checkFeasibility(exercise, profile, catalog) → { status, reasons[], notes[] }` with status `feasible | infeasible`.
- §7.2: "A pick carries its feasibility `notes` before any limitation safety notes." "The `Week` also lists its `assumptions`: localized messages saying which typical values stood in for unknown inputs (a typical height, an assumed ceiling)".
- §7.2 ranking: "+3 same station as the previous pick of the day; +2 for each declared limitation whose joint has `low` stress; −3 for each declared limitation whose joint has `high` stress; −2 already used earlier in the week for another slot", "deterministic tie-break by id".
- §7.3: "`minutes = warm-up + Σ sets × (reps × repSeconds + restSec) + transitions`". "A transition (`setupSeconds` of the incoming exercise) is charged whenever `setupState` changes: station, bench angle or pulley height." Fit to time "removes priority-3 slots first, then trims sets on priority-2 slots."
- §7.4: "`shortSession(day)` keeps up to three priority-1 slots at 2 sets each with RIR ≥ 3."
- §10: "UI strings live in typed dictionaries (`lib/i18n/en.ts`, `zh.ts`); a missing key is a type error." "Content fields are `I18n` objects checked by Zod." "Units are converted for display only; profiles and content are stored in metric."
- §11: "Saved profile fails validation → Raw copy kept under `aih.profile.backup.<timestamp>`"; "`localStorage` unavailable → Planner runs in memory"; "Invalid import file → Field-level errors in the current language; nothing is overwritten"; "Older profile version → Migrated on load; the migration is covered by tests".
- §13: "No personal data in the repository, issues, pull requests, commit messages, test fixtures or build logs. Fixtures use synthetic profiles." "The site makes no network requests with profile data." *(plan)* No equipment brand or model names anywhere. Every number in fixtures and content is invented or illustrative; never copy a measurement the owner shared in chat.
- §14 testing: unit tests are colocated with the code they test; Engine: "Feasibility (feasible / infeasible, typical-value fallbacks) for every check, ranking, overrides, unfillable slots, time estimates, fit-to-time, short session"; Profile: "Schema, migrations, import error messages, backup-on-corruption"; Content integrity: "Every reference resolves; every template pattern has at least one exercise".
- *(plan)* Out of scope: pages, wizard, planner UI, PDF and §7.6 progression (M4); the generalized pose library, other equipment builders and the figure sweep (M3); v1 exercise, template and guide content (M5). §7.5 hole numbers are not in v1 at all (D12), so M2 has no hole-numbering parameter types or parameters.
- *(plan)* Test ceilings: a room that is "tall enough" is a standard 8 ft ceiling, `8 * 30.48` = 243.84 cm (named `EIGHT_FT_CEILING_CM` in the engine fixtures, as in the pose tests); only deliberately low ceilings use other values.
- Git (as in M0/M1): one branch + PR per issue (`m2/<issue#>-<slug>`), PR body contains `Closes #N`, squash-merge when CI is green. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Wait for CI with the app's PR tools, not by polling `gh`.

## Owner decisions (2026-09-30)

The owner approved the draft's 16 open questions as proposed, except where spec decision D12 (committed to the spec as 9bc5df7; §5.1, §7.1, §7.2 and §7.5 aligned with it in 3f285ef) supersedes them. Tasks refer to these by number.

1. **Profile parameter values** use the §5.1 parameter value types (`ParamValue`), not `number | boolean | string[]`.
2. **Figures:** exercises reference a figure by id, `figure: { spec: <id> }`, until M3 settles the generalized pose format.
3. **Geometry before M3:** exercises without a pose model use a conservative envelope (standing = stature; `vertical-push` = 1.33 × stature; with a pull-up bar = bar height + 0.13 × stature) and no joint-range check. Smith-bar exercises without a pose model are never planned. Stature and bar height come from the profile or, when unmeasured, from typical defaults (D12).
4. **Time estimates:** reps at the top of the range; unilateral work counts both sides; a 5-minute warm-up; the first exercise's setup counts; a kept superset skips the first exercise's rest.
5. **Daily budget** = the shorter of the template day's `minutes` and the profile's `sessionMinutes`.
6. **Full-body cap:** a `fullBody: true` day flag, checked at build time (≤ 10 working sets, RIR ≥ 2 on every slot).
7. **Bench inside the rack** applies when an exercise uses a bench angle at the `smith` or `barbell` station.
8. **Fields beyond the spec:** a bilingual `label` on every parameter; `uses` on attachments with `requires.attachmentUses` on exercises; `rir` optional on slots.
9. **Enum value labels:** raw values in M2; M4 adds EN/中文 labels.
10. **Owned loads** (stacks, dumbbells) are stored as printed, in lb or kg, never converted; lengths are stored in cm.
11. **Pull-ups** use the `smith` station (same machine); no `pull-up-bar` station.
12. **Superseded by D12.** An unknown stature poses at a typical 175 cm. It never returns `needs-info` and never empties the week.
13. **§7.6 progression** moves to M4 with the planner UI. **§7.5 hole numbers** are dropped from v1 entirely (D12), not moved to M4: setups are described in words only.
14. **Seed content:** three generic equipment classes (Smith + functional trainer, adjustable bench, dumbbells), the seven v1 attachments and the Smith squat (without alternatives); no templates until M5.
15. **Vocabularies:** guide sections chest, back, shoulders, arms, lower-squat, lower-hinge, core, setup-safety; the 20 muscle ids in `vocab.ts`; bench angle stops 0–90° in 15° steps.
16. **Corrupt saved profile:** the raw text is copied to `aih.profile.backup.<timestamp>` and `aih.profile` is removed.

**D12 applied (equipment measurements are never required):**
- Unknown stature → `TYPICAL_STATURE_CM = 175`. Unknown ceiling → `ASSUMED_CEILING_CM = 240`; an exercise whose envelope plus margin exceeds it stays feasible and carries the note `engine.note.checkClearance` (EN + 中文). A *measured* ceiling that is too low still makes the exercise infeasible.
- An unmeasured (or wrongly typed) equipment parameter → the equipment's `illustrativeDefaults`. The catalog requires an illustrative default of the right type for every parameter the geometry checks read (`GEOMETRY_PARAMS`, `GEOMETRY_PARAM_TYPES`), and requires equipment providing `smith-bar`, `rack-uprights` or `pull-up-bar` to define the parameters those checks read (`CAPABILITY_GEOMETRY_PARAMS`, Task 8). If a Smith stop or the bench-fit answer still cannot be resolved, the check fails safe (`engine.reason.stopsUnknown` / `engine.reason.benchFitUnknown`): an exercise that may not fit is never silently allowed.
- `needs-info` is dropped (YAGNI; nothing in v1 needs it): `FeasibilityStatus = 'feasible' | 'infeasible'`, and there is no `MissingInfo`, `Feasibility.missing`, `measure` unlock, `SlotPlan.needsInfo` or `engine.missing.*` string. `Feasibility.notes` carries non-blocking notes instead.
- `buildWeek` returns `Week.assumptions`: localizable messages saying the plan uses a typical height or an assumed ceiling (spec §7.1: checks say "typical height").
- No hole numbers: the `holes` and `holes-range` parameter types and the `holeNumbering` and `pulleyHoleRange` parameters are gone. Because nothing is required, the parameter definition's `optional` flag is gone too.
- The profile keeps optional `statureCm`, `room.ceilingHeightCm` and `limitations`; `equipment[].params` are optional overrides that nothing prompts for.
- One datum for Smith bar heights: floor to the **centre** of the bar, as in the geometry layer's `SmithParams.lowestBarHeightCm` / `highestBarHeightCm`. The stop parameters' `how` text (EN + 中文), their typical values (40 / 180 cm, equal to `ILLUSTRATIVE_SMITH`), `GEOMETRY_PARAMS` and `ProbeResult.barCentersCm` all use it, so the engine compares like with like.

**Pose layer as merged in #45:** Task 9 poses each Smith-squat frame with `checkFigureFrame(sk, spec, frame, { statureCm, smith: ILLUSTRATIVE_SMITH })`, the single helper that solves and validates from one set of inputs, instead of calling `solveSmithSquat` and `validateSmithSquat` separately. Its signed ROM findings, including the documented magnitude-only elbow exception for the Smith squat, become the engine's ROM check; its anchor, feet-flat, bar-on-rail and bone-length findings become the pose check. Bar travel and ceiling are checked by the engine against the profile's or the typical values, with localized messages.

## File Map

```
package.json, package-lock.json                       (Task 1: add zod 4.6.5)
src/lib/content/vocab.ts                              closed vocabularies (patterns, stations, joints, geometry params, …)
src/lib/content/common.ts                             Id, ParamName and I18nText schemas
src/lib/content/params.ts (+ params.test.ts)          parameter definitions and value types
src/lib/content/schemas.ts (+ schemas.test.ts)        equipment, attachment, exercise, template schemas
src/lib/content/catalog.ts (+ catalog.test.ts)        buildCatalog(): index, cross-reference checks, typical defaults present
src/lib/units.ts (+ units.test.ts)                    metric ⇄ display conversion
src/lib/i18n/format.ts (+ format.test.ts)             Message type, formatMessage, formatLength/Mass/Load
src/lib/i18n/{en,zh}.ts                               + unit, joint, engine and profile strings
src/content.config.ts                                 Astro collections using the Zod schemas
src/catalog.ts                                        loadCatalog(): the only astro:content reader
src/content/equipment/{smith-functional-trainer,adjustable-bench,dumbbells}.yaml
src/content/attachments/{rope,close-grip-row-handle,single-handle,lat-bar,ankle-strap,row-footplate,roller-hold-down}.yaml
src/content/exercises/smith-squat.yaml
src/content/templates/                                (empty until M5)
src/pages/[lang]/fitness/index.astro                  calls loadCatalog() so the build checks content
src/lib/profile/schema.ts (+ schema.test.ts)          Profile schema, defaultProfile()
src/lib/profile/migrate.ts (+ migrate.test.ts)        version migrations
src/lib/profile/parse.ts                              migrate + validate + field errors
src/lib/profile/transfer.ts (+ transfer.test.ts)      JSON export / import
src/lib/profile/storage.ts (+ storage.test.ts)        ProfileStore: localStorage or memory, backups
src/lib/profile/index.ts                              public API
src/lib/engine/types.ts                               Feasibility (feasible | infeasible), Reason, Unlock
src/lib/engine/params.ts                              paramValue(): measured or typical; owned capabilities, providers
src/lib/engine/geometry.ts (+ geometry.test.ts)       typical stature/ceiling, ceiling, bar travel, bench fit, ROM; probe types
src/lib/engine/probes.ts (+ probes.test.ts)           Smith-squat probe via checkFigureFrame; DEFAULT_PROBES
src/lib/engine/feasibility.ts (+ feasibility.test.ts) checkFeasibility()
src/lib/engine/plan.ts (+ plan.test.ts)               SlotPlan/DayPlan/Week, estimateDay, fitToTime
src/lib/engine/week.ts (+ week.test.ts)               rankCandidates, limitationNotes, buildWeek
src/lib/engine/shortSession.ts (+ shortSession.test.ts)
src/lib/engine/index.ts                               public API
src/lib/engine/testing/fixtures.ts                    synthetic catalog, template and profiles
src/lib/engine/scenarios.test.ts                      M2 exit criterion on synthetic profiles
docs/architecture.md, docs/content-authoring.md
```

Dependency order: 1 → 3 → 4 → 5; 1 + 2 → 6 → 7; 1–6 → 8 → 9 → 10 → 11 → 12 → 13 → 14. Task 5 can run in parallel with Tasks 6–7.

---

### Task 0: GitHub tracking

No code. The M2 milestone and the M2 epic (#17) already exist. Issue #40 (pose robustness, same milestone) is closed; Tasks 8 and 9 already use the pose API it merged (`checkFigureFrame`, signed ROM limits, `SmithParams`).

| Task | Issue title | Labels | Milestone | Issue # |
|---|---|---|---|---|
| 1 | Content vocabularies, Zod and parameter types | area:fitness, type:feature | M2 Content model & engine | #48 |
| 2 | Localized engine messages and unit conversion | area:platform, type:feature | M2 Content model & engine | #49 |
| 3 | Content schemas: equipment, attachments, exercises, templates | area:fitness, type:feature | M2 Content model & engine | #50 |
| 4 | Catalog builder with cross-reference checks | area:fitness, type:feature | M2 Content model & engine | #51 |
| 5 | Content collections, generic seed content and build-time checks | area:fitness, type:content | M2 Content model & engine | #52 |
| 6 | Profile schema, migrations and JSON import/export | area:fitness, type:feature | M2 Content model & engine | #53 |
| 7 | Profile storage adapter (localStorage, memory, backups) | area:fitness, type:feature | M2 Content model & engine | #54 |
| 8 | Engine geometry checks with typical defaults | area:fitness, type:feature | M2 Content model & engine | #55 |
| 9 | Smith squat geometry probe | area:fitness, area:figures, type:feature | M2 Content model & engine | #56 |
| 10 | Feasibility | area:fitness, type:feature | M2 Content model & engine | #57 |
| 11 | Time estimates and fit to time | area:fitness, type:feature | M2 Content model & engine | #58 |
| 12 | Week builder | area:fitness, type:feature | M2 Content model & engine | #59 |
| 13 | Short session and engine API | area:fitness, type:feature | M2 Content model & engine | #60 |
| 14 | Synthetic-profile scenarios and docs (M2 exit) | area:fitness, type:docs | M2 Content model & engine | #61 |

> Task numbers in the table are the plan's task numbers below (Task 1 … Task 14).

- [ ] **Step 1: Create one issue per row**

For each row (body = the task's goal and its "Done when" line):
```bash
gh issue create --repo tomqwu/ai_health --title "<Issue title>" --label "<labels comma-separated>" --milestone "M2 Content model & engine" \
  --body $'Plan: docs/superpowers/plans/2026-09-30-m2-content-model-and-engine.md — Task <N>\nPart of #17\n\nDone when: <acceptance line>'
```
Write each printed number into the table.

- [ ] **Step 2: Commit the plan with the issue numbers**

The plan (and spec decision D12) live on branch `docs/m2-plan`, whose pull request (#44) is still a draft.
```bash
git checkout docs/m2-plan && git pull
git add docs/superpowers/plans/2026-09-30-m2-content-model-and-engine.md
git commit -m $'docs(plans): add the M2 issue numbers\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push
gh pr edit 44 --repo tomqwu/ai_health --title "docs: M2 content model & engine plan, spec D12"
gh pr ready 44 --repo tomqwu/ai_health
```
Merge when CI is green: `gh pr merge 44 --repo tomqwu/ai_health --squash --delete-branch && git checkout main && git pull`.

**Every later task** starts with `git checkout main && git pull && git checkout -b m2/<issue>-<slug>` and ends with the commit/PR/merge step shown in it; replace `<issue>` with the number from the table.

---
### Task 1: Content vocabularies, Zod and parameter types

Adds Zod and the building blocks every schema shares: closed vocabularies, id and text schemas, and the equipment parameter types of spec §5.1 with their stored-value shapes. D12 drops hole numbers from v1, so the two hole types (`holes`, `holes-range`) are left out, leaving eight types; and since no measurement is ever required, parameter definitions have no `optional` flag.

**Files:**
- Modify: `package.json`, `package-lock.json` (add `zod`)
- Create: `src/lib/content/vocab.ts`, `src/lib/content/common.ts`, `src/lib/content/params.ts`
- Test: `src/lib/content/params.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `vocab.ts`: `PATTERNS`/`Pattern`, `CARDIO_PATTERNS`, `EQUIPMENT_KINDS`, `STATIONS`/`Station`, `RACK_STATIONS`, `PULLEY_POSITIONS`, `EXERCISE_TAGS`, `JOINTS`/`Joint` (`'knee' | 'lowBack' | 'shoulder' | 'wrist'`), `STRESS_LEVELS`, `LIMITATIONS`/`Limitation`, `LIMITATION_JOINT: Record<Limitation, Joint>`, `GUIDE_SECTIONS`, `MUSCLES`, `WEEKDAYS`/`Weekday`, `DAY_KINDS`/`DayKind`, `LOAD_UNITS`/`LoadUnit`, `GEOMETRY_PARAMS`/`GeometryParam` (`'smithLowestBarHeightCm' | 'smithHighestBarHeightCm' | 'pullUpBarHeightCm' | 'benchFitsInsideRack'`: the parameters the engine's geometry checks read).
  - `common.ts`: `IdSchema` (kebab-case), `ParamNameSchema` (camelCase), `I18nTextSchema` (`{ en, zh }`, both non-empty, `zh` must contain Chinese characters).
  - `params.ts`: `PARAM_TYPES` (`cm`, `deg`, `bool`, `count`, `enum`, `enum-set`, `stack`, `weights`), `ParamDefSchema`/`ParamDef` (discriminated on `type`; every def has `label` and `how`; `enum`/`enum-set` have `values`), `ParamValueSchema`/`ParamValue`, `StackValue`, `WeightsValue`, `paramValueSchema(def): z.ZodType`, `paramValueMatches(def, value): value is ParamValue`.

- [ ] **Step 1: Branch and add Zod**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-content-vocab
npm install --save-exact zod@4.6.5
```
Expected: `package.json` gains `"zod": "4.6.5"` under `dependencies`; `npm ls zod` shows `zod@4.6.5` once (deduped with `astro`). No other dependency changes.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { I18nTextSchema, IdSchema, ParamNameSchema } from './common';
import { type ParamDef, ParamDefSchema, paramValueMatches } from './params';

const text = { en: 'Measure it', zh: '测量它' };
const def = (d: Record<string, unknown>): ParamDef => ParamDefSchema.parse({ label: text, how: text, ...d });

describe('common schemas', () => {
  it('accepts kebab-case ids only', () => {
    expect(IdSchema.safeParse('smith-functional-trainer').success).toBe(true);
    for (const bad of ['Smith', 'smith_bar', '-smith', 'smith-', '']) expect(IdSchema.safeParse(bad).success, bad).toBe(false);
  });
  it('accepts camelCase parameter names only', () => {
    expect(ParamNameSchema.safeParse('smithLowestBarHeightCm').success).toBe(true);
    expect(ParamNameSchema.safeParse('smith-lowest').success).toBe(false);
  });
  it('requires both languages, and Chinese characters in zh', () => {
    expect(I18nTextSchema.safeParse(text).success).toBe(true);
    expect(I18nTextSchema.safeParse({ en: 'Only English' }).success).toBe(false);
    expect(I18nTextSchema.safeParse({ en: 'Squat', zh: '  ' }).success).toBe(false);
    expect(I18nTextSchema.safeParse({ en: 'Squat', zh: 'Squat' }).success).toBe(false);
  });
});

describe('ParamDefSchema', () => {
  it('requires values for enum types', () => {
    expect(ParamDefSchema.safeParse({ type: 'enum', label: text, how: text }).success).toBe(false);
    expect(def({ type: 'enum', values: ['1:1', 'unknown'] }).type).toBe('enum');
  });
  it('rejects unknown types and unknown keys', () => {
    expect(ParamDefSchema.safeParse({ type: 'inch', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'cm', label: text, how: text, unit: 'cm' }).success).toBe(false);
  });
  it('has no hole types and no optional flag (D12: no hole numbers, nothing required)', () => {
    expect(ParamDefSchema.safeParse({ type: 'holes', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'holes-range', label: text, how: text }).success).toBe(false);
    expect(ParamDefSchema.safeParse({ type: 'cm', label: text, how: text, optional: true }).success).toBe(false);
  });
});

describe('paramValueMatches', () => {
  it('checks scalar types', () => {
    expect(paramValueMatches(def({ type: 'cm' }), 42.5)).toBe(true);
    expect(paramValueMatches(def({ type: 'cm' }), -1)).toBe(false);
    expect(paramValueMatches(def({ type: 'cm' }), '42')).toBe(false);
    expect(paramValueMatches(def({ type: 'deg' }), 5)).toBe(true);
    expect(paramValueMatches(def({ type: 'deg' }), 120)).toBe(false);
    expect(paramValueMatches(def({ type: 'bool' }), false)).toBe(true);
    expect(paramValueMatches(def({ type: 'count' }), 2)).toBe(true);
    expect(paramValueMatches(def({ type: 'count' }), 1.5)).toBe(false);
  });
  it('checks enum and enum-set membership', () => {
    const e = def({ type: 'enum', values: ['1:1', '2:1', 'unknown'] });
    expect(paramValueMatches(e, '2:1')).toBe(true);
    expect(paramValueMatches(e, '3:1')).toBe(false);
    const s = def({ type: 'enum-set', values: ['high', 'chest', 'low'] });
    expect(paramValueMatches(s, ['high', 'low'])).toBe(true);
    expect(paramValueMatches(s, ['high', 'high'])).toBe(false);
    expect(paramValueMatches(s, ['middle'])).toBe(false);
  });
  it('checks stacks and weights', () => {
    const stack = def({ type: 'stack' });
    expect(paramValueMatches(stack, { first: 5, last: 80, step: 5, unit: 'kg' })).toBe(true);
    expect(paramValueMatches(stack, { first: 80, last: 5, step: 5, unit: 'kg' })).toBe(false);
    expect(paramValueMatches(stack, { first: 5, last: 80, step: 5, unit: 'stone' })).toBe(false);
    const w = def({ type: 'weights' });
    expect(paramValueMatches(w, { unit: 'kg', loads: [2, 4, 6, 8] })).toBe(true);
    expect(paramValueMatches(w, { unit: 'kg', loads: [4, 2] })).toBe(false);
    expect(paramValueMatches(w, { unit: 'kg', loads: [] })).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/content/params.test.ts`
Expected: FAIL — `Failed to resolve import "./common"`.

- [ ] **Step 4: Implement**

`src/lib/content/vocab.ts`:
```ts
/**
 * Closed vocabularies shared by the content schemas, the profile and the engine (spec §5–§7).
 * Adding a value here is a content-model change: update the spec and the i18n dictionaries with it.
 */

/** Spec §5.4. */
export const PATTERNS = [
  'horizontal-push',
  'incline-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'squat',
  'lunge',
  'hip-hinge',
  'hip-extension',
  'knee-flexion',
  'calf',
  'elbow-flexion',
  'elbow-extension',
  'shoulder-abduction',
  'rear-delt',
  'core-anti-extension',
  'core-anti-rotation',
  'core-flexion',
  'core-lateral',
  'cardio-steady',
  'cardio-intervals',
  'mobility',
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Cardio-machine patterns: the only exercises allowed to omit `figure` (spec §5.3). */
export const CARDIO_PATTERNS: readonly Pattern[] = ['cardio-steady', 'cardio-intervals'];

export const EQUIPMENT_KINDS = ['station', 'bench', 'free-weight', 'cardio', 'accessory'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const STATIONS = ['smith', 'cable', 'bench', 'floor', 'barbell', 'cardio'] as const;
export type Station = (typeof STATIONS)[number];

/** Stations whose bench work happens between the rack uprights (drives the bench-fit check). */
export const RACK_STATIONS: readonly Station[] = ['smith', 'barbell'];

export const PULLEY_POSITIONS = ['high', 'chest', 'low'] as const;
export type PulleyPosition = (typeof PULLEY_POSITIONS)[number];

export const EXERCISE_TAGS = ['unilateral', 'isometric', 'low-impact'] as const;
export type ExerciseTag = (typeof EXERCISE_TAGS)[number];

export const JOINTS = ['knee', 'lowBack', 'shoulder', 'wrist'] as const;
export type Joint = (typeof JOINTS)[number];

export const STRESS_LEVELS = ['low', 'moderate', 'high'] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

/** Spec §6. Limitations re-rank and add notes; they never change feasibility. */
export const LIMITATIONS = ['knee-sensitive', 'shoulder-sensitive', 'low-back-sensitive', 'wrist-sensitive'] as const;
export type Limitation = (typeof LIMITATIONS)[number];

export const LIMITATION_JOINT: Readonly<Record<Limitation, Joint>> = {
  'knee-sensitive': 'knee',
  'shoulder-sensitive': 'shoulder',
  'low-back-sensitive': 'lowBack',
  'wrist-sensitive': 'wrist',
};

/** The eight guide sections (spec §1). */
export const GUIDE_SECTIONS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'lower-squat',
  'lower-hinge',
  'core',
  'setup-safety',
] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export const MUSCLES = [
  'chest',
  'lats',
  'upper-back',
  'traps',
  'front-delts',
  'side-delts',
  'rear-delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'spinal-erectors',
  'glutes',
  'quadriceps',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'hip-flexors',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const DAY_KINDS = ['strength', 'cardio-core', 'mobility', 'rest'] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const LOAD_UNITS = ['lb', 'kg'] as const;
export type LoadUnit = (typeof LOAD_UNITS)[number];

/**
 * Equipment parameters the engine's geometry checks read (spec §7.1 check 4). D12: when the user has not
 * measured one, the engine uses the equipment's illustrative default, so the catalog requires a default
 * for each of these on every equipment that defines it.
 *
 * Datum: the Smith bar heights (`smithLowestBarHeightCm`, `smithHighestBarHeightCm`) are floor to the centre
 * of the bar, the same datum as `SmithParams.lowestBarHeightCm` / `highestBarHeightCm` in the geometry layer
 * and as the bar heights the engine's probes report.
 */
export const GEOMETRY_PARAMS = ['smithLowestBarHeightCm', 'smithHighestBarHeightCm', 'pullUpBarHeightCm', 'benchFitsInsideRack'] as const;
export type GeometryParam = (typeof GEOMETRY_PARAMS)[number];
```

`src/lib/content/common.ts`:
```ts
import { z } from 'zod';

/** Kebab-case id, unique per collection (spec §5). */
export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case');

/** camelCase equipment parameter name, e.g. `smithLowestBarHeightCm`. */
export const ParamNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase');

const CJK = /[㐀-鿿]/;

/** User-facing text in both languages (spec §5: the build fails if either is missing). */
export const I18nTextSchema = z.strictObject({
  en: z.string().trim().min(1),
  zh: z.string().trim().min(1).regex(CJK, 'zh text must contain Chinese characters'),
});
```

`src/lib/content/params.ts`:
```ts
import { z } from 'zod';
import { I18nTextSchema } from './common';
import { LOAD_UNITS } from './vocab';

/** Spec §5.1 parameter types, without the hole-numbering types (D12: no hole numbers in v1). */
export const PARAM_TYPES = ['cm', 'deg', 'bool', 'count', 'enum', 'enum-set', 'stack', 'weights'] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

const LoadUnitSchema = z.enum(LOAD_UNITS);

/** A weight stack as printed: first and last number, the step between plates, and the printed unit. */
export const StackValueSchema = z
  .strictObject({ first: z.number().positive(), last: z.number().positive(), step: z.number().positive(), unit: LoadUnitSchema })
  .refine((v) => v.last > v.first, { message: 'last must be greater than first' });
export type StackValue = z.output<typeof StackValueSchema>;

/** Owned loads (e.g. dumbbell pairs) in their printed unit, strictly increasing. */
export const WeightsValueSchema = z
  .strictObject({ unit: LoadUnitSchema, loads: z.array(z.number().positive()).min(1) })
  .refine((v) => v.loads.every((x, i) => i === 0 || x > v.loads[i - 1]!), { message: 'loads must be strictly increasing' });
export type WeightsValue = z.output<typeof WeightsValueSchema>;

/** Any stored parameter value; `paramValueSchema(def)` narrows it to one definition. */
export const ParamValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.array(z.string()),
  StackValueSchema,
  WeightsValueSchema,
]);
export type ParamValue = z.output<typeof ParamValueSchema>;

const base = {
  label: I18nTextSchema,
  how: I18nTextSchema,
};
const Values = z.array(z.string().min(1)).min(1);

/**
 * How to measure one equipment parameter (spec §5.1). Values live only in the user's profile, and none is
 * ever required (D12): an unmeasured parameter uses the equipment's illustrative default.
 */
export const ParamDefSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('cm'), ...base }),
  z.strictObject({ type: z.literal('deg'), ...base }),
  z.strictObject({ type: z.literal('bool'), ...base }),
  z.strictObject({ type: z.literal('count'), ...base }),
  z.strictObject({ type: z.literal('enum'), values: Values, ...base }),
  z.strictObject({ type: z.literal('enum-set'), values: Values, ...base }),
  z.strictObject({ type: z.literal('stack'), ...base }),
  z.strictObject({ type: z.literal('weights'), ...base }),
]);
export type ParamDef = z.output<typeof ParamDefSchema>;

/** The schema a stored value must satisfy for this definition. */
export function paramValueSchema(def: ParamDef): z.ZodType {
  switch (def.type) {
    case 'cm':
      return z.number().positive();
    case 'deg':
      return z.number().min(-90).max(90);
    case 'bool':
      return z.boolean();
    case 'count':
      return z.number().int().min(0);
    case 'enum':
      return z.enum(def.values as [string, ...string[]]);
    case 'enum-set':
      return z
        .array(z.enum(def.values as [string, ...string[]]))
        .refine((a) => new Set(a).size === a.length, { message: 'values must be unique' });
    case 'stack':
      return StackValueSchema;
    case 'weights':
      return WeightsValueSchema;
  }
}

export function paramValueMatches(def: ParamDef, value: unknown): value is ParamValue {
  return paramValueSchema(def).safeParse(value).success;
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/content/params.test.ts && npm run lint && npm run check`
Expected: `Tests  9 passed (9)`; lint and `astro check` report 0 errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add package.json package-lock.json src/lib/content
git commit -m $'feat(content): add Zod, content vocabularies and parameter types\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Content vocabularies, Zod and parameter types" \
  --body $'Zod 4.6.5 (matches Astro 7.3.5), shared vocabularies and the spec §5.1 parameter types with tests.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** `zod@4.6.5` is a direct dependency, every parameter type accepts valid values and rejects invalid ones, and there are no hole-numbering types.

---

### Task 2: Localized engine messages and unit conversion

Pure code must never produce finished strings. This task adds a `Message` type (dictionary key + params) and `formatMessage`, the dictionary entries the engine and profile modules emit, and the metric ⇄ display unit helpers (spec §10).

**Files:**
- Create: `src/lib/units.ts`, `src/lib/i18n/format.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts` (append entries at the end of each object)
- Test: `src/lib/units.test.ts`, `src/lib/i18n/format.test.ts`

**Interfaces:**
- Consumes: `t(locale, key)` and `MessageKey` from `src/lib/i18n`; `I18nText`, `Locale` from `src/lib/i18n/locales`.
- Produces:
  - `units.ts`: `LengthUnit = 'cm' | 'in'`, `MassUnit = 'kg' | 'lb'`, `CM_PER_INCH`, `KG_PER_LB`, `cmToDisplay(cm, unit)`, `displayToCm(value, unit)`, `kgToDisplay(kg, unit)`, `displayToKg(value, unit)`.
  - `format.ts`: `MessageParam` (string | number | I18nText | I18nText[] | `{ lengthCm }` | `{ key: MessageKey }`), `Message = { key: MessageKey; params? }`, `FormatOptions = { length?: LengthUnit }`, `formatMessage(locale, msg, opts?)`, `formatLength(locale, cm, unit)`, `formatMass(locale, kg, unit)`, `formatLoad(locale, value, unit)`, `placeholders(text)`.
  - Dictionary keys: `unit.length.cm|in`, `unit.mass.kg|lb`, `joint.knee|lowBack|shoulder|wrist`, `engine.reason.*`, `engine.why.*`, `engine.notice.*`, `engine.empty.*`, `engine.note.*` (including `engine.note.checkClearance`, D12), `engine.assumed.*` (typical height, assumed ceiling), `profile.error.*` (full list in Step 4). There are no `engine.missing.*` strings: nothing is ever required (D12).

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-messages-units
```

- [ ] **Step 2: Write the failing tests**

`src/lib/units.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay } from './units';

describe('length', () => {
  it('shows whole centimetres or inches to one decimal', () => {
    expect(cmToDisplay(175.4, 'cm')).toBe(175);
    expect(cmToDisplay(175, 'in')).toBe(68.9);
    expect(cmToDisplay(254, 'in')).toBe(100);
  });
  it('converts typed values back to centimetres', () => {
    expect(displayToCm(68.9, 'in')).toBe(175);
    expect(displayToCm(180, 'cm')).toBe(180);
  });
  it('round-trips within a millimetre', () => {
    for (const cm of [150, 162.5, 175, 185, 230, 275]) {
      expect(Math.abs(displayToCm(cmToDisplay(cm, 'in'), 'in') - cm)).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('mass', () => {
  it('converts between kilograms and pounds', () => {
    expect(kgToDisplay(20, 'lb')).toBe(44.1);
    expect(kgToDisplay(20, 'kg')).toBe(20);
    expect(displayToKg(45, 'lb')).toBe(20.41);
    expect(displayToKg(12.5, 'kg')).toBe(12.5);
  });
});
```

`src/lib/i18n/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';
import { formatLength, formatLoad, formatMass, formatMessage, placeholders } from './format';

const squat = { en: 'Smith Machine Squat', zh: '史密斯机深蹲' };
const bench = { en: 'Adjustable bench', zh: '可调训练凳' };

describe('dictionary placeholders', () => {
  it('match between en and zh for every key', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe('formatMessage', () => {
  it('fills I18nText params in the current language', () => {
    const msg = { key: 'engine.notice.overrideDropped', params: { exercise: squat } } as const;
    expect(formatMessage('en', msg)).toContain('Smith Machine Squat');
    expect(formatMessage('zh', msg)).toContain('史密斯机深蹲');
  });
  it('joins lists with the language separator', () => {
    const msg = { key: 'engine.reason.missingCapability', params: { equipment: [squat, bench] } } as const;
    expect(formatMessage('en', msg)).toContain('Smith Machine Squat, Adjustable bench');
    expect(formatMessage('zh', msg)).toContain('史密斯机深蹲、可调训练凳');
  });
  it('shows lengths in the requested unit', () => {
    const msg = {
      key: 'engine.reason.ceiling',
      params: { need: { lengthCm: 240 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 230 } },
    } as const;
    expect(formatMessage('en', msg)).toContain('240 cm');
    expect(formatMessage('en', msg, { length: 'in' })).toContain('94.5 in');
    expect(formatMessage('zh', msg)).toContain('240 厘米');
  });
  it('formats the clearance note for an assumed ceiling (D12)', () => {
    const msg = {
      key: 'engine.note.checkClearance',
      params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } },
    } as const;
    expect(formatMessage('en', msg)).toContain('about 243 cm of height');
    expect(formatMessage('en', msg, { length: 'in' })).toContain('so 94.5 in was assumed');
    expect(formatMessage('zh', msg)).toContain('按 240 厘米 估算');
  });
  it('looks up nested dictionary keys', () => {
    const msg = { key: 'engine.why.easyOnJoint', params: { joint: { key: 'joint.knee' } } } as const;
    expect(formatMessage('en', msg)).toBe('Easy on the knee');
    expect(formatMessage('zh', msg)).toBe('对膝关节负担小');
  });
  it('throws when a param is missing', () => {
    expect(() => formatMessage('en', { key: 'engine.why.easyOnJoint' })).toThrow('needs param "joint"');
  });
});

describe('unit formatting', () => {
  it('formats lengths, masses and printed loads', () => {
    expect(formatLength('en', 175, 'cm')).toBe('175 cm');
    expect(formatLength('zh', 175, 'in')).toBe('68.9 英寸');
    expect(formatMass('en', 20, 'lb')).toBe('44.1 lb');
    expect(formatLoad('zh', 25, 'lb')).toBe('25 磅');
    expect(formatLoad('en', 12.5, 'kg')).toBe('12.5 kg');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/units.test.ts src/lib/i18n/format.test.ts`
Expected: FAIL — `Failed to resolve import "./units"` and `Failed to resolve import "./format"`.

- [ ] **Step 4: Implement**

`src/lib/units.ts`:
```ts
/**
 * Unit conversion for display (spec §10). Profiles and content are stored in metric; these helpers
 * convert only at the edges (display and input). Cable stacks and owned loads keep their printed unit
 * and are never converted (spec §5.1).
 */
export type LengthUnit = 'cm' | 'in';
export type MassUnit = 'kg' | 'lb';

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Centimetres as shown to the user: whole cm, or inches to one decimal. */
export function cmToDisplay(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? Math.round(cm) : round1(cm / CM_PER_INCH);
}

/** A length the user typed, back to centimetres (one decimal). */
export function displayToCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? round1(value) : round1(value * CM_PER_INCH);
}

/** Kilograms as shown to the user, to one decimal. */
export function kgToDisplay(kg: number, unit: MassUnit): number {
  return unit === 'kg' ? round1(kg) : round1(kg / KG_PER_LB);
}

/** A mass the user typed, back to kilograms (two decimals). */
export function displayToKg(value: number, unit: MassUnit): number {
  const kg = unit === 'kg' ? value : value * KG_PER_LB;
  return Math.round(kg * 100) / 100;
}
```

`src/lib/i18n/format.ts`:
```ts
import { cmToDisplay, kgToDisplay, type LengthUnit, type MassUnit } from '../units';
import { t } from './index';
import type { MessageKey } from './en';
import type { I18nText, Locale } from './locales';

/**
 * A value substituted into a `{name}` placeholder:
 * - string / number: inserted as is
 * - I18nText: the text in the current language
 * - I18nText[]: joined with the language's list separator
 * - { lengthCm }: a length, shown in the user's length unit
 * - { key }: another dictionary entry
 */
export type MessageParam =
  | string
  | number
  | I18nText
  | readonly I18nText[]
  | { readonly lengthCm: number }
  | { readonly key: MessageKey };

/** A localizable message. Pure code (engine, profile) returns these; UI code formats them. */
export interface Message {
  key: MessageKey;
  params?: Readonly<Record<string, MessageParam>>;
}

export interface FormatOptions {
  /** Unit for `{ lengthCm }` params; default centimetres. */
  length?: LengthUnit;
}

const LIST_SEPARATOR: Record<Locale, string> = { en: ', ', zh: '、' };

/** `{value} cm` / `{value} 厘米`, or inches when the user prefers them. */
export function formatLength(locale: Locale, cm: number, unit: LengthUnit): string {
  return t(locale, unit === 'cm' ? 'unit.length.cm' : 'unit.length.in').replace('{value}', String(cmToDisplay(cm, unit)));
}

/** A metric mass shown in the user's mass unit. */
export function formatMass(locale: Locale, kg: number, unit: MassUnit): string {
  return formatLoad(locale, kgToDisplay(kg, unit), unit);
}

/** A load exactly as printed on a stack or dumbbell, in its printed unit (never converted). */
export function formatLoad(locale: Locale, value: number, unit: MassUnit): string {
  return t(locale, unit === 'kg' ? 'unit.mass.kg' : 'unit.mass.lb').replace('{value}', String(value));
}

function isI18nText(p: object): p is I18nText {
  return 'en' in p && 'zh' in p;
}

function formatParam(locale: Locale, p: MessageParam, opts: FormatOptions): string {
  if (typeof p === 'string' || typeof p === 'number') return String(p);
  if (Array.isArray(p)) return (p as readonly I18nText[]).map((x) => x[locale]).join(LIST_SEPARATOR[locale]);
  if ('lengthCm' in p) return formatLength(locale, p.lengthCm, opts.length ?? 'cm');
  if ('key' in p) return t(locale, p.key);
  if (isI18nText(p)) return p[locale];
  throw new Error(`formatMessage: unsupported param ${JSON.stringify(p)}`);
}

/** The message in `locale`, with every `{name}` placeholder filled. A missing param throws. */
export function formatMessage(locale: Locale, msg: Message, opts: FormatOptions = {}): string {
  return t(locale, msg.key).replace(/\{(\w+)\}/g, (_, name: string) => {
    const p = msg.params?.[name];
    if (p === undefined) throw new Error(`formatMessage: "${msg.key}" needs param "${name}"`);
    return formatParam(locale, p, opts);
  });
}

/** Placeholder names used by a dictionary string, sorted. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}
```

Append to the `en` object in `src/lib/i18n/en.ts`, after the last entry (`'angle.elbow': 'elbow',`) and before `} as const;`:
```ts
  'unit.length.cm': '{value} cm',
  'unit.length.in': '{value} in',
  'unit.mass.kg': '{value} kg',
  'unit.mass.lb': '{value} lb',
  'joint.knee': 'knee',
  'joint.lowBack': 'lower back',
  'joint.shoulder': 'shoulder',
  'joint.wrist': 'wrist',
  'engine.reason.missingCapability': 'Needs one of: {equipment}',
  'engine.reason.missingAttachment': 'Needs the {attachment}',
  'engine.reason.attachmentNoFit': 'None of your equipment takes the {attachment}',
  'engine.reason.excluded': 'You excluded this exercise',
  'engine.reason.ceiling': 'Needs {need} of height, including a {margin} margin; your ceiling is {ceiling}',
  'engine.reason.barBelowStop': 'The bar would go down to {height}, below the lowest stop at {stop}',
  'engine.reason.barAboveStop': 'The bar would rise to {height}, above the highest stop at {stop}',
  'engine.reason.benchFit': 'Your bench does not fit inside the rack',
  'engine.reason.rom': 'At this height the movement goes past a safe joint range',
  'engine.reason.noGeometryModel': 'This exercise cannot be checked on this machine yet',
  'engine.reason.poseFailed': 'This movement could not be posed at this height',
  'engine.why.fits': 'Fits your equipment and space',
  'engine.why.override': 'Your choice',
  'engine.why.sameStation': 'Same station as the previous exercise',
  'engine.why.easyOnJoint': 'Easy on the {joint}',
  'engine.why.hardOnJoint': 'Hard on the {joint}',
  'engine.why.usedEarlier': 'Already used earlier this week',
  'engine.notice.overrideDropped': 'Your choice, {exercise}, no longer fits your setup, so this slot was refilled',
  'engine.notice.overrideInvalid': 'Your saved choice for this slot is no longer available, so this slot was refilled',
  'engine.empty.noExercise': 'The library has no exercise for this slot yet',
  'engine.empty.noneFeasible': 'No matching exercise fits your setup',
  'engine.note.jointModerate': 'You marked your {joint} as sensitive; this exercise puts moderate stress on it. Go lighter and stop if it hurts.',
  'engine.note.jointHigh': 'You marked your {joint} as sensitive; this exercise puts high stress on it. Go lighter and stop if it hurts.',
  'engine.note.checkClearance': 'Check your overhead clearance: this movement needs about {need} of height, including a {margin} margin. Your ceiling height is not set, so {ceiling} was assumed.',
  'engine.assumed.stature': 'Planned for a typical height of {height}. Add your height for a personal check.',
  'engine.assumed.ceiling': 'Your ceiling height is not set, so overhead clearance is checked against {ceiling}.',
  'profile.error.notJson': 'The file is not valid JSON',
  'profile.error.notProfile': 'The file is not a saved profile from this site',
  'profile.error.newerVersion': 'The file comes from a newer version of this site (profile version {version})',
  'profile.error.required': 'Required',
  'profile.error.type': 'Wrong kind of value',
  'profile.error.range': 'Outside the allowed range',
  'profile.error.choice': 'Not one of the allowed choices',
  'profile.error.unknownField': 'Not a profile field: {field}',
  'profile.error.invalid': 'Invalid value',
```

Append to the `zh` object in `src/lib/i18n/zh.ts`, after `'angle.elbow': '肘',` and before `};`:
```ts
  'unit.length.cm': '{value} 厘米',
  'unit.length.in': '{value} 英寸',
  'unit.mass.kg': '{value} 公斤',
  'unit.mass.lb': '{value} 磅',
  'joint.knee': '膝关节',
  'joint.lowBack': '下背部',
  'joint.shoulder': '肩关节',
  'joint.wrist': '手腕',
  'engine.reason.missingCapability': '需要以下器械之一：{equipment}',
  'engine.reason.missingAttachment': '需要{attachment}',
  'engine.reason.attachmentNoFit': '你的器械都无法安装{attachment}',
  'engine.reason.excluded': '你已排除这个动作',
  'engine.reason.ceiling': '需要 {need} 的高度（含 {margin} 余量），你的天花板高度为 {ceiling}',
  'engine.reason.barBelowStop': '杠铃需要降到 {height}，低于最低限位 {stop}',
  'engine.reason.barAboveStop': '杠铃需要升到 {height}，高于最高限位 {stop}',
  'engine.reason.benchFit': '你的训练凳放不进架子内',
  'engine.reason.rom': '按这个身高，这个动作会超出关节的安全活动范围',
  'engine.reason.noGeometryModel': '暂时还无法在这台器械上检查这个动作',
  'engine.reason.poseFailed': '无法按这个身高摆出这个动作的姿势',
  'engine.why.fits': '适合你的器械和空间',
  'engine.why.override': '你的选择',
  'engine.why.sameStation': '与上一个动作使用同一器械',
  'engine.why.easyOnJoint': '对{joint}负担小',
  'engine.why.hardOnJoint': '对{joint}负担大',
  'engine.why.usedEarlier': '本周前面已安排过',
  'engine.notice.overrideDropped': '你选择的{exercise}已不适合你的器械条件，此项已重新安排',
  'engine.notice.overrideInvalid': '此项保存的选择已不可用，已重新安排',
  'engine.empty.noExercise': '动作库中暂时没有适合此项的动作',
  'engine.empty.noneFeasible': '没有符合你器械条件的动作',
  'engine.note.jointModerate': '你标记了{joint}敏感；这个动作对该部位有中等负荷。请减轻重量，如有疼痛立即停止。',
  'engine.note.jointHigh': '你标记了{joint}敏感；这个动作对该部位负荷较大。请减轻重量，如有疼痛立即停止。',
  'engine.note.checkClearance': '请确认头顶空间：这个动作需要约 {need} 的高度（含 {margin} 余量）。你尚未填写天花板高度，因此按 {ceiling} 估算。',
  'engine.assumed.stature': '按 {height} 的常见身高安排。填写你的身高可获得个人化检查。',
  'engine.assumed.ceiling': '你尚未填写天花板高度，头顶空间按 {ceiling} 估算。',
  'profile.error.notJson': '文件不是有效的 JSON',
  'profile.error.notProfile': '文件不是本站保存的个人资料',
  'profile.error.newerVersion': '文件来自本站的较新版本（资料版本 {version}）',
  'profile.error.required': '必填',
  'profile.error.type': '值的类型不正确',
  'profile.error.range': '超出允许范围',
  'profile.error.choice': '不是允许的选项',
  'profile.error.unknownField': '不是个人资料中的字段：{field}',
  'profile.error.invalid': '无效的值',
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/units.test.ts src/lib/i18n && npm run lint && npm run check`
Expected: `units.test.ts` 4 passed, `format.test.ts` 8 passed, the existing `i18n.test.ts` still 12 passed (key parity, no empty strings, Chinese in every `zh` entry); 0 lint and type errors. A key added to only one dictionary is a type error in `zh.ts`.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/units.ts src/lib/units.test.ts src/lib/i18n
git commit -m $'feat(i18n): add localizable messages, engine/profile strings and unit conversion\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Localized engine messages and unit conversion" \
  --body $'Message + formatMessage, EN/中文 strings for the engine and profile, metric ⇄ display units.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** every new dictionary entry exists in both languages with matching placeholders, and lengths and masses format in the user's units.

---

### Task 3: Content schemas — equipment, attachments, exercises, templates

The single definition of the content model (spec §5). Astro collections (Task 5), the catalog (Task 4) and the engine all use these types.

**Files:**
- Create: `src/lib/content/schemas.ts`
- Test: `src/lib/content/schemas.test.ts`

**Interfaces:**
- Consumes: Task 1 (`IdSchema`, `ParamNameSchema`, `I18nTextSchema`, `ParamDefSchema`, `ParamValueSchema`, vocabularies).
- Produces: `EquipmentSchema`/`Equipment`, `AttachmentSchema`/`Attachment` (with optional `uses: { id, name }[]`), `SetupStateSchema`/`SetupState`, `ExerciseSchema`/`Exercise` (with `requires.attachmentUses: Record<attachmentId, useId>` and `figure?: { spec: string }`), `RepsSchema`/`Reps` (`[low, high]` or `{ seconds }`), `SlotSchema`/`Slot` (optional `rir`), `DaySchema`/`Day` (optional `fullBody`), `TemplateSchema`/`Template`, `FULL_BODY_MAX_SETS = 10`, `FULL_BODY_MIN_RIR = 2`, `slotPatterns(slot): Pattern[]`. Types are `z.output<…>`, so defaulted arrays and maps are always present.

Owner decisions 2, 6, 7 and 8: parameter definitions carry a bilingual `label`; exercises reference a figure by id (`figure.spec`) instead of embedding frames; `fullBody: true` marks the volume-capped day; `rir` is optional so cardio slots need none.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-content-schemas
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { AttachmentSchema, DaySchema, EquipmentSchema, ExerciseSchema, TemplateSchema, slotPatterns } from './schemas';

const T = (en: string) => ({ en, zh: `中文${en}` });

const EXERCISE = {
  id: 'smith-squat',
  name: T('Smith Machine Squat'),
  pattern: 'squat',
  muscles: { primary: ['quadriceps', 'glutes'], secondary: ['adductors'] },
  requires: { capabilities: ['smith-bar'], attachments: [] },
  tags: [],
  jointStress: { knee: 'moderate', lowBack: 'moderate', shoulder: 'low', wrist: 'low' },
  guideSection: 'lower-squat',
  setupState: { station: 'smith' },
  setupSeconds: 60,
  repSeconds: 4,
  setup: T('setup'),
  cues: [T('cue 1'), T('cue 2')],
  mistakes: [T('mistake')],
  warmup: T('warm-up'),
  alternatives: [],
  figure: { spec: 'smith-squat' },
};

const SLOT = { pattern: 'horizontal-push', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 };
const DAY = { weekday: 'mon', kind: 'strength', focus: T('Push'), minutes: 35, slots: [SLOT] };

describe('EquipmentSchema', () => {
  const eq = {
    id: 'smith-functional-trainer',
    kind: 'station',
    name: T('Smith machine + functional trainer'),
    capabilities: ['smith-bar', 'cable-column'],
    parameters: { smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar height'), how: T('Measure') } },
    illustrativeDefaults: { smithLowestBarHeightCm: 40 },
  };
  it('accepts a valid entry and defaults the optional maps', () => {
    expect(EquipmentSchema.parse(eq).id).toBe('smith-functional-trainer');
    const bare = EquipmentSchema.parse({ id: 'ab-wheel', kind: 'accessory', name: T('Ab wheel'), capabilities: ['ab-wheel'] });
    expect(bare.parameters).toEqual({});
    expect(bare.illustrativeDefaults).toEqual({});
  });
  it('rejects missing translations, unknown kinds and unknown keys', () => {
    expect(EquipmentSchema.safeParse({ ...eq, name: { en: 'Smith' } }).success).toBe(false);
    expect(EquipmentSchema.safeParse({ ...eq, kind: 'machine' }).success).toBe(false);
    expect(EquipmentSchema.safeParse({ ...eq, brand: 'x' }).success).toBe(false);
  });
});

describe('AttachmentSchema', () => {
  it('needs at least one capability to fit', () => {
    expect(AttachmentSchema.safeParse({ id: 'rope', name: T('Rope'), fits: [] }).success).toBe(false);
    expect(AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] }).fits).toEqual(['cable-column']);
  });
});

describe('ExerciseSchema', () => {
  it('accepts the spec example shape', () => {
    const e = ExerciseSchema.parse(EXERCISE);
    expect(e.requires.attachmentUses).toEqual({});
    expect(e.muscles.secondary).toEqual(['adductors']);
  });
  it('needs 2–3 cues', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, cues: [T('one')] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, cues: [T('1'), T('2'), T('3'), T('4')] }).success).toBe(false);
  });
  it('requires a figure unless the pattern is cardio', () => {
    const noFigure: Record<string, unknown> = { ...EXERCISE };
    delete noFigure.figure;
    expect(ExerciseSchema.safeParse(noFigure).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...noFigure, pattern: 'cardio-steady', setupState: { station: 'cardio' } }).success).toBe(true);
  });
  it('rejects self-alternatives and pulleys away from the cable station', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, alternatives: ['smith-squat'] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, setupState: { station: 'smith', pulley: 'low' } }).success).toBe(false);
  });
  it('rejects unknown patterns, muscles and stress levels', () => {
    expect(ExerciseSchema.safeParse({ ...EXERCISE, pattern: 'deadlift' }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, muscles: { primary: ['quads'] } }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...EXERCISE, jointStress: { ...EXERCISE.jointStress, knee: 'extreme' } }).success).toBe(false);
  });
});

describe('DaySchema', () => {
  it('accepts a strength day and a bare rest day', () => {
    expect(DaySchema.parse(DAY).slots).toHaveLength(1);
    expect(DaySchema.parse({ weekday: 'sun', kind: 'rest' }).slots).toEqual([]);
  });
  it('accepts timed reps and pattern lists', () => {
    const d = DaySchema.parse({ ...DAY, slots: [{ ...SLOT, pattern: ['squat', 'lunge'], reps: { seconds: 30 } }] });
    expect(slotPatterns(d.slots[0]!)).toEqual(['squat', 'lunge']);
  });
  it('needs focus, minutes and slots on training days, and no slots on rest days', () => {
    expect(DaySchema.safeParse({ ...DAY, focus: undefined }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, minutes: undefined }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, slots: [] }).success).toBe(false);
    expect(DaySchema.safeParse({ weekday: 'sun', kind: 'rest', slots: [SLOT] }).success).toBe(false);
  });
  it('rejects an inverted rep range', () => {
    expect(DaySchema.safeParse({ ...DAY, slots: [{ ...SLOT, reps: [12, 8] }] }).success).toBe(false);
  });
  it('checks superset pairing', () => {
    const two = [SLOT, { ...SLOT, supersetWith: 0 }];
    expect(DaySchema.safeParse({ ...DAY, slots: two }).success).toBe(true);
    expect(DaySchema.safeParse({ ...DAY, slots: [{ ...SLOT, supersetWith: 0 }] }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, slots: [SLOT, { ...SLOT, supersetWith: 5 }] }).success).toBe(false);
    const clash = [SLOT, { ...SLOT, supersetWith: 0 }, { ...SLOT, supersetWith: 0 }];
    expect(DaySchema.safeParse({ ...DAY, slots: clash }).success).toBe(false);
  });
  it('caps a full-body day at 10 sets, all at RIR ≥ 2', () => {
    const slots = (sets: number, rir: number) => Array.from({ length: 4 }, () => ({ ...SLOT, sets, rir }));
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(2, 2) }).success).toBe(true);
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(3, 2) }).success).toBe(false);
    expect(DaySchema.safeParse({ ...DAY, fullBody: true, slots: slots(2, 1) }).success).toBe(false);
  });
});

describe('TemplateSchema', () => {
  it('rejects duplicate weekdays and all-rest weeks', () => {
    const name = T('Template');
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [DAY, { weekday: 'sun', kind: 'rest' }] }).success).toBe(true);
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [DAY, DAY] }).success).toBe(false);
    expect(TemplateSchema.safeParse({ id: 'tpl', name, days: [{ weekday: 'sun', kind: 'rest' }] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/content/schemas.test.ts`
Expected: FAIL — `Failed to resolve import "./schemas"`.

- [ ] **Step 4: Implement**

```ts
import { z } from 'zod';
import { I18nTextSchema, IdSchema, ParamNameSchema } from './common';
import { ParamDefSchema, ParamValueSchema } from './params';
import {
  CARDIO_PATTERNS,
  DAY_KINDS,
  EQUIPMENT_KINDS,
  EXERCISE_TAGS,
  GUIDE_SECTIONS,
  MUSCLES,
  PATTERNS,
  PULLEY_POSITIONS,
  STATIONS,
  STRESS_LEVELS,
  WEEKDAYS,
} from './vocab';

/** Spec §5.5: the full-body day is capped at this many working sets… */
export const FULL_BODY_MAX_SETS = 10;
/** …all at RIR ≥ this. */
export const FULL_BODY_MIN_RIR = 2;

// ── Equipment (spec §5.1) ─────────────────────────────────────────────────────

export const EquipmentSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(EQUIPMENT_KINDS),
  name: I18nTextSchema,
  capabilities: z.array(IdSchema).min(1),
  parameters: z.record(ParamNameSchema, ParamDefSchema).default({}),
  /**
   * Typical dimensions (D12): drawn on generic pages, and used by the engine for every unmeasured parameter.
   * Lengths are in cm; Smith bar heights are floor to the centre of the bar (see `GEOMETRY_PARAMS`).
   */
  illustrativeDefaults: z.record(ParamNameSchema, ParamValueSchema).default({}),
  /** Parametric builder id in lib/figure (checked from M3). */
  model3d: IdSchema.optional(),
  /** Guide MDX id (checked from M5). */
  guide: IdSchema.optional(),
});
export type Equipment = z.output<typeof EquipmentSchema>;

// ── Attachments (spec §5.2) ───────────────────────────────────────────────────

export const AttachmentSchema = z.strictObject({
  id: IdSchema,
  name: I18nTextSchema,
  fits: z.array(IdSchema).min(1),
  model3d: IdSchema.optional(),
  /** Distinct ways an exercise can use this attachment (e.g. the roller hold-down). */
  uses: z.array(z.strictObject({ id: IdSchema, name: I18nTextSchema })).optional(),
});
export type Attachment = z.output<typeof AttachmentSchema>;

// ── Exercises (spec §5.3) ─────────────────────────────────────────────────────

const Stress = z.enum(STRESS_LEVELS);

export const SetupStateSchema = z.strictObject({
  station: z.enum(STATIONS),
  benchAngleDeg: z.number().min(-30).max(90).optional(),
  pulley: z.enum(PULLEY_POSITIONS).optional(),
});
export type SetupState = z.output<typeof SetupStateSchema>;

export const ExerciseSchema = z
  .strictObject({
    id: IdSchema,
    name: I18nTextSchema,
    pattern: z.enum(PATTERNS),
    muscles: z.strictObject({
      primary: z.array(z.enum(MUSCLES)).min(1),
      secondary: z.array(z.enum(MUSCLES)).default([]),
    }),
    requires: z.strictObject({
      capabilities: z.array(IdSchema).default([]),
      attachments: z.array(IdSchema).default([]),
      /** attachment id → use id, for attachments that declare `uses`. */
      attachmentUses: z.record(IdSchema, IdSchema).default({}),
    }),
    tags: z.array(z.enum(EXERCISE_TAGS)).default([]),
    jointStress: z.strictObject({ knee: Stress, lowBack: Stress, shoulder: Stress, wrist: Stress }),
    guideSection: z.enum(GUIDE_SECTIONS),
    setupState: SetupStateSchema,
    setupSeconds: z.number().int().min(0).max(600),
    repSeconds: z.number().positive().max(20),
    setup: I18nTextSchema,
    cues: z.array(I18nTextSchema).min(2).max(3),
    mistakes: z.array(I18nTextSchema).min(1),
    warmup: I18nTextSchema,
    safety: I18nTextSchema.optional(),
    alternatives: z.array(IdSchema).default([]),
    /** Figure spec id in lib/figure/fixtures (FIGURES). */
    figure: z.strictObject({ spec: IdSchema }).optional(),
  })
  .superRefine((e, ctx) => {
    if (!e.figure && !CARDIO_PATTERNS.includes(e.pattern)) {
      ctx.addIssue({ code: 'custom', path: ['figure'], message: 'every non-cardio exercise needs a figure' });
    }
    if (e.alternatives.includes(e.id)) {
      ctx.addIssue({ code: 'custom', path: ['alternatives'], message: 'an exercise cannot be its own alternative' });
    }
    if (e.setupState.pulley && e.setupState.station !== 'cable') {
      ctx.addIssue({ code: 'custom', path: ['setupState', 'pulley'], message: 'pulley is only valid at the cable station' });
    }
  });
export type Exercise = z.output<typeof ExerciseSchema>;

// ── Templates (spec §5.5) ─────────────────────────────────────────────────────

export const RepsSchema = z.union([
  z
    .tuple([z.number().int().min(1), z.number().int().min(1)])
    .refine(([lo, hi]) => lo <= hi, { message: 'rep range must be [low, high]' }),
  z.strictObject({ seconds: z.number().int().positive() }),
]);
export type Reps = z.output<typeof RepsSchema>;

export const SlotSchema = z.strictObject({
  pattern: z.union([z.enum(PATTERNS), z.array(z.enum(PATTERNS)).min(1)]),
  sets: z.number().int().min(1).max(10),
  reps: RepsSchema,
  rir: z.number().int().min(0).max(5).optional(),
  restSec: z.number().int().min(0).max(600),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Zero-based index of the partner slot on the same day. */
  supersetWith: z.number().int().min(0).optional(),
});
export type Slot = z.output<typeof SlotSchema>;

export const DaySchema = z
  .strictObject({
    weekday: z.enum(WEEKDAYS),
    kind: z.enum(DAY_KINDS),
    focus: I18nTextSchema.optional(),
    minutes: z.number().int().min(5).max(180).optional(),
    /** Volume-capped full-body day (spec §5.5). */
    fullBody: z.boolean().optional(),
    slots: z.array(SlotSchema).default([]),
  })
  .superRefine((d, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (d.kind === 'rest') {
      if (d.slots.length > 0) issue(['slots'], 'a rest day has no slots');
      return;
    }
    if (!d.focus) issue(['focus'], 'a training day needs a focus');
    if (d.minutes === undefined) issue(['minutes'], 'a training day needs minutes');
    if (d.slots.length === 0) issue(['slots'], 'a training day needs at least one slot');
    const partnerOf = new Map<number, number>();
    d.slots.forEach((s, i) => {
      if (s.supersetWith === undefined) return;
      const j = s.supersetWith;
      if (j === i || j >= d.slots.length) return issue(['slots', i, 'supersetWith'], `no slot ${j} to pair with`);
      for (const [a, b] of [
        [i, j],
        [j, i],
      ] as const) {
        const existing = partnerOf.get(a);
        if (existing !== undefined && existing !== b) issue(['slots', i, 'supersetWith'], `slot ${a} is already paired with slot ${existing}`);
        partnerOf.set(a, b);
      }
    });
    if (d.fullBody) {
      const total = d.slots.reduce((n, s) => n + s.sets, 0);
      if (total > FULL_BODY_MAX_SETS) issue(['slots'], `a full-body day allows at most ${FULL_BODY_MAX_SETS} working sets (has ${total})`);
      d.slots.forEach((s, i) => {
        if ((s.rir ?? -1) < FULL_BODY_MIN_RIR) issue(['slots', i, 'rir'], `full-body slots need RIR ≥ ${FULL_BODY_MIN_RIR}`);
      });
    }
  });
export type Day = z.output<typeof DaySchema>;

export const TemplateSchema = z
  .strictObject({ id: IdSchema, name: I18nTextSchema, days: z.array(DaySchema).min(1).max(7) })
  .superRefine((tpl, ctx) => {
    const seen = new Set<string>();
    tpl.days.forEach((d, i) => {
      if (seen.has(d.weekday)) ctx.addIssue({ code: 'custom', path: ['days', i, 'weekday'], message: `${d.weekday} appears twice` });
      seen.add(d.weekday);
    });
    if (tpl.days.every((d) => d.kind === 'rest')) ctx.addIssue({ code: 'custom', path: ['days'], message: 'a template needs a training day' });
  });
export type Template = z.output<typeof TemplateSchema>;

/** Slot patterns as a list. */
export const slotPatterns = (s: Slot) => (Array.isArray(s.pattern) ? s.pattern : [s.pattern]);
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/content && npm run lint && npm run check`
Expected: `schemas.test.ts` 15 passed, `params.test.ts` 9 passed; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/content/schemas.ts src/lib/content/schemas.test.ts
git commit -m $'feat(content): add equipment, attachment, exercise and template schemas\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Content schemas: equipment, attachments, exercises, templates" \
  --body $'Zod schemas for spec §5 with per-entry rules (cues 2–3, figure unless cardio, supersets, full-body cap).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the spec §5 examples parse and each per-entry rule has a passing negative test.

---

### Task 4: Catalog builder with cross-reference checks

Per-entry schemas cannot see other entries. `buildCatalog` indexes all content and checks every cross-reference at once (spec §5, §14 "Content integrity"), reporting all problems in one error.

**Files:**
- Create: `src/lib/content/catalog.ts`
- Test: `src/lib/content/catalog.test.ts`

**Interfaces:**
- Consumes: Task 3 types and `slotPatterns`; `paramValueMatches` and `GEOMETRY_PARAMS` (Task 1); `FIGURES` from `src/lib/figure/fixtures` (M1).
- Produces: `Catalog = { equipment, attachments, exercises, templates: ReadonlyMap<string, T> }`, `CatalogInput` (arrays), `CatalogOptions = { figureIds?: ReadonlySet<string> }`, `class CatalogError extends Error { problems: readonly string[] }`, `buildCatalog(input, opts?): Catalog` (throws `CatalogError`).

Checks: duplicate ids; illustrative defaults name a parameter and match its type; every parameter the geometry checks read (`GEOMETRY_PARAMS`) has an illustrative default, so the engine always has a typical value (D12); attachment `fits` and exercise `requires.capabilities` are provided by some equipment; required attachments exist; attachment uses are declared and valid; alternatives exist; `figure.spec` exists in `FIGURES`; every template slot has at least one exercise of its pattern(s).

Task 8 (fail safe) adds two equipment rules to `buildCatalog`: a geometry parameter must have the type the checks read (`GEOMETRY_PARAM_TYPES`), and equipment providing `smith-bar`, `rack-uprights` or `pull-up-bar` must define the geometry parameters those capabilities need (`CAPABILITY_GEOMETRY_PARAMS`), each with an illustrative default. The code below is the Task 4 version; Task 8 Step 6 shows the additions and the updated `catalog.test.ts` fixture.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-catalog
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildCatalog, CatalogError, type CatalogInput } from './catalog';
import { AttachmentSchema, EquipmentSchema, ExerciseSchema, TemplateSchema } from './schemas';

const T = (en: string) => ({ en, zh: `中文${en}` });

const smith = EquipmentSchema.parse({
  id: 'smith-functional-trainer',
  kind: 'station',
  name: T('Smith machine + functional trainer'),
  capabilities: ['smith-bar', 'cable-column', 'rack-uprights'],
  parameters: { smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar'), how: T('Measure') } },
  illustrativeDefaults: { smithLowestBarHeightCm: 40 },
});
const rope = AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] });
const holdDown = AttachmentSchema.parse({
  id: 'roller-hold-down',
  name: T('Roller hold-down'),
  fits: ['rack-uprights'],
  uses: [{ id: 'nordic-curl', name: T('Nordic curl anchor') }],
});
const exercise = (over: Record<string, unknown>) =>
  ExerciseSchema.parse({
    id: 'smith-squat',
    name: T('Smith Machine Squat'),
    pattern: 'squat',
    muscles: { primary: ['quadriceps'] },
    requires: { capabilities: ['smith-bar'] },
    jointStress: { knee: 'moderate', lowBack: 'moderate', shoulder: 'low', wrist: 'low' },
    guideSection: 'lower-squat',
    setupState: { station: 'smith' },
    setupSeconds: 60,
    repSeconds: 4,
    setup: T('setup'),
    cues: [T('a'), T('b')],
    mistakes: [T('m')],
    warmup: T('w'),
    figure: { spec: 'smith-squat' },
    ...over,
  });
const template = TemplateSchema.parse({
  id: 'tpl',
  name: T('Template'),
  days: [{ weekday: 'mon', kind: 'strength', focus: T('Legs'), minutes: 30, slots: [{ pattern: 'squat', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 }] }],
});

const input = (over: Partial<CatalogInput> = {}): CatalogInput => ({
  equipment: [smith],
  attachments: [rope, holdDown],
  exercises: [exercise({})],
  templates: [template],
  ...over,
});

function problemsOf(i: CatalogInput): readonly string[] {
  try {
    buildCatalog(i);
  } catch (e) {
    if (e instanceof CatalogError) return e.problems;
    throw e;
  }
  return [];
}

describe('buildCatalog', () => {
  it('indexes valid content by id', () => {
    const c = buildCatalog(input());
    expect(c.exercises.get('smith-squat')?.pattern).toBe('squat');
    expect([...c.equipment.keys()]).toEqual(['smith-functional-trainer']);
  });

  it('reports duplicate ids', () => {
    expect(problemsOf(input({ exercises: [exercise({}), exercise({})] }))).toEqual(['exercise "smith-squat" is defined twice']);
  });

  it('checks capabilities, attachments and alternatives, reporting every problem at once', () => {
    const problems = problemsOf(
      input({ exercises: [exercise({ requires: { capabilities: ['landmine'], attachments: ['dip-belt'] }, alternatives: ['goblet-squat'] })] }),
    );
    expect(problems).toEqual([
      'exercise "smith-squat": no equipment provides "landmine"',
      'exercise "smith-squat": unknown attachment "dip-belt"',
      'exercise "smith-squat": unknown alternative "goblet-squat"',
    ]);
  });

  it('checks attachment uses', () => {
    const noUse = exercise({ requires: { capabilities: ['rack-uprights'], attachments: ['roller-hold-down'] } });
    expect(problemsOf(input({ exercises: [noUse] }))).toEqual(['exercise "smith-squat": must declare how it uses "roller-hold-down"']);
    const badUse = exercise({
      requires: { capabilities: ['rack-uprights'], attachments: ['roller-hold-down'], attachmentUses: { 'roller-hold-down': 'leg-curl' } },
    });
    expect(problemsOf(input({ exercises: [badUse] }))).toEqual(['exercise "smith-squat": "roller-hold-down" has no use "leg-curl"']);
    const stray = exercise({ requires: { capabilities: ['smith-bar'], attachmentUses: { 'roller-hold-down': 'nordic-curl' } } });
    expect(problemsOf(input({ exercises: [stray] }))).toEqual([
      'exercise "smith-squat": declares a use for "roller-hold-down" but does not require it',
    ]);
  });

  it('checks figure specs', () => {
    expect(problemsOf(input({ exercises: [exercise({ figure: { spec: 'goblet-squat' } })] }))).toEqual([
      'exercise "smith-squat": unknown figure spec "goblet-squat"',
    ]);
  });

  it('checks attachments fit some equipment', () => {
    const band = AttachmentSchema.parse({ id: 'band-anchor', name: T('Band anchor'), fits: ['door-frame'] });
    expect(problemsOf(input({ attachments: [rope, holdDown, band] }))).toEqual(['attachment "band-anchor": no equipment provides "door-frame"']);
  });

  it('checks illustrative defaults against parameter definitions', () => {
    const bad = { ...smith, illustrativeDefaults: { smithLowestBarHeightCm: -5, ceilingCm: 250 } };
    expect(problemsOf(input({ equipment: [bad] }))).toEqual([
      'equipment "smith-functional-trainer": illustrative default "smithLowestBarHeightCm" is not a valid cm',
      'equipment "smith-functional-trainer": illustrative default "ceilingCm" is not a parameter',
    ]);
  });

  it('requires a typical value for every parameter the geometry checks read (D12)', () => {
    expect(problemsOf(input({ equipment: [{ ...smith, illustrativeDefaults: {} }] }))).toEqual([
      'equipment "smith-functional-trainer": parameter "smithLowestBarHeightCm" is read by the geometry checks and needs an illustrative default',
    ]);
  });

  it('requires an exercise for every template slot', () => {
    const tpl = TemplateSchema.parse({
      ...template,
      days: [{ ...template.days[0]!, slots: [{ pattern: ['calf', 'lunge'], sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3 }] }],
    });
    expect(problemsOf(input({ templates: [tpl] }))).toEqual(['template "tpl" mon/0: no exercise for calf | lunge']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/content/catalog.test.ts`
Expected: FAIL — `Failed to resolve import "./catalog"`.

- [ ] **Step 4: Implement**

```ts
import { FIGURES } from '../figure/fixtures';
import { paramValueMatches } from './params';
import { type Attachment, type Equipment, type Exercise, type Template, slotPatterns } from './schemas';
import { GEOMETRY_PARAMS } from './vocab';

/** All generic content, validated and cross-checked. The engine only ever sees this. */
export interface Catalog {
  equipment: ReadonlyMap<string, Equipment>;
  attachments: ReadonlyMap<string, Attachment>;
  exercises: ReadonlyMap<string, Exercise>;
  templates: ReadonlyMap<string, Template>;
}

export interface CatalogInput {
  equipment: readonly Equipment[];
  attachments: readonly Attachment[];
  exercises: readonly Exercise[];
  templates: readonly Template[];
}

export interface CatalogOptions {
  /** Figure spec ids that exist; defaults to the ids in lib/figure/fixtures. */
  figureIds?: ReadonlySet<string>;
}

export class CatalogError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Content catalog has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'CatalogError';
  }
}

function byId<T extends { id: string }>(kind: string, items: readonly T[], problems: string[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) problems.push(`${kind} "${item.id}" is defined twice`);
    map.set(item.id, item);
  }
  return map;
}

/**
 * Index the content and check every cross-reference (spec §5, §14). Throws a CatalogError listing
 * every problem at once, so one build run shows them all.
 */
export function buildCatalog(input: CatalogInput, opts: CatalogOptions = {}): Catalog {
  const problems: string[] = [];
  const figureIds = opts.figureIds ?? new Set(Object.keys(FIGURES));
  const equipment = byId('equipment', input.equipment, problems);
  const attachments = byId('attachment', input.attachments, problems);
  const exercises = byId('exercise', input.exercises, problems);
  const templates = byId('template', input.templates, problems);
  const provided = new Set([...equipment.values()].flatMap((e) => e.capabilities));

  for (const eq of equipment.values()) {
    for (const [name, value] of Object.entries(eq.illustrativeDefaults)) {
      const def = eq.parameters[name];
      if (!def) problems.push(`equipment "${eq.id}": illustrative default "${name}" is not a parameter`);
      else if (!paramValueMatches(def, value)) problems.push(`equipment "${eq.id}": illustrative default "${name}" is not a valid ${def.type}`);
    }
    // D12: the engine uses the typical value whenever the user has not measured, so it must exist.
    for (const name of GEOMETRY_PARAMS) {
      if (eq.parameters[name] && eq.illustrativeDefaults[name] === undefined) {
        problems.push(`equipment "${eq.id}": parameter "${name}" is read by the geometry checks and needs an illustrative default`);
      }
    }
  }

  for (const at of attachments.values()) {
    for (const cap of at.fits) {
      if (!provided.has(cap)) problems.push(`attachment "${at.id}": no equipment provides "${cap}"`);
    }
    const useIds = (at.uses ?? []).map((u) => u.id);
    if (new Set(useIds).size !== useIds.length) problems.push(`attachment "${at.id}": use ids must be unique`);
  }

  for (const ex of exercises.values()) {
    const where = `exercise "${ex.id}"`;
    for (const cap of ex.requires.capabilities) {
      if (!provided.has(cap)) problems.push(`${where}: no equipment provides "${cap}"`);
    }
    for (const id of ex.requires.attachments) {
      const at = attachments.get(id);
      if (!at) {
        problems.push(`${where}: unknown attachment "${id}"`);
        continue;
      }
      const use = ex.requires.attachmentUses[id];
      if (at.uses && use === undefined) problems.push(`${where}: must declare how it uses "${id}"`);
      if (use !== undefined && !at.uses?.some((u) => u.id === use)) problems.push(`${where}: "${id}" has no use "${use}"`);
    }
    for (const id of Object.keys(ex.requires.attachmentUses)) {
      if (!ex.requires.attachments.includes(id)) problems.push(`${where}: declares a use for "${id}" but does not require it`);
    }
    for (const alt of ex.alternatives) {
      if (!exercises.has(alt)) problems.push(`${where}: unknown alternative "${alt}"`);
    }
    if (ex.figure && !figureIds.has(ex.figure.spec)) problems.push(`${where}: unknown figure spec "${ex.figure.spec}"`);
  }

  for (const tpl of templates.values()) {
    for (const day of tpl.days) {
      day.slots.forEach((slot, i) => {
        const patterns = slotPatterns(slot);
        if (![...exercises.values()].some((e) => patterns.includes(e.pattern))) {
          problems.push(`template "${tpl.id}" ${day.weekday}/${i}: no exercise for ${patterns.join(' | ')}`);
        }
      });
    }
  }

  if (problems.length > 0) throw new CatalogError(problems);
  return { equipment, attachments, exercises, templates };
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/content && npm run lint && npm run check`
Expected: `catalog.test.ts` 9 passed (33 in `src/lib/content`); 0 lint and type errors. (After Task 8's additions: 22 passed, 46 in `src/lib/content`.)

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/content/catalog.ts src/lib/content/catalog.test.ts
git commit -m $'feat(content): build a cross-checked content catalog\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Catalog builder with cross-reference checks" \
  --body $'buildCatalog() indexes content and reports every broken reference at once.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** each cross-reference rule, including the typical-value rule for geometry parameters, has a passing test and valid input indexes by id.

---

### Task 5: Content collections, generic seed content and build-time checks

Wires the schemas into Astro content collections, adds the first generic content, and makes `npm run build` fail on any content error (spec §14: "Build (Zod + cross-reference checks)").

Seed content is deliberately small (owner decision 14): the three equipment classes the engine tests need, all seven v1 attachments and the M1 exercise. Illustrative defaults describe the same typical machine as `ILLUSTRATIVE_SMITH` in `src/lib/figure/geometry/smith.ts` (what the figures draw); the Smith stops use its datum, floor to the centre of the bar, so the typical 40 / 180 cm equal `ILLUSTRATIVE_SMITH.lowestBarHeightCm` / `highestBarHeightCm`. Every parameter in `GEOMETRY_PARAMS` has one, because the engine uses them whenever the user has not measured (D12); the Smith station defines all four, as Task 8's capability rule requires of equipment providing `smith-bar`, `rack-uprights` and `pull-up-bar`. Setups are described in words only: there is no `holeNumbering` or `pulleyHoleRange` parameter (D12). The `templates` collection stays empty until M5, so the build logs two expected warnings (`No files found matching "*.yaml" in directory "src/content/templates"` and `The collection "templates" does not exist or is empty`).

**Files:**
- Create: `src/content.config.ts`, `src/catalog.ts`
- Create: `src/content/equipment/smith-functional-trainer.yaml`, `src/content/equipment/adjustable-bench.yaml`, `src/content/equipment/dumbbells.yaml`
- Create: `src/content/attachments/{rope,close-grip-row-handle,single-handle,lat-bar,ankle-strap,row-footplate,roller-hold-down}.yaml`
- Create: `src/content/exercises/smith-squat.yaml`
- Modify: `src/pages/[lang]/fitness/index.astro`

**Interfaces:**
- Consumes: Task 3 schemas, Task 4 `buildCatalog`/`CatalogError`.
- Produces: Astro collections `equipment`, `attachments`, `exercises`, `templates`; `loadCatalog(): Promise<Catalog>` in `src/catalog.ts` (memoized; throws `CatalogError`; also requires each file name to equal its `id`). M4 pages call `loadCatalog()`; nothing else imports `astro:content`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-content-collections
```

- [ ] **Step 2: Add the collections and the loader**

`src/content.config.ts`:
```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { AttachmentSchema, EquipmentSchema, ExerciseSchema, TemplateSchema } from './lib/content/schemas';

// Generic knowledge only (spec §4.1). Personal values never live here.
const yamlIn = (dir: string) => glob({ pattern: '*.yaml', base: `./src/content/${dir}` });

export const collections = {
  equipment: defineCollection({ loader: yamlIn('equipment'), schema: EquipmentSchema }),
  attachments: defineCollection({ loader: yamlIn('attachments'), schema: AttachmentSchema }),
  exercises: defineCollection({ loader: yamlIn('exercises'), schema: ExerciseSchema }),
  templates: defineCollection({ loader: yamlIn('templates'), schema: TemplateSchema }),
};
```

`src/catalog.ts`:
```ts
import { getCollection } from 'astro:content';
import { buildCatalog, CatalogError, type Catalog } from './lib/content/catalog';

let cached: Promise<Catalog> | undefined;

/**
 * The validated content catalog, for page frontmatter (build time). This is the only module that reads
 * content collections for the engine; it throws — failing the build — on any broken cross-reference.
 */
export function loadCatalog(): Promise<Catalog> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Catalog> {
  const [equipment, attachments, exercises, templates] = await Promise.all([
    getCollection('equipment'),
    getCollection('attachments'),
    getCollection('exercises'),
    getCollection('templates'),
  ]);
  const misnamed = [...equipment, ...attachments, ...exercises, ...templates]
    .filter((e) => e.id !== e.data.id)
    .map((e) => `${e.collection}: file "${e.id}.yaml" must be named after its id "${e.data.id}"`);
  if (misnamed.length > 0) throw new CatalogError(misnamed);
  return buildCatalog({
    equipment: equipment.map((e) => e.data),
    attachments: attachments.map((e) => e.data),
    exercises: exercises.map((e) => e.data),
    templates: templates.map((e) => e.data),
  });
}
```

- [ ] **Step 3: Add the generic equipment**

`src/content/equipment/smith-functional-trainer.yaml`:
```yaml
# Generic equipment class. Parameters say what to measure; values live only in the user's browser profile.
id: smith-functional-trainer
kind: station
name: { en: Smith machine + functional trainer, zh: 史密斯机综合训练器 }
capabilities: [smith-bar, rack-uprights, j-hooks, spotter-arms, safety-catches, cable-column, pull-up-bar]
parameters:
  smithLowestBarHeightCm:
    type: cm
    label: { en: Lowest Smith bar height, zh: 史密斯杠最低高度 }
    how:
      en: "Lower the bar onto its bottom stop; measure floor to the centre of the bar"
      zh: "把杠铃放到最低限位上，量出地面到杠铃中心的高度"
  smithHighestBarHeightCm:
    type: cm
    label: { en: Highest Smith bar height, zh: 史密斯杠最高高度 }
    how:
      en: "Raise the bar to the top of its travel; measure floor to the centre of the bar"
      zh: "把杠铃升到行程最高处，量出地面到杠铃中心的高度"
  smithRailAngleDeg:
    type: deg
    label: { en: Smith rail angle, zh: 史密斯导轨角度 }
    how:
      en: "0 = vertical rails; otherwise the tilt from vertical, as printed in the manual"
      zh: "0 表示导轨垂直；否则填写说明书上标注的与垂直方向的夹角"
  rackInnerDepthCm:
    type: cm
    label: { en: Inside depth of the rack, zh: 架子内部深度 }
    how:
      en: "Front to back, measured between the inner faces of the uprights"
      zh: "从前到后，量出立柱内侧面之间的距离"
  rackInnerWidthCm:
    type: cm
    label: { en: Inside width of the rack, zh: 架子内部宽度 }
    how:
      en: "Left to right, measured between the inner faces of the uprights"
      zh: "从左到右，量出立柱内侧面之间的距离"
  rackHeightCm:
    type: cm
    label: { en: Rack height, zh: 架子高度 }
    how:
      en: "Floor to the highest point of the frame"
      zh: "地面到框架最高点的高度"
  pullUpBarHeightCm:
    type: cm
    label: { en: Pull-up bar height, zh: 引体向上杆高度 }
    how:
      en: "Floor to top of the pull-up bar"
      zh: "地面到引体向上杆顶部的高度"
  safetyCatchMinHeightCm:
    type: cm
    label: { en: Lowest safety-catch height, zh: 保护杆最低高度 }
    how:
      en: "Set the safety catches in their lowest position; measure floor to their top surface"
      zh: "把保护杆放到最低位置，量出地面到其上表面的高度"
  cableColumns:
    type: count
    label: { en: Cable columns, zh: 拉力柱数量 }
    how:
      en: "Number of independent pulley columns"
      zh: "可以独立使用的滑轮柱数量"
  pulleyPositions:
    type: enum-set
    values: [high, chest, low]
    label: { en: Pulley positions, zh: 滑轮位置 }
    how:
      en: "Tick every height the pulleys can be set to"
      zh: "勾选滑轮可以调节到的所有高度"
  cableStack:
    type: stack
    label: { en: Weight stack, zh: 配重片 }
    how:
      en: "First and last number printed on the stack, the step, and the unit"
      zh: "配重片上印的第一个和最后一个数字、每档间隔以及单位"
  cableRatio:
    type: enum
    values: ["1:1", "2:1", "4:1", unknown]
    label: { en: Cable ratio, zh: 拉力比 }
    how:
      en: "From the manual; leave unknown if unsure"
      zh: "以说明书为准；不确定就选“未知”"
  benchFitsInsideRack:
    type: bool
    label: { en: Bench fits inside the rack, zh: 训练凳能放进架子内 }
    how:
      en: "Can the bench, backrest included, sit fully between the uprights at every angle you use?"
      zh: "训练凳（包括靠背）在你使用的每个角度下，能否完全放在立柱之间？"
# Typical dimensions (D12): drawn on generic pages (labeled "illustrative") and used by the geometry
# checks for anything the user has not measured. Not anyone's machine. Smith bar heights are bar-centre
# heights, equal to ILLUSTRATIVE_SMITH.lowestBarHeightCm / highestBarHeightCm.
illustrativeDefaults:
  smithLowestBarHeightCm: 40
  smithHighestBarHeightCm: 180
  smithRailAngleDeg: 0
  rackInnerDepthCm: 100
  rackInnerWidthCm: 120
  rackHeightCm: 215
  pullUpBarHeightCm: 210
  benchFitsInsideRack: true
```

`src/content/equipment/adjustable-bench.yaml`:
```yaml
id: adjustable-bench
kind: bench
name: { en: Adjustable bench, zh: 可调训练凳 }
capabilities: [flat-bench, incline-bench]
parameters:
  seatHeightCm:
    type: cm
    label: { en: Seat height, zh: 坐垫高度 }
    how:
      en: "Floor to the top of the seat pad"
      zh: "地面到坐垫顶部的高度"
  backrestLengthCm:
    type: cm
    label: { en: Backrest length, zh: 靠背长度 }
    how:
      en: "Along the backrest pad, from the hinge end to the far end"
      zh: "沿靠背垫从铰链端量到另一端的长度"
  backrestAnglesDeg:
    type: enum-set
    values: ["0", "15", "30", "45", "60", "75", "90"]
    label: { en: Backrest angles, zh: 靠背角度 }
    how:
      en: "Tick each angle the backrest locks at (nearest listed value)"
      zh: "勾选靠背可以锁定的每个角度（选最接近的数值）"
illustrativeDefaults:
  seatHeightCm: 43
  backrestLengthCm: 80
```

`src/content/equipment/dumbbells.yaml`:
```yaml
id: dumbbells
kind: free-weight
name: { en: Dumbbells, zh: 哑铃 }
capabilities: [dumbbells]
parameters:
  dumbbellLoads:
    type: weights
    label: { en: Dumbbell pairs, zh: 哑铃重量 }
    how:
      en: "The load printed on each pair you own, and the unit"
      zh: "你拥有的每对哑铃上印的重量，以及单位"
```

- [ ] **Step 4: Add the attachments**

`src/content/attachments/rope.yaml`:
```yaml
id: rope
name: { en: Rope attachment, zh: 绳索把手 }
fits: [cable-column]
```

`src/content/attachments/close-grip-row-handle.yaml`:
```yaml
id: close-grip-row-handle
name: { en: Close-grip row handle, zh: 窄握划船把手 }
fits: [cable-column]
```

`src/content/attachments/single-handle.yaml`:
```yaml
id: single-handle
name: { en: Single handle, zh: 单手把手 }
fits: [cable-column]
```

`src/content/attachments/lat-bar.yaml`:
```yaml
id: lat-bar
name: { en: Lat pulldown bar, zh: 高位下拉杆 }
fits: [cable-column]
```

`src/content/attachments/ankle-strap.yaml`:
```yaml
id: ankle-strap
name: { en: Ankle strap, zh: 脚踝绑带 }
fits: [cable-column]
```

`src/content/attachments/row-footplate.yaml`:
```yaml
id: row-footplate
name: { en: Seated-row footplate, zh: 坐姿划船踏板 }
fits: [cable-column]
```

`src/content/attachments/roller-hold-down.yaml`:
```yaml
# A fixed kneeling pad with rollers pinned to an upright (no pivot, no cable).
id: roller-hold-down
name: { en: Roller hold-down pad, zh: 滚轴固定垫 }
fits: [rack-uprights]
uses:
  - { id: nordic-curl, name: { en: Nordic curl anchor, zh: 北欧腿弯举固定 } }
  - { id: sit-up-anchor, name: { en: Sit-up anchor, zh: 仰卧起坐固定 } }
  - { id: thigh-restraint, name: { en: Thigh restraint, zh: 大腿固定 } }
```

- [ ] **Step 5: Add the exercise**

`src/content/exercises/smith-squat.yaml` (alternatives arrive with their exercises in M5):
```yaml
id: smith-squat
name: { en: Smith Machine Squat, zh: 史密斯机深蹲 }
pattern: squat
muscles: { primary: [quadriceps, glutes], secondary: [adductors, spinal-erectors] }
requires:
  capabilities: [smith-bar]
  attachments: []
tags: []
jointStress: { knee: moderate, lowBack: moderate, shoulder: low, wrist: low }
guideSection: lower-squat
setupState: { station: smith }
setupSeconds: 60
repSeconds: 4
setup:
  en: "Set the safety catches just below the bottom of your squat. Hook the bar at about shoulder height and stand with your feet slightly in front of the bar."
  zh: "把保护杆设在深蹲最低点稍下方。杠铃挂在约与肩同高的位置，双脚站在杠铃略前方。"
cues:
  - { en: "Rotate the bar off the hooks and brace before you descend", zh: "转动杠铃脱钩，下蹲前先收紧核心" }
  - { en: "Sit down between your heels until your thighs are about parallel", zh: "向下坐到两脚跟之间，直到大腿约与地面平行" }
  - { en: "Push the floor away and keep your heels down", zh: "用力蹬地起身，脚跟始终踩实" }
mistakes:
  - { en: "Feet directly under the bar, which pushes the knees far forward", zh: "双脚正好站在杠铃正下方，导致膝盖过度前移" }
  - { en: "Heels lifting at the bottom", zh: "在最低点脚跟抬起" }
warmup:
  en: "One set of 10 with the empty bar, then one lighter set of 5 before your working sets."
  zh: "先用空杠做一组 10 次，再用较轻重量做一组 5 次，然后开始正式组。"
safety:
  en: "Always set the catches before loading the bar, and never remove the bottom stops."
  zh: "上杠铃片之前务必先设置好保护杆，切勿拆除最低限位。"
alternatives: []
figure: { spec: smith-squat }
```

```bash
mkdir -p src/content/templates
```

- [ ] **Step 6: Check content on every build**

Replace `src/pages/[lang]/fitness/index.astro` with:
```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { requireLocale, localeStaticPaths, t } from '../../../lib/i18n';
import { loadCatalog } from '../../../catalog';

export function getStaticPaths() {
  return localeStaticPaths();
}
const lang = requireLocale(Astro.params.lang);
// Loading the catalog cross-checks all content; a broken reference fails the build (spec §14).
await loadCatalog();
---
<BaseLayout lang={lang} title={t(lang, 'fitness.title')} description={t(lang, 'area.fitness.summary')}>
  <h1>{t(lang, 'fitness.title')}</h1>
  <p class="lead">{t(lang, 'fitness.intro')}</p>
</BaseLayout>
```

- [ ] **Step 7: Verify the build accepts the content**

Run: `npm run build`
Expected: `Complete!` with the same page count as `main`; the only warnings are the two expected `templates` warnings above.

- [ ] **Step 8: Verify the build rejects bad content (then revert)**

```bash
sed -i.bak 's/^alternatives: \[\]/alternatives: [goblet-squat]/' src/content/exercises/smith-squat.yaml
npm run build 2>&1 | grep -A1 "CatalogError"
mv src/content/exercises/smith-squat.yaml.bak src/content/exercises/smith-squat.yaml
sed -i.bak 's/zh: 史密斯机深蹲 }/zh: Smith }/' src/content/exercises/smith-squat.yaml
npm run build 2>&1 | grep "zh text must contain Chinese characters"
mv src/content/exercises/smith-squat.yaml.bak src/content/exercises/smith-squat.yaml
sed -i.bak '/^  benchFitsInsideRack: true$/d' src/content/equipment/smith-functional-trainer.yaml
npm run build 2>&1 | grep -A1 "CatalogError"
mv src/content/equipment/smith-functional-trainer.yaml.bak src/content/equipment/smith-functional-trainer.yaml
git status --short src/content
```
Expected: the first build fails with `CatalogError: Content catalog has 1 problem(s):` / `- exercise "smith-squat": unknown alternative "goblet-squat"`; the second fails with `name.zh: zh text must contain Chinese characters`; the third fails with `- equipment "smith-functional-trainer": parameter "benchFitsInsideRack" is read by the geometry checks and needs an illustrative default`; `git status` lists only the new, untracked content files (both edited files are back to the versions above).

- [ ] **Step 9: Run the checks**

Run: `npm test && npm run lint && npm run check`
Expected: all unit tests pass; 0 lint and type errors.

- [ ] **Step 10: Commit, open the PR, merge when CI is green**

```bash
git add src/content.config.ts src/catalog.ts src/content "src/pages/[lang]/fitness/index.astro"
git commit -m $'feat(content): add content collections, generic seed content and build-time checks\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Content collections, generic seed content and build-time checks" \
  --body $'Astro collections with the Zod schemas; loadCatalog() fails the build on broken references. Seed content is generic with illustrative dimensions only.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** `npm run build` passes with the seed content and fails on a broken reference, a missing translation or a missing typical value for a geometry parameter.

---
### Task 6: Profile schema, migrations and JSON import/export

The browser-only profile of spec §6: its schema (strict, so nothing beyond the listed fields can be stored), a migration runner, validation that turns Zod issues into localizable field errors, and JSON export/import.

Owner decision 1: equipment parameter values use `ParamValue` from Task 1, because `stack`, `weights` and `enum` values do not fit the spec's `number | boolean | string[]`. Per D12 every value in the profile is optional (stature, ceiling, limitations and each equipment parameter); stored parameters override the equipment's typical dimensions, and nothing prompts for them.

**Files:**
- Create: `src/lib/profile/schema.ts`, `src/lib/profile/migrate.ts`, `src/lib/profile/parse.ts`, `src/lib/profile/transfer.ts`
- Test: `src/lib/profile/schema.test.ts`, `src/lib/profile/migrate.test.ts`, `src/lib/profile/transfer.test.ts`

**Interfaces:**
- Consumes: Task 1 (`IdSchema`, `ParamNameSchema`, `ParamValueSchema`, `LIMITATIONS`, `WEEKDAYS`), Task 2 (`Message`), `LOCALES`/`Locale`.
- Produces:
  - `schema.ts`: `PROFILE_VERSION = 1`, `DEFAULT_CLEARANCE_MARGIN_CM = 10`, `DEFAULT_TEMPLATE_ID = 'split-6day-push-legs-core-pull-full-mobility'`, `DEFAULT_SESSION_MINUTES = 35`, `SLOT_KEY`, `ProfileSchema`, `Profile`, `defaultProfile(locale): Profile`.
  - `migrate.ts`: `Migration`, `MIGRATIONS` (empty at version 1), `MigrateResult`, `migrate(raw, migrations?, current?)`.
  - `parse.ts`: `FieldError = { path: string; message: Message }`, `ParseResult = { ok: true; profile; migratedFrom? } | { ok: false; errors: FieldError[] }`, `parseProfile(raw: unknown): ParseResult`.
  - `transfer.ts`: `exportProfile(profile): string`, `exportFileName(date): string` (`aih-profile-YYYY-MM-DD.json`), `importProfile(text): ParseResult`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-profile-schema
```

- [ ] **Step 2: Write the failing tests**

`src/lib/profile/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultProfile, ProfileSchema } from './schema';

const valid = () => ({
  ...defaultProfile('en'),
  statureCm: 172,
  room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 }, // a standard 8 ft ceiling
  equipment: [
    {
      id: 'smith-functional-trainer',
      params: {
        smithLowestBarHeightCm: 45,
        pulleyPositions: ['high', 'low'],
        cableStack: { first: 5, last: 80, step: 5, unit: 'kg' },
        benchFitsInsideRack: true,
      },
    },
  ],
  attachments: ['rope'],
  limitations: ['wrist-sensitive'],
  schedule: { templateId: 'split-6day-push-legs-core-pull-full-mobility', sessionMinutes: 30, overrides: { 'mon/0': 'smith-squat' } },
});

describe('ProfileSchema', () => {
  it('accepts the default profile in both locales', () => {
    expect(ProfileSchema.parse(defaultProfile('en')).locale).toBe('en');
    expect(ProfileSchema.parse(defaultProfile('zh')).locale).toBe('zh');
  });
  it('accepts a filled-in synthetic profile', () => {
    expect(ProfileSchema.parse(valid()).equipment[0]!.params.smithLowestBarHeightCm).toBe(45);
  });
  it('defaults the clearance margin to 10 cm', () => {
    const p = ProfileSchema.parse({ ...valid(), room: {} });
    expect(p.room.clearanceMarginCm).toBe(10);
  });
  it('rejects fields the site never collects', () => {
    expect(ProfileSchema.safeParse({ ...valid(), name: 'A' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), age: 40 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), room: { clearanceMarginCm: 10, notes: 'x' } }).success).toBe(false);
  });
  it('rejects bad override keys, duplicate equipment and unknown limitations', () => {
    const v = valid();
    expect(ProfileSchema.safeParse({ ...v, schedule: { ...v.schedule, overrides: { monday: 'smith-squat' } } }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, equipment: [...v.equipment, ...v.equipment] }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...v, limitations: ['hip-sensitive'] }).success).toBe(false);
  });
  it('rejects an out-of-range stature and a wrong version', () => {
    expect(ProfileSchema.safeParse({ ...valid(), statureCm: 20 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid(), version: 2 }).success).toBe(false);
  });
});
```

`src/lib/profile/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from './migrate';
import { defaultProfile, PROFILE_VERSION } from './schema';

describe('migrate', () => {
  it('passes a current profile through unchanged', () => {
    const p = defaultProfile('en');
    expect(migrate(p)).toEqual({ ok: true, value: p, from: PROFILE_VERSION });
  });
  it('rejects values that are not profiles', () => {
    for (const raw of [null, 42, 'x', [], {}, { version: 0 }, { version: '1' }, { version: 1.5 }]) {
      expect(migrate(raw), JSON.stringify(raw)).toEqual({ ok: false, error: 'not-profile' });
    }
  });
  it('rejects a profile from a newer version of the site', () => {
    expect(migrate({ version: PROFILE_VERSION + 1 })).toEqual({ ok: false, error: 'newer-version', version: PROFILE_VERSION + 1 });
  });
  it('applies each step in order and stamps the new version', () => {
    const migrations = {
      1: (o: Record<string, unknown>) => ({ ...o, room: { ...(o.room as object), clearanceMarginCm: 12 } }),
      2: (o: Record<string, unknown>) => ({ ...o, renamed: true }),
    };
    const result = migrate({ version: 1, room: {} }, migrations, 3);
    expect(result).toEqual({ ok: true, from: 1, value: { version: 3, room: { clearanceMarginCm: 12 }, renamed: true } });
  });
  it('throws when a step is missing (a developer error)', () => {
    expect(() => migrate({ version: 1 }, {}, 2)).toThrow('No profile migration from version 1');
  });
  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < PROFILE_VERSION; v++) expect(MIGRATIONS[v], `from ${v}`).toBeTypeOf('function');
  });
});
```

`src/lib/profile/transfer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatMessage } from '../i18n/format';
import { defaultProfile, type Profile } from './schema';
import { exportFileName, exportProfile, importProfile } from './transfer';

const synthetic = (): Profile => ({
  ...defaultProfile('zh'),
  statureCm: 168,
  room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 }, // a standard 8 ft ceiling
  equipment: [{ id: 'dumbbells', params: { dumbbellLoads: { unit: 'kg', loads: [2, 4, 6, 8, 10] } } }],
});

describe('export / import', () => {
  it('round-trips a profile exactly', () => {
    const p = synthetic();
    const result = importProfile(exportProfile(p));
    expect(result).toEqual({ ok: true, profile: p });
  });
  it('names the file by local date', () => {
    expect(exportFileName(new Date(2026, 8, 30, 23, 59))).toBe('aih-profile-2026-09-30.json');
  });
  it('rejects text that is not JSON', () => {
    expect(importProfile('{oops')).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.notJson' } }] });
  });
  it('rejects JSON that is not a profile', () => {
    expect(importProfile('[1,2]')).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.notProfile' } }] });
  });
  it('rejects a newer profile version', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), version: 9 }));
    expect(r).toEqual({ ok: false, errors: [{ path: '', message: { key: 'profile.error.newerVersion', params: { version: 9 } } }] });
  });
  it('reports field-level errors', () => {
    const bad = { ...synthetic(), statureCm: 20, locale: 'fr', name: 'A', room: { clearanceMarginCm: 10 }, units: { length: 'cm' } };
    const r = importProfile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { path: 'statureCm', message: { key: 'profile.error.range' } },
        { path: 'locale', message: { key: 'profile.error.choice' } },
        { path: 'units.mass', message: { key: 'profile.error.required' } },
        { path: '', message: { key: 'profile.error.unknownField', params: { field: 'name' } } },
      ]),
    );
  });
  it('reports wrong value types', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), statureCm: '168' }));
    expect(r).toEqual({ ok: false, errors: [{ path: 'statureCm', message: { key: 'profile.error.type' } }] });
  });
  it('produces errors that read in both languages', () => {
    const r = importProfile(JSON.stringify({ ...synthetic(), statureCm: 20 }));
    if (r.ok) throw new Error('expected an error');
    expect(formatMessage('en', r.errors[0]!.message)).toBe('Outside the allowed range');
    expect(formatMessage('zh', r.errors[0]!.message)).toBe('超出允许范围');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/profile`
Expected: FAIL — `Failed to resolve import "./schema"` (and `./migrate`, `./transfer`).

- [ ] **Step 4: Implement**

`src/lib/profile/schema.ts`:
```ts
import { z } from 'zod';
import { IdSchema, ParamNameSchema } from '../content/common';
import { ParamValueSchema } from '../content/params';
import { LIMITATIONS, WEEKDAYS } from '../content/vocab';
import { LOCALES, type Locale } from '../i18n/locales';

/** Bump on every schema change and add a migration (spec §6). */
export const PROFILE_VERSION = 1;
export const DEFAULT_CLEARANCE_MARGIN_CM = 10;
export const DEFAULT_TEMPLATE_ID = 'split-6day-push-legs-core-pull-full-mobility';
export const DEFAULT_SESSION_MINUTES = 35;

/** "mon/0" = Monday, first slot. */
export const SLOT_KEY = new RegExp(`^(${WEEKDAYS.join('|')})/\\d+$`);

/**
 * The visitor's profile (spec §6). Lives only in the browser. Stored lengths are centimetres; `units`
 * affects display only. Objects are strict, so nothing beyond these fields (no name, age, weight or
 * health notes) can be stored or imported.
 */
export const ProfileSchema = z.strictObject({
  version: z.literal(PROFILE_VERSION),
  locale: z.enum(LOCALES),
  units: z.strictObject({ length: z.enum(['cm', 'in']), mass: z.enum(['kg', 'lb']) }),
  statureCm: z.number().min(100).max(250).optional(),
  room: z.strictObject({
    ceilingHeightCm: z.number().min(150).max(600).optional(),
    clearanceMarginCm: z.number().min(0).max(50).default(DEFAULT_CLEARANCE_MARGIN_CM),
  }),
  equipment: z
    .array(z.strictObject({ id: IdSchema, params: z.record(ParamNameSchema, ParamValueSchema).default({}) }))
    .refine((list) => new Set(list.map((e) => e.id)).size === list.length, { message: 'each equipment id once' }),
  attachments: z.array(IdSchema),
  exclusions: z.array(IdSchema),
  limitations: z.array(z.enum(LIMITATIONS)),
  schedule: z.strictObject({
    templateId: IdSchema,
    sessionMinutes: z.number().int().min(10).max(180),
    overrides: z.record(z.string().regex(SLOT_KEY), IdSchema),
  }),
});
export type Profile = z.output<typeof ProfileSchema>;

/** A fresh profile: nothing owned or entered yet (the engine then uses typical values, D12), metric display. */
export function defaultProfile(locale: Locale): Profile {
  return {
    version: PROFILE_VERSION,
    locale,
    units: { length: 'cm', mass: 'kg' },
    room: { clearanceMarginCm: DEFAULT_CLEARANCE_MARGIN_CM },
    equipment: [],
    attachments: [],
    exclusions: [],
    limitations: [],
    schedule: { templateId: DEFAULT_TEMPLATE_ID, sessionMinutes: DEFAULT_SESSION_MINUTES, overrides: {} },
  };
}
```

`src/lib/profile/migrate.ts`:
```ts
import { PROFILE_VERSION } from './schema';

type Raw = Record<string, unknown>;

/** Turns a profile of version n into version n + 1. */
export type Migration = (old: Raw) => Raw;

/**
 * Keyed by the version they migrate FROM. Every schema change bumps PROFILE_VERSION and adds an
 * entry here with a test (spec §6, §11). Version 1 is the first version, so there are none yet.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type MigrateResult =
  | { ok: true; value: Raw; from: number }
  | { ok: false; error: 'not-profile' }
  | { ok: false; error: 'newer-version'; version: number };

const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Bring a stored or imported value up to the current version. Validation happens afterwards. */
export function migrate(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, current = PROFILE_VERSION): MigrateResult {
  if (!isRaw(raw)) return { ok: false, error: 'not-profile' };
  const from = raw.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { ok: false, error: 'not-profile' };
  if (from > current) return { ok: false, error: 'newer-version', version: from };
  let value = raw;
  for (let v = from; v < current; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No profile migration from version ${v}`);
    value = { ...step(value), version: v + 1 };
  }
  return { ok: true, value, from };
}
```

`src/lib/profile/parse.ts`:
```ts
import type { z } from 'zod';
import type { Message } from '../i18n/format';
import { migrate } from './migrate';
import { type Profile, PROFILE_VERSION, ProfileSchema } from './schema';

/** One problem, located by a dotted path ("room.ceilingHeightCm"); "" = the whole file. */
export interface FieldError {
  path: string;
  message: Message;
}

export type ParseResult = { ok: true; profile: Profile; migratedFrom?: number } | { ok: false; errors: FieldError[] };

function issueMessage(issue: z.core.$ZodIssue): Message {
  // Parsed with reportInput: an undefined input means the field was absent (JSON has no undefined).
  const absent = issue.input === undefined;
  switch (issue.code) {
    case 'invalid_type':
      return { key: absent ? 'profile.error.required' : 'profile.error.type' };
    case 'invalid_value':
      return { key: absent ? 'profile.error.required' : 'profile.error.choice' };
    case 'too_small':
    case 'too_big':
      return { key: 'profile.error.range' };
    case 'unrecognized_keys':
      return { key: 'profile.error.unknownField', params: { field: issue.keys.join(', ') } };
    default:
      return { key: 'profile.error.invalid' };
  }
}

/** Migrate and validate a stored or imported value. Errors are localizable, field by field. */
export function parseProfile(raw: unknown): ParseResult {
  const migrated = migrate(raw);
  if (!migrated.ok) {
    const message: Message =
      migrated.error === 'newer-version'
        ? { key: 'profile.error.newerVersion', params: { version: migrated.version } }
        : { key: 'profile.error.notProfile' };
    return { ok: false, errors: [{ path: '', message }] };
  }
  const parsed = ProfileSchema.safeParse(migrated.value, { reportInput: true });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: issueMessage(i) })) };
  }
  return migrated.from === PROFILE_VERSION
    ? { ok: true, profile: parsed.data }
    : { ok: true, profile: parsed.data, migratedFrom: migrated.from };
}
```

`src/lib/profile/transfer.ts`:
```ts
import { type ParseResult, parseProfile } from './parse';
import type { Profile } from './schema';

/** JSON export (spec §6). The file holds exactly the profile, nothing else. */
export function exportProfile(profile: Profile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** e.g. "aih-profile-2026-09-30.json" (local date). */
export function exportFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `aih-profile-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Validate an import file before anything is overwritten (spec §11). */
export function importProfile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: '', message: { key: 'profile.error.notJson' } }] };
  }
  return parseProfile(raw);
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/profile && npm run lint && npm run check`
Expected: 20 passed (schema 6, migrate 6, transfer 8); 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/profile
git commit -m $'feat(profile): add the profile schema, migrations and JSON import/export\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Profile schema, migrations and JSON import/export" \
  --body $'Strict profile schema, migration runner, localizable field-level import errors, JSON export.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** a profile round-trips through export/import, invalid files produce field errors in both languages, and the migration runner is tested.

---

### Task 7: Profile storage adapter (localStorage, memory, backups)

The only code that touches browser storage (spec §4.2). It keeps a corrupt profile under a timestamped backup key and falls back to memory when `localStorage` is missing or throws (spec §11).

Storage errors never reach the caller (spec §11, data safety). `browserStorage()` checks availability with a read only (accessing `localStorage` and calling `getItem` throw in private or blocked modes); it never probes with a write, because a full quota would then hide a saved profile. Write, read and remove failures at runtime (quota, `SecurityError`) switch the store to memory for the rest of the session: `persistent` turns false, `save()` returns false and keeps the profile in memory, and nothing touches persistent storage again. So a corrupt profile whose backup could not be written stays in place and no later `save()` overwrites it, and a migrated profile whose re-save fails is still returned.

Owner decision 16: on a failed read the raw text is copied to `aih.profile.backup.<timestamp>` and `aih.profile` is removed, so the site starts clean and the backup is kept once. `aih.profile` is removed only after the backup is written; a backup key already taken in the same millisecond gets a `-1`, `-2`… suffix instead of being overwritten.

**Files:**
- Create: `src/lib/profile/storage.ts`, `src/lib/profile/index.ts`
- Test: `src/lib/profile/storage.test.ts`

**Interfaces:**
- Consumes: Task 6 (`parseProfile`, `FieldError`, `ProfileSchema`, `Profile`).
- Produces: `PROFILE_KEY = 'aih.profile'`, `BACKUP_PREFIX = 'aih.profile.backup.'`, `KeyValueStorage`, `MemoryStorage` (+ `keys()`), `browserStorage(): KeyValueStorage | null` (read-only availability check), `LoadResult = { status: 'empty' } | { status: 'ok'; profile; migratedFrom? } | { status: 'corrupt'; backupKey: string | null; errors }`, `class ProfileStore { constructor(storage | null, now?); get persistent(): boolean /* read-only; turns false for good after a storage error */; load(): LoadResult /* never throws */; save(profile): boolean /* true = persisted; throws only on an invalid profile */; clear(): boolean /* true = persisted */ }`, `openProfileStore()`; `src/lib/profile/index.ts` re-exports the module's public API.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-profile-storage
```

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseProfile } from './parse';
import { defaultProfile, type Profile } from './schema';
import { BACKUP_PREFIX, browserStorage, type KeyValueStorage, MemoryStorage, openProfileStore, PROFILE_KEY, ProfileStore } from './storage';

// Pass-through by default; one test swaps in a result that reports a migration (version 1 has none yet).
vi.mock('./parse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parse')>();
  return { ...actual, parseProfile: vi.fn(actual.parseProfile) };
});

const NOW = 1_790_000_000_000;
const synthetic = (): Profile => ({ ...defaultProfile('en'), statureCm: 181, room: { ceilingHeightCm: 243.84, clearanceMarginCm: 10 } }); // 8 ft ceiling

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
const blocked = () => new DOMException('The operation is insecure.', 'SecurityError');

/** Wraps `inner`, making the named operations throw. */
function failing(inner: KeyValueStorage, fail: { get?: boolean; set?: boolean; remove?: boolean }): KeyValueStorage {
  return {
    getItem: (k) => {
      if (fail.get) throw blocked();
      return inner.getItem(k);
    },
    setItem: (k, v) => {
      if (fail.set) throw quota();
      inner.setItem(k, v);
    },
    removeItem: (k) => {
      if (fail.remove) throw blocked();
      inner.removeItem(k);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProfileStore', () => {
  it('reports an empty store', () => {
    expect(new ProfileStore(new MemoryStorage()).load()).toEqual({ status: 'empty' });
  });

  it('saves and loads under aih.profile', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(storage);
    expect(store.save(synthetic())).toBe(true);
    expect(storage.keys()).toEqual([PROFILE_KEY]);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });

  it('refuses to save an invalid profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    expect(() => store.save({ ...synthetic(), statureCm: 5 })).toThrow();
  });

  it('refuses an invalid profile even when storage is failing', () => {
    const store = new ProfileStore(failing(new MemoryStorage(), { set: true }));
    expect(() => store.save({ ...synthetic(), statureCm: 5 })).toThrow();
    expect(store.persistent).toBe(true);
  });

  it('moves an invalid profile to a timestamped backup and keeps working', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ ...synthetic(), statureCm: 'tall' });
    storage.setItem(PROFILE_KEY, raw);
    const result = new ProfileStore(storage, () => NOW).load();
    expect(result).toEqual({
      status: 'corrupt',
      backupKey: `${BACKUP_PREFIX}${NOW}`,
      errors: [{ path: 'statureCm', message: { key: 'profile.error.type' } }],
    });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe(raw);
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('backs up text that is not JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const result = new ProfileStore(storage, () => NOW).load();
    expect(result).toMatchObject({ status: 'corrupt', errors: [{ path: '', message: { key: 'profile.error.notJson' } }] });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('{broken');
  });

  it('never overwrites an earlier backup made in the same millisecond', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${BACKUP_PREFIX}${NOW}`, 'first');
    storage.setItem(PROFILE_KEY, '{second');
    expect(new ProfileStore(storage, () => NOW).load()).toMatchObject({ status: 'corrupt', backupKey: `${BACKUP_PREFIX}${NOW}-1` });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('first');
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}-1`)).toBe('{second');
  });

  it('leaves the original in place when the backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: null });
    expect(storage.getItem(PROFILE_KEY)).toBe('{broken');
    expect(storage.keys()).toEqual([PROFILE_KEY]);
  });

  it('never overwrites a corrupt original that has no backup', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    let full = true;
    const flaky: KeyValueStorage = {
      getItem: (k) => storage.getItem(k),
      removeItem: (k) => storage.removeItem(k),
      setItem: (k, v) => {
        if (full) throw quota();
        storage.setItem(k, v);
      },
    };
    const store = new ProfileStore(flaky);
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: null });
    expect(store.persistent).toBe(false);
    full = false; // space frees up later in the session
    expect(store.save(synthetic())).toBe(false);
    store.clear();
    expect(storage.getItem(PROFILE_KEY)).toBe('{broken');
    expect(storage.keys()).toEqual([PROFILE_KEY]);
  });

  it('keeps the backup and switches to memory when the original cannot be removed', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{broken');
    const store = new ProfileStore(failing(storage, { remove: true }), () => NOW);
    expect(store.load()).toMatchObject({ status: 'corrupt', backupKey: `${BACKUP_PREFIX}${NOW}` });
    expect(storage.getItem(`${BACKUP_PREFIX}${NOW}`)).toBe('{broken');
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('keeps a profile in memory when a save hits the quota', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.persistent).toBe(true);
    expect(store.save(synthetic())).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
    expect(storage.keys()).toEqual([]);
  });

  it('returns a migrated profile when the re-save hits the quota', () => {
    const storage = new MemoryStorage();
    const older = JSON.stringify({ ...synthetic(), version: 0 });
    storage.setItem(PROFILE_KEY, older);
    vi.mocked(parseProfile).mockReturnValueOnce({ ok: true, profile: synthetic(), migratedFrom: 0 });
    const store = new ProfileStore(failing(storage, { set: true }));
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic(), migratedFrom: 0 });
    expect(store.persistent).toBe(false);
    expect(storage.getItem(PROFILE_KEY)).toBe(older);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });

  it('re-saves a migrated profile when storage works', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ ...synthetic(), version: 0 }));
    vi.mocked(parseProfile).mockReturnValueOnce({ ok: true, profile: synthetic(), migratedFrom: 0 });
    const store = new ProfileStore(storage);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic(), migratedFrom: 0 });
    expect(store.persistent).toBe(true);
    expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? '')).toEqual(synthetic());
  });

  it('switches to memory instead of throwing when getItem throws', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify(synthetic()));
    const store = new ProfileStore(failing(storage, { get: true }));
    expect(store.load()).toEqual({ status: 'empty' });
    expect(store.persistent).toBe(false);
    const changed = { ...synthetic(), statureCm: 170 };
    expect(store.save(changed)).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: changed });
    expect(JSON.parse(storage.getItem(PROFILE_KEY) ?? '')).toEqual(synthetic());
  });

  it('switches to memory instead of throwing when removeItem throws', () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(failing(storage, { remove: true }));
    expect(store.save(synthetic())).toBe(true);
    expect(store.clear()).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('clear() removes the profile', () => {
    const store = new ProfileStore(new MemoryStorage());
    store.save(synthetic());
    expect(store.clear()).toBe(true);
    expect(store.load()).toEqual({ status: 'empty' });
  });

  it('runs in memory without storage', () => {
    const store = new ProfileStore(null);
    expect(store.persistent).toBe(false);
    expect(store.save(synthetic())).toBe(false);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });
});

describe('browserStorage', () => {
  it('returns null when localStorage is missing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(browserStorage()).toBeNull();
    expect(openProfileStore().persistent).toBe(false);
  });
  it('returns null when the localStorage accessor throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw blocked();
      },
    });
    try {
      expect(browserStorage()).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it('returns null when getItem throws', () => {
    vi.stubGlobal('localStorage', failing(new MemoryStorage(), { get: true }));
    expect(browserStorage()).toBeNull();
  });
  it('still reads a saved profile when every write fails (full quota)', () => {
    const mem = new MemoryStorage();
    mem.setItem(PROFILE_KEY, JSON.stringify(synthetic()));
    const full = failing(mem, { set: true });
    vi.stubGlobal('localStorage', full);
    expect(browserStorage()).toBe(full);
    const store = openProfileStore();
    expect(store.persistent).toBe(true);
    expect(store.load()).toEqual({ status: 'ok', profile: synthetic() });
  });
  it('returns a working localStorage without writing to it', () => {
    const mem = new MemoryStorage();
    vi.stubGlobal('localStorage', mem);
    expect(browserStorage()).toBe(mem);
    expect(openProfileStore().persistent).toBe(true);
    expect(mem.keys()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/profile/storage.test.ts`
Expected: FAIL — `Failed to resolve import "./storage"`.

- [ ] **Step 4: Implement**

`src/lib/profile/storage.ts`:
```ts
import { type FieldError, parseProfile } from './parse';
import { type Profile, ProfileSchema } from './schema';

/** Spec §6. */
export const PROFILE_KEY = 'aih.profile';
/** Spec §11: a profile that fails validation is kept under this prefix + a timestamp. */
export const BACKUP_PREFIX = 'aih.profile.backup.';

/** The subset of the Web Storage API this module uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory storage for when localStorage is unavailable (and for tests). */
export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  keys(): string[] {
    return [...this.items.keys()];
  }
}

/**
 * localStorage if it can be read, else null. Accessing `localStorage` or calling `getItem` throws
 * in private or blocked-cookie modes. The check is read-only on purpose: a full quota must not hide
 * a saved profile, and write failures are handled by ProfileStore at the time they happen.
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem(PROFILE_KEY);
    return s;
  } catch {
    return null;
  }
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; profile: Profile; migratedFrom?: number }
  /** The raw text was moved to `backupKey` (null if even that failed); the site keeps working. */
  | { status: 'corrupt'; backupKey: string | null; errors: FieldError[] };

/**
 * The only code that touches browser storage (spec §4.2). Every read goes through the schema;
 * nothing here ever sends data anywhere. Storage errors (quota, SecurityError) never reach the
 * caller: the first one switches the store to memory for the rest of the session, so it keeps
 * working and never writes over data it could not back up.
 */
export class ProfileStore {
  private storage: KeyValueStorage;
  private durable: boolean;

  constructor(storage: KeyValueStorage | null, private readonly now: () => number = Date.now) {
    this.durable = storage !== null;
    this.storage = storage ?? new MemoryStorage();
  }

  /**
   * False when changes live only in memory (the planner shows a "won't be saved" banner): there is
   * no storage, or a storage call failed earlier in the session. Once false, it stays false.
   */
  get persistent(): boolean {
    return this.durable;
  }

  /** Never throws. If storage cannot be read, the store switches to memory and reports `empty`. */
  load(): LoadResult {
    const text = this.read(PROFILE_KEY);
    if (text === null) return { status: 'empty' };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return this.quarantine(text, [{ path: '', message: { key: 'profile.error.notJson' } }]);
    }
    const parsed = parseProfile(raw);
    if (!parsed.ok) return this.quarantine(text, parsed.errors);
    if (parsed.migratedFrom === undefined) return { status: 'ok', profile: parsed.profile };
    // Best effort: if the re-save fails, the store switches to memory and the old text stays as it is.
    this.save(parsed.profile);
    return { status: 'ok', profile: parsed.profile, migratedFrom: parsed.migratedFrom };
  }

  /**
   * Validates, then writes. Returns true when the profile reached persistent storage and false when
   * it is kept in memory only (no storage, or the write failed, e.g. quota). Throws only on an
   * invalid profile (a developer error), never because of storage.
   */
  save(profile: Profile): boolean {
    const text = JSON.stringify(ProfileSchema.parse(profile));
    if (this.write(PROFILE_KEY, text)) return this.durable;
    this.storage.setItem(PROFILE_KEY, text); // the memory copy after the fallback
    return false;
  }

  /**
   * "Reset data": removes the profile (backups stay until the user clears site data). Returns
   * whether the removal reached persistent storage; on failure the store switches to memory.
   */
  clear(): boolean {
    return this.remove(PROFILE_KEY) && this.durable;
  }

  /**
   * Owner decision 16: back up the raw text, then remove it. The original is removed only after a
   * successful backup. If the backup fails, the store switches to memory, so no later save() can
   * overwrite the only copy.
   */
  private quarantine(text: string, errors: FieldError[]): LoadResult {
    const backupKey = this.freeBackupKey();
    if (backupKey === null || !this.write(backupKey, text)) return { status: 'corrupt', backupKey: null, errors };
    this.remove(PROFILE_KEY); // a failure leaves both copies and switches to memory
    return { status: 'corrupt', backupKey, errors };
  }

  /** `aih.profile.backup.<timestamp>`, with `-1`, `-2`… if that key is taken (same millisecond). */
  private freeBackupKey(): string | null {
    const base = `${BACKUP_PREFIX}${this.now()}`;
    for (let n = 0; ; n++) {
      const key = n === 0 ? base : `${base}-${n}`;
      try {
        if (this.storage.getItem(key) === null) return key;
      } catch {
        this.fallBackToMemory();
        return null;
      }
    }
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      this.fallBackToMemory();
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      this.fallBackToMemory();
      return false;
    }
  }

  private remove(key: string): boolean {
    try {
      this.storage.removeItem(key);
      return true;
    } catch {
      this.fallBackToMemory();
      return false;
    }
  }

  /** From now on nothing touches persistent storage, so data left there stays exactly as it is. */
  private fallBackToMemory(): void {
    this.storage = new MemoryStorage();
    this.durable = false;
  }
}

/**
 * The store the site uses: localStorage when available, otherwise memory only. Open it once and
 * share it: in memory mode each call gets its own empty store.
 */
export function openProfileStore(): ProfileStore {
  return new ProfileStore(browserStorage());
}
```

`src/lib/profile/index.ts`:
```ts
/** The browser-only profile (spec §6). Only storage.ts touches localStorage. */
export { MIGRATIONS, migrate } from './migrate';
export { type FieldError, parseProfile } from './parse';
export { defaultProfile, PROFILE_VERSION, type Profile, ProfileSchema } from './schema';
export { BACKUP_PREFIX, browserStorage, type KeyValueStorage, type LoadResult, MemoryStorage, openProfileStore, PROFILE_KEY, ProfileStore } from './storage';
export { exportFileName, exportProfile, importProfile } from './transfer';
```

- [ ] **Step 5: Confirm nothing else touches storage**

Run: `grep -rn "localStorage" src --include='*.ts' --include='*.tsx' --include='*.astro' | grep -v "^src/lib/profile/"`
Expected: no output.

- [ ] **Step 6: Run the tests and the checks**

Run: `npx vitest run src/lib/profile && npm run lint && npm run check`
Expected: 42 passed (storage 22); 0 lint and type errors.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/profile
git commit -m $'feat(profile): add the storage adapter with backups and in-memory fallback\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Profile storage adapter (localStorage, memory, backups)" \
  --body $'ProfileStore: validated reads, timestamped backup on corruption, memory fallback when storage is unavailable.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** corrupt data is backed up and the store keeps working; without `localStorage` it runs in memory and says so (`persistent: false`); no storage error (quota, blocked access) escapes `load`, `save` or `clear`, a failure switches the store to memory, and a corrupt profile without a backup is never overwritten.

---

### Task 8: Engine geometry checks with typical defaults

Spec §7.1 check 4 with the D12 rules for unknown inputs: an unknown stature poses at a typical 175 cm, an unknown ceiling is assumed to be 240 cm (exceeding it adds a "check overhead clearance" note, never a failure), and an unmeasured equipment parameter uses the equipment's illustrative default. Poses come from **probes**, functions that pose an exercise's frames at a stature and report its envelope, Smith-bar heights, ROM findings and any other pose problem. Task 9 adds the real Smith-squat probe; this task tests the rules with fixed synthetic probes.

Owner decisions 3 and 7: exercises without a probe (everything except the Smith squat until M3) use a conservative stature-based envelope (standing = stature; `vertical-push` = 1.33 × stature; with a pull-up bar = bar height + 0.13 × stature) and no ROM check. Exercises that move a Smith bar are never planned without a probe (`engine.reason.noGeometryModel`). Bench fit applies when an exercise uses a bench angle at a rack station (`smith`, `barbell`). A *measured* ceiling that is too low still fails the ceiling check.

Fail safe: an exercise that genuinely doesn't fit must be infeasible, never silently allowed. If a Smith stop or the bench-fit answer has no usable value (neither a valid measurement nor a typical value of the right type), the check fails with `engine.reason.stopsUnknown` (`bar-travel`) or `engine.reason.benchFitUnknown` (`bench-fit`) instead of being skipped; a probe that reports no bar heights gives `noGeometryModel`. `buildCatalog` closes the gap at build time (Step 6), so for owned equipment in a valid catalog these reasons are unreachable; the engine still handles them because `checkGeometry` is callable on its own and a thrown error would break the whole page. Bar heights in the stop messages are rounded outward (`Math.floor` below, `Math.ceil` above) so a bar just past a stop never reads as the stop itself.

This task also adds the shared engine types, parameter lookup and the synthetic fixtures every later engine test uses. Every fixture value is invented (spec §13); the tall-enough room is a standard 8 ft ceiling.

**Files:**
- Create: `src/lib/engine/types.ts`, `src/lib/engine/params.ts`, `src/lib/engine/geometry.ts`, `src/lib/engine/testing/fixtures.ts`
- Modify: `src/lib/content/vocab.ts`, `src/lib/content/catalog.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/zh.ts`
- Test: `src/lib/engine/geometry.test.ts`, `src/lib/content/catalog.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 and 6 (`Catalog`, `Exercise`, `ParamValue`, `paramValueMatches`, `GEOMETRY_PARAMS`/`GeometryParam`, `RACK_STATIONS`, `Profile`, `defaultProfile`, `Message`).
- Produces:
  - `types.ts`: `FeasibilityStatus = 'feasible' | 'infeasible'`, `CheckId`, `Unlock` (`equipment` | `attachment` | `exclusion`), `Reason = { check; message: Message; unlock? }`, `Feasibility = { status; reasons; notes: Message[] }`.
  - `params.ts`: `paramValue(profile, catalog, name: GeometryParam): ParamValue | undefined` (the user's valid measurement, else the illustrative default), `numberParam(…)`, `boolParam(…)`, `ownedCapabilities(profile, catalog)`, `providersOf(catalog, capabilities)`.
  - `vocab.ts`: `GEOMETRY_PARAM_TYPES: Record<GeometryParam, 'cm' | 'bool'>`, `CAPABILITY_GEOMETRY_PARAMS: Record<string, readonly GeometryParam[]>` (`smith-bar` → both stops and `benchFitsInsideRack`; `rack-uprights` → `benchFitsInsideRack`; `pull-up-bar` → `pullUpBarHeightCm`).
  - i18n: `engine.reason.stopsUnknown`, `engine.reason.benchFitUnknown` (EN + 中文).
  - `geometry.ts`: `TYPICAL_STATURE_CM = 175`, `ASSUMED_CEILING_CM = 240`, `OVERHEAD_REACH_RATIO = 1.33`, `HEAD_ABOVE_BAR_RATIO = 0.13`, `ProbeInput = { statureCm }`, `ProbeResult = { topCm; barCentersCm?; rom; posing }`, `GeometryProbe`, `ProbeRegistry` (keyed by `exercise.figure.spec`), `GeometryOutcome = { reasons; notes }`, `benchInRack(ex)`, `statureFor(profile)`, `assumptions(profile): Message[]`, `checkGeometry(ex, profile, catalog, probes)`.
  - `testing/fixtures.ts`: `EIGHT_FT_CEILING_CM` (243.84), `SYN_EQUIPMENT`, `SYN_ATTACHMENTS`, `syntheticExercise(over)`, `SYN_EXERCISES` (14 exercises), `SYN_TEMPLATE` (`syn-3day`: mon push, tue legs, wed cardio, thu full body, sun rest), `syntheticCatalog(over?)`, and profiles `fullHomeGym()`, `dumbbellsOnly()`, `nothingMeasured()`, `lowCeiling()`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-engine-geometry
```

- [ ] **Step 2: Add the shared types, parameter lookup, fixtures and fail-safe messages**

Add to `src/lib/i18n/en.ts` after `engine.reason.benchFit`:
```ts
  'engine.reason.benchFitUnknown': 'It is not known whether your bench fits inside the rack, so this exercise cannot be checked',
  'engine.reason.stopsUnknown': "The Smith bar's stop heights are not known for your equipment, so the bar's travel cannot be checked",
```
and to `src/lib/i18n/zh.ts`:
```ts
  'engine.reason.benchFitUnknown': '无法确定你的训练凳能否放进架子内，因此无法检查这个动作',
  'engine.reason.stopsUnknown': '缺少你的器械上史密斯杠的限位高度，因此无法检查杠铃的行程',
```

`src/lib/engine/types.ts`:
```ts
import type { Message } from '../i18n/format';

/**
 * Spec §7.1 as amended by D12: every unknown input has a typical value, so an exercise either fits or it
 * does not. (`needs-info` is reserved for inputs that cannot be defaulted; v1 has none, so it is left out.)
 */
export type FeasibilityStatus = 'feasible' | 'infeasible';

/** Spec §7.1 checks, in order. `pose` = the figure could not be posed at this stature. */
export type CheckId = 'capabilities' | 'attachments' | 'exclusions' | 'ceiling' | 'bar-travel' | 'bench-fit' | 'rom' | 'pose';

/** What would make a failing check pass. */
export type Unlock =
  | { kind: 'equipment'; equipmentIds: readonly string[] }
  | { kind: 'attachment'; attachmentId: string }
  | { kind: 'exclusion'; exerciseId: string };

export interface Reason {
  check: CheckId;
  message: Message;
  unlock?: Unlock;
}

/**
 * `checkFeasibility` result (spec §7.1). `reasons` explain failures. `notes` never block the exercise: they
 * say what to check yourself, e.g. overhead clearance under an assumed ceiling (D12).
 */
export interface Feasibility {
  status: FeasibilityStatus;
  reasons: Reason[];
  notes: Message[];
}
```

`src/lib/engine/params.ts`:
```ts
import type { Catalog } from '../content/catalog';
import { type ParamValue, paramValueMatches } from '../content/params';
import type { GeometryParam } from '../content/vocab';
import type { Profile } from '../profile/schema';

/**
 * The value the geometry checks use for parameter `name` (D12): the user's own measurement when it is stored
 * with the right shape, otherwise the illustrative default of the owned equipment that defines the
 * parameter. Undefined when no owned equipment defines it. buildCatalog guarantees a typical value of the
 * right type for every geometry parameter an equipment defines, and that equipment providing a capability
 * the checks depend on defines its parameters (`CAPABILITY_GEOMETRY_PARAMS`); the checks still fail safe on
 * undefined.
 */
export function paramValue(profile: Profile, catalog: Catalog, name: GeometryParam): ParamValue | undefined {
  for (const owned of profile.equipment) {
    const eq = catalog.equipment.get(owned.id);
    const def = eq?.parameters[name];
    if (!eq || !def) continue;
    const measured = owned.params[name];
    if (measured !== undefined && paramValueMatches(def, measured)) return measured;
    return eq.illustrativeDefaults[name];
  }
  return undefined;
}

export function numberParam(profile: Profile, catalog: Catalog, name: GeometryParam): number | undefined {
  const v = paramValue(profile, catalog, name);
  return typeof v === 'number' ? v : undefined;
}

export function boolParam(profile: Profile, catalog: Catalog, name: GeometryParam): boolean | undefined {
  const v = paramValue(profile, catalog, name);
  return typeof v === 'boolean' ? v : undefined;
}

/** Capabilities provided by the owned equipment that exists in the catalog. */
export function ownedCapabilities(profile: Profile, catalog: Catalog): Set<string> {
  return new Set(profile.equipment.flatMap((e) => catalog.equipment.get(e.id)?.capabilities ?? []));
}

/** Catalog equipment providing any of `capabilities`, sorted by id. */
export function providersOf(catalog: Catalog, capabilities: readonly string[]) {
  return [...catalog.equipment.values()].filter((e) => e.capabilities.some((c) => capabilities.includes(c))).sort((a, b) => compareIds(a.id, b.id));
}
```

`src/lib/engine/testing/fixtures.ts`:
```ts
/**
 * Synthetic content and profiles for engine tests. Every value here is invented for testing; none
 * describes a real person, home or machine (spec §13).
 */
import type { Catalog } from '../../content/catalog';
import { AttachmentSchema, type Equipment, EquipmentSchema, type Exercise, ExerciseSchema, type Template, TemplateSchema } from '../../content/schemas';
import { defaultProfile, type Profile } from '../../profile/schema';

/** A standard 8 ft ceiling (243.84 cm): the tall-enough room in these tests. */
export const EIGHT_FT_CEILING_CM = 8 * 30.48;

const T = (en: string) => ({ en, zh: `中文${en}` });
const text = (label: string) => ({ label: T(label), how: T(`How to measure: ${label}`) });

export const SYN_EQUIPMENT: Equipment[] = [
  EquipmentSchema.parse({
    id: 'smith-functional-trainer',
    kind: 'station',
    name: T('Smith machine + functional trainer'),
    capabilities: ['smith-bar', 'rack-uprights', 'cable-column', 'pull-up-bar'],
    parameters: {
      smithLowestBarHeightCm: { type: 'cm', ...text('Lowest bar') },
      smithHighestBarHeightCm: { type: 'cm', ...text('Highest bar') },
      pullUpBarHeightCm: { type: 'cm', ...text('Pull-up bar') },
      benchFitsInsideRack: { type: 'bool', ...text('Bench fits') },
      cableStack: { type: 'stack', ...text('Stack') },
    },
    // Typical dimensions, used whenever the profile has no measurement (D12).
    illustrativeDefaults: { smithLowestBarHeightCm: 40, smithHighestBarHeightCm: 180, pullUpBarHeightCm: 210, benchFitsInsideRack: true },
  }),
  EquipmentSchema.parse({ id: 'adjustable-bench', kind: 'bench', name: T('Adjustable bench'), capabilities: ['flat-bench', 'incline-bench'] }),
  EquipmentSchema.parse({
    id: 'dumbbells',
    kind: 'free-weight',
    name: T('Dumbbells'),
    capabilities: ['dumbbells'],
    parameters: { dumbbellLoads: { type: 'weights', ...text('Dumbbells') } },
  }),
  EquipmentSchema.parse({ id: 'treadmill', kind: 'cardio', name: T('Treadmill'), capabilities: ['treadmill'] }),
];

export const SYN_ATTACHMENTS = [
  AttachmentSchema.parse({ id: 'rope', name: T('Rope'), fits: ['cable-column'] }),
  AttachmentSchema.parse({ id: 'lat-bar', name: T('Lat bar'), fits: ['cable-column'] }),
];

type Stress = 'low' | 'moderate' | 'high';
const stress = (knee: Stress, lowBack: Stress, shoulder: Stress, wrist: Stress) => ({ knee, lowBack, shoulder, wrist });

/** A valid synthetic exercise; `figure.spec` defaults to its own id so tests can register probes by id. */
export function syntheticExercise(over: Record<string, unknown> & { id: string }): Exercise {
  return ExerciseSchema.parse({
    name: T(over.id),
    pattern: 'squat',
    muscles: { primary: ['quadriceps'] },
    requires: {},
    jointStress: stress('low', 'low', 'low', 'low'),
    guideSection: 'lower-squat',
    setupState: { station: 'floor' },
    setupSeconds: 30,
    repSeconds: 3,
    setup: T('setup'),
    cues: [T('cue one'), T('cue two')],
    mistakes: [T('mistake')],
    warmup: T('warm-up'),
    figure: { spec: over.id },
    ...over,
  });
}

export const SYN_EXERCISES: Exercise[] = [
  syntheticExercise({ id: 'smith-squat', requires: { capabilities: ['smith-bar'] }, setupState: { station: 'smith' }, setupSeconds: 60, repSeconds: 4, jointStress: stress('moderate', 'moderate', 'low', 'low') }),
  syntheticExercise({ id: 'goblet-squat', requires: { capabilities: ['dumbbells'] }, jointStress: stress('moderate', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'box-squat', requires: { capabilities: ['dumbbells', 'flat-bench'] }, setupState: { station: 'bench', benchAngleDeg: 0 }, jointStress: stress('low', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'split-squat', pattern: 'lunge', tags: ['unilateral'], requires: { capabilities: ['dumbbells'] }, jointStress: stress('high', 'low', 'low', 'low') }),
  syntheticExercise({ id: 'smith-bench-press', pattern: 'horizontal-push', requires: { capabilities: ['smith-bar', 'flat-bench'] }, setupState: { station: 'smith', benchAngleDeg: 0 }, setupSeconds: 90, jointStress: stress('low', 'low', 'moderate', 'low') }),
  syntheticExercise({ id: 'db-bench-press', pattern: 'horizontal-push', requires: { capabilities: ['dumbbells', 'flat-bench'] }, setupState: { station: 'bench', benchAngleDeg: 0 }, jointStress: stress('low', 'low', 'moderate', 'low') }),
  syntheticExercise({ id: 'push-up', pattern: 'horizontal-push', jointStress: stress('low', 'low', 'moderate', 'high') }),
  syntheticExercise({ id: 'db-shoulder-press', pattern: 'vertical-push', requires: { capabilities: ['dumbbells', 'incline-bench'] }, setupState: { station: 'bench', benchAngleDeg: 90 }, jointStress: stress('low', 'low', 'high', 'low') }),
  syntheticExercise({ id: 'db-lateral-raise', pattern: 'shoulder-abduction', requires: { capabilities: ['dumbbells'] }, repSeconds: 3 }),
  syntheticExercise({ id: 'rope-pushdown', pattern: 'elbow-extension', requires: { capabilities: ['cable-column'], attachments: ['rope'] }, setupState: { station: 'cable', pulley: 'high' } }),
  syntheticExercise({ id: 'lat-pulldown', pattern: 'vertical-pull', requires: { capabilities: ['cable-column'], attachments: ['lat-bar'] }, setupState: { station: 'cable', pulley: 'high' } }),
  syntheticExercise({ id: 'pull-up', pattern: 'vertical-pull', requires: { capabilities: ['pull-up-bar'] }, setupState: { station: 'smith' } }),
  syntheticExercise({ id: 'plank', pattern: 'core-anti-extension', tags: ['isometric'], repSeconds: 1 }),
  syntheticExercise({ id: 'treadmill-walk', pattern: 'cardio-steady', requires: { capabilities: ['treadmill'] }, setupState: { station: 'cardio' }, figure: undefined }),
];

export const SYN_TEMPLATE: Template = TemplateSchema.parse({
  id: 'syn-3day',
  name: T('Synthetic 3-day'),
  days: [
    {
      weekday: 'mon',
      kind: 'strength',
      focus: T('Push'),
      minutes: 30,
      slots: [
        { pattern: 'horizontal-push', sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 },
        { pattern: 'vertical-push', sets: 2, reps: [10, 12], rir: 2, restSec: 75, priority: 2 },
        { pattern: 'elbow-extension', sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3 },
        { pattern: 'shoulder-abduction', sets: 2, reps: [12, 15], rir: 2, restSec: 45, priority: 3, supersetWith: 2 },
      ],
    },
    {
      weekday: 'tue',
      kind: 'strength',
      focus: T('Legs'),
      minutes: 30,
      slots: [
        { pattern: 'squat', sets: 3, reps: [8, 10], rir: 2, restSec: 120, priority: 1 },
        { pattern: 'lunge', sets: 2, reps: [10, 12], rir: 2, restSec: 60, priority: 2 },
        { pattern: 'core-anti-extension', sets: 3, reps: { seconds: 30 }, rir: 2, restSec: 30, priority: 3 },
      ],
    },
    { weekday: 'wed', kind: 'cardio-core', focus: T('Cardio'), minutes: 30, slots: [{ pattern: 'cardio-steady', sets: 1, reps: { seconds: 1200 }, restSec: 0, priority: 1 }] },
    {
      weekday: 'thu',
      kind: 'strength',
      focus: T('Pull and legs'),
      minutes: 30,
      fullBody: true,
      slots: [
        { pattern: 'vertical-pull', sets: 3, reps: [6, 10], rir: 2, restSec: 90, priority: 1 },
        { pattern: ['squat', 'lunge'], sets: 3, reps: [8, 10], rir: 2, restSec: 90, priority: 1 },
      ],
    },
    { weekday: 'sun', kind: 'rest' },
  ],
});

export function syntheticCatalog(over: Partial<{ exercises: Exercise[]; equipment: Equipment[] }> = {}): Catalog {
  const map = <V extends { id: string }>(items: readonly V[]) => new Map(items.map((i) => [i.id, i]));
  return {
    equipment: map(over.equipment ?? SYN_EQUIPMENT),
    attachments: map(SYN_ATTACHMENTS),
    exercises: map(over.exercises ?? SYN_EXERCISES),
    templates: map([SYN_TEMPLATE]),
  };
}

/** Everything owned; height and an 8 ft ceiling entered; two stops measured, the rest typical (D12). */
export function fullHomeGym(): Profile {
  return {
    ...defaultProfile('en'),
    statureCm: 172,
    room: { ceilingHeightCm: EIGHT_FT_CEILING_CM, clearanceMarginCm: 10 },
    equipment: [
      {
        id: 'smith-functional-trainer',
        params: { smithLowestBarHeightCm: 45, smithHighestBarHeightCm: 185, cableStack: { first: 5, last: 80, step: 5, unit: 'kg' } },
      },
      { id: 'adjustable-bench', params: {} },
      { id: 'dumbbells', params: { dumbbellLoads: { unit: 'kg', loads: [2, 4, 6, 8, 10, 12.5, 15] } } },
    ],
    attachments: ['rope', 'lat-bar'],
    schedule: { templateId: 'syn-3day', sessionMinutes: 40, overrides: {} },
  };
}

/** Dumbbells and a bench only; no ceiling entered. */
export function dumbbellsOnly(): Profile {
  return {
    ...fullHomeGym(),
    statureCm: 165,
    room: { clearanceMarginCm: 10 },
    equipment: [
      { id: 'adjustable-bench', params: {} },
      { id: 'dumbbells', params: { dumbbellLoads: { unit: 'lb', loads: [5, 15, 25] } } },
    ],
    attachments: [],
  };
}

/** Everything owned, nothing entered: no height, no ceiling, no equipment values (D12: all typical). */
export function nothingMeasured(): Profile {
  const p = fullHomeGym();
  return { ...p, statureCm: undefined, room: { clearanceMarginCm: 10 }, equipment: p.equipment.map((e) => ({ id: e.id, params: {} })) };
}

/** A tall user under a low ceiling. */
export function lowCeiling(): Profile {
  return { ...fullHomeGym(), statureCm: 188, room: { ceilingHeightCm: 225, clearanceMarginCm: 10 } };
}
```

- [ ] **Step 3: Write the failing test**

`src/lib/engine/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Equipment } from '../content/schemas';
import type { Profile } from '../profile/schema';
import { ASSUMED_CEILING_CM, assumptions, checkGeometry, type GeometryProbe, type ProbeRegistry } from './geometry';
import { EIGHT_FT_CEILING_CM, fullHomeGym, lowCeiling, nothingMeasured, SYN_EQUIPMENT, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const PASS = { reasons: [], notes: [] };

/** A fixed pose result, independent of the pose layer. */
const fixed = (over: Partial<ReturnType<GeometryProbe>> = {}): GeometryProbe => () => ({
  topCm: 180,
  barCentersCm: [90, 150],
  rom: [],
  posing: [],
  ...over,
});
const smithProbes = (probe: GeometryProbe = fixed()): ProbeRegistry => ({ 'smith-squat': probe, 'smith-bench-press': probe });

const withParams = (p: Profile, params: Record<string, unknown>): Profile => ({
  ...p,
  equipment: p.equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { ...e.params, ...params } as typeof e.params } : e)),
});
const noCeiling = (p: Profile): Profile => ({ ...p, room: { clearanceMarginCm: 10 } });
const tall = (statureCm: number, p: Profile = fullHomeGym()): Profile => ({ ...p, statureCm });
/** The synthetic catalog with the Smith station's content changed (not validated by buildCatalog). */
const smithCatalog = (change: (e: Equipment) => Partial<Equipment>) =>
  syntheticCatalog({ equipment: SYN_EQUIPMENT.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, ...change(e) } : e)) });
const without = <V>(o: Readonly<Record<string, V>>, name: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== name));
const checks = (o: ReturnType<typeof checkGeometry>) => o.reasons.map((r) => r.check);

describe('checkGeometry', () => {
  it('passes a profile with height and ceiling entered', () => {
    expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes())).toEqual(PASS);
  });

  describe('typical values (D12)', () => {
    it('poses at a typical 175 cm when the height is unknown', () => {
      const seen: number[] = [];
      const probe: GeometryProbe = (input) => {
        seen.push(input.statureCm);
        return fixed()(input);
      };
      expect(checkGeometry(ex('smith-squat'), nothingMeasured(), catalog, smithProbes(probe))).toEqual(PASS);
      expect(seen).toEqual([175]);
    });
    it("poses at the user's own height when it is entered", () => {
      const seen: number[] = [];
      const probe: GeometryProbe = (input) => {
        seen.push(input.statureCm);
        return fixed()(input);
      };
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(probe))).toEqual(PASS);
      expect(seen).toEqual([172]);
    });
    it('says which typical values stand in for unknown inputs', () => {
      expect(assumptions(fullHomeGym())).toEqual([]);
      expect(assumptions(nothingMeasured())).toEqual([
        { key: 'engine.assumed.stature', params: { height: { lengthCm: 175 } } },
        { key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: 240 } } },
      ]);
    });
  });

  describe('pose', () => {
    it('refuses Smith exercises that have no probe', () => {
      const o = checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, {});
      expect(o.reasons).toEqual([{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }]);
    });
    it('reports a probe that cannot pose the exercise cleanly', () => {
      const throwing: GeometryProbe = () => {
        throw new Error('no trunk angle');
      };
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(throwing)))).toEqual(['pose']);
      const offTarget = fixed({ posing: ['bottom: foot_l is 3.0 cm from its target'] });
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(offTarget)))).toEqual(['pose']);
    });
    it('reports joints past their range of motion', () => {
      const rom = fixed({ rom: ['bottom: kneeFlex_l at 152° exceeds 150°'] });
      expect(checks(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(rom)))).toEqual(['rom']);
    });
  });

  describe('ceiling', () => {
    it('fails when the envelope plus margin exceeds an entered ceiling', () => {
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ topCm: 240.2 })))).toEqual({
        reasons: [
          {
            check: 'ceiling',
            message: { key: 'engine.reason.ceiling', params: { need: { lengthCm: 251 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: EIGHT_FT_CEILING_CM } } },
          },
        ],
        notes: [],
      });
    });
    it('assumes a 240 cm ceiling when none is entered, and notes clearance instead of failing', () => {
      const p = noCeiling(fullHomeGym());
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230 })))).toEqual(PASS);
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230.5 })))).toEqual({
        reasons: [],
        notes: [
          { key: 'engine.note.checkClearance', params: { need: { lengthCm: 241 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: ASSUMED_CEILING_CM } } },
        ],
      });
    });
    it('uses overhead reach for vertical pushes without a probe', () => {
      // 1.33 × 188 + 10 = 260.04 > 225
      expect(checks(checkGeometry(ex('db-shoulder-press'), lowCeiling(), catalog, {}))).toEqual(['ceiling']);
      // 1.33 × 172 + 10 = 238.76 ≤ 243.84
      expect(checkGeometry(ex('db-shoulder-press'), fullHomeGym(), catalog, {})).toEqual(PASS);
      // typical height: 1.33 × 175 + 10 = 242.75 → 243 > 240 assumed: a note, not a failure
      const typical = checkGeometry(ex('db-shoulder-press'), nothingMeasured(), catalog, {});
      expect(typical.reasons).toEqual([]);
      expect(typical.notes.map((n) => n.key)).toEqual(['engine.note.checkClearance']);
      // standing: 188 + 10 ≤ 225
      expect(checkGeometry(ex('goblet-squat'), lowCeiling(), catalog, {})).toEqual(PASS);
    });
    it("uses the user's own height, not the typical one", () => {
      // tall: 1.33 × 180 + 10 = 249.4 → 250 > 243.84, although the typical 175 cm gives 243 ≤ 243.84
      expect(checks(checkGeometry(ex('db-shoulder-press'), tall(180), catalog, {}))).toEqual(['ceiling']);
      expect(checkGeometry(ex('db-shoulder-press'), tall(175), catalog, {})).toEqual(PASS);
      // short, no ceiling entered: 1.33 × 165 + 10 = 229.45 → 230 ≤ 240 assumed, so no clearance note,
      // although the typical 175 cm needs 243 and gets one
      expect(checkGeometry(ex('db-shoulder-press'), tall(165, noCeiling(fullHomeGym())), catalog, {})).toEqual(PASS);
      expect(checkGeometry(ex('db-shoulder-press'), tall(175, noCeiling(fullHomeGym())), catalog, {}).notes.map((n) => n.key)).toEqual([
        'engine.note.checkClearance',
      ]);
      // top of a pull-up for a tall user: 210 + 0.13 × 190 + 10 = 244.7 → 245 > 243.84; typical: 243 fits
      expect(checks(checkGeometry(ex('pull-up'), tall(190), catalog, {}))).toEqual(['ceiling']);
      expect(checkGeometry(ex('pull-up'), tall(175), catalog, {})).toEqual(PASS);
    });
    it('passes when the need equals a measured ceiling', () => {
      const p: Profile = { ...fullHomeGym(), room: { ceilingHeightCm: 240, clearanceMarginCm: 10 } };
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes(fixed({ topCm: 230 })))).toEqual(PASS);
    });
    it('uses the pull-up bar height, measured or typical, for hanging exercises', () => {
      // typical bar: 210 + 0.13 × 172 + 10 = 242.36 ≤ 243.84
      expect(checkGeometry(ex('pull-up'), fullHomeGym(), catalog, {})).toEqual(PASS);
      // measured bar: 230 + 22.36 + 10 > 243.84
      expect(checks(checkGeometry(ex('pull-up'), withParams(fullHomeGym(), { pullUpBarHeightCm: 230 }), catalog, {}))).toEqual(['ceiling']);
    });
    it('falls back to overhead reach when no owned equipment defines a pull-up bar height', () => {
      const bare = syntheticCatalog({ equipment: SYN_EQUIPMENT.map((e) => ({ ...e, parameters: {}, illustrativeDefaults: {} })) });
      // 1.33 × 172 + 10 = 238.76 ≤ 243.84; the stored 230 cm is ignored because no equipment defines it
      expect(checkGeometry(ex('pull-up'), withParams(fullHomeGym(), { pullUpBarHeightCm: 230 }), bare, {})).toEqual(PASS);
    });
    it('uses the profile clearance margin', () => {
      const p: Profile = { ...fullHomeGym(), room: { ceilingHeightCm: EIGHT_FT_CEILING_CM, clearanceMarginCm: 30 } };
      // 1.33 × 172 + 30 = 258.76 > 243.84
      expect(checks(checkGeometry(ex('db-shoulder-press'), p, catalog, {}))).toEqual(['ceiling']);
    });
  });

  describe('Smith bar travel', () => {
    it('fails below the lowest stop and above the highest stop', () => {
      const p = withParams(fullHomeGym(), { smithLowestBarHeightCm: 100, smithHighestBarHeightCm: 140 });
      expect(checkGeometry(ex('smith-squat'), p, catalog, smithProbes()).reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 90 }, stop: { lengthCm: 100 } } } },
        { check: 'bar-travel', message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: 150 }, stop: { lengthCm: 140 } } } },
      ]);
    });
    it('uses the typical stops when none are measured', () => {
      const o = checkGeometry(ex('smith-squat'), nothingMeasured(), catalog, smithProbes(fixed({ barCentersCm: [30, 185] })));
      expect(o.reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 30 }, stop: { lengthCm: 40 } } } },
        { check: 'bar-travel', message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: 185 }, stop: { lengthCm: 180 } } } },
      ]);
    });
    it('prefers a measured stop, and treats a stored value of the wrong type as unmeasured', () => {
      const probes = smithProbes(fixed({ barCentersCm: [42, 150] }));
      // measured lowest stop 45 cm
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, probes).reasons.map((r) => r.message)).toEqual([
        { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 42 }, stop: { lengthCm: 45 } } },
      ]);
      // not a number: the typical 40 cm applies, and a bar at 35 cm is still checked against it
      const wrongType = withParams(fullHomeGym(), { smithLowestBarHeightCm: 'low' });
      expect(checkGeometry(ex('smith-squat'), wrongType, catalog, smithProbes(fixed({ barCentersCm: [35, 150] }))).reasons).toEqual([
        { check: 'bar-travel', message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: 35 }, stop: { lengthCm: 40 } } } },
      ]);
    });
    it('passes a bar that reaches a stop exactly', () => {
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [45, 185] })))).toEqual(PASS);
    });
    it('reports bar heights rounded outward, so the height never reads as the stop itself', () => {
      const o = checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [44.6, 185.4] })));
      expect(o.reasons.map((r) => r.message.params?.height)).toEqual([{ lengthCm: 44 }, { lengthCm: 186 }]);
    });
    it('refuses a probe that reports no bar heights', () => {
      const noModel = [{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }];
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: [] }))).reasons).toEqual(noModel);
      expect(checkGeometry(ex('smith-squat'), fullHomeGym(), catalog, smithProbes(fixed({ barCentersCm: undefined }))).reasons).toEqual(noModel);
    });
    it('fails safe when a stop has neither a measured nor a usable typical value', () => {
      const unknown = [{ check: 'bar-travel', message: { key: 'engine.reason.stopsUnknown' } }];
      const run = (c: ReturnType<typeof syntheticCatalog>, p: Profile = nothingMeasured()) =>
        checkGeometry(ex('smith-squat'), p, c, smithProbes()).reasons;
      // the equipment does not define the highest stop
      const undefinedStop = smithCatalog((e) => ({
        parameters: without(e.parameters, 'smithHighestBarHeightCm'),
        illustrativeDefaults: without(e.illustrativeDefaults, 'smithHighestBarHeightCm'),
      }));
      expect(run(undefinedStop)).toEqual(unknown);
      // a typical value of the wrong type
      expect(run(smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, smithLowestBarHeightCm: true } })))).toEqual(unknown);
      // no owned equipment defines the stops
      expect(run(catalog, { ...fullHomeGym(), equipment: fullHomeGym().equipment.filter((e) => e.id !== 'smith-functional-trainer') })).toEqual(
        unknown,
      );
    });
  });

  describe('bench fit', () => {
    it('uses the answer in the profile, else the typical one', () => {
      const run = (p: Profile) => checkGeometry(ex('smith-bench-press'), p, catalog, smithProbes());
      expect(run(fullHomeGym())).toEqual(PASS);
      expect(checks(run(withParams(fullHomeGym(), { benchFitsInsideRack: false })))).toEqual(['bench-fit']);
    });
    it('uses a typical answer of "does not fit" when there is no answer', () => {
      const doesNotFit = smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, benchFitsInsideRack: false } }));
      const run = (p: Profile) => checkGeometry(ex('smith-bench-press'), p, doesNotFit, smithProbes()).reasons;
      expect(run(nothingMeasured())).toEqual([{ check: 'bench-fit', message: { key: 'engine.reason.benchFit' } }]);
      expect(run(withParams(nothingMeasured(), { benchFitsInsideRack: true }))).toEqual([]);
    });
    it('fails safe when there is neither an answer nor a usable typical one', () => {
      const unknown = [{ check: 'bench-fit', message: { key: 'engine.reason.benchFitUnknown' } }];
      const run = (c: ReturnType<typeof syntheticCatalog>) => checkGeometry(ex('smith-bench-press'), nothingMeasured(), c, smithProbes()).reasons;
      const undefinedFit = smithCatalog((e) => ({
        parameters: without(e.parameters, 'benchFitsInsideRack'),
        illustrativeDefaults: without(e.illustrativeDefaults, 'benchFitsInsideRack'),
      }));
      expect(run(undefinedFit)).toEqual(unknown);
      expect(run(smithCatalog((e) => ({ illustrativeDefaults: { ...e.illustrativeDefaults, benchFitsInsideRack: 'yes' } })))).toEqual(unknown);
    });
    it('does not apply to bench work outside the rack, or to rack work without a bench', () => {
      const p = withParams(fullHomeGym(), { benchFitsInsideRack: false });
      expect(checkGeometry(ex('db-bench-press'), p, catalog, {})).toEqual(PASS);
      // the pull-up is at the Smith station but uses no bench
      expect(checkGeometry(ex('pull-up'), p, catalog, {})).toEqual(PASS);
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./geometry"`.

- [ ] **Step 5: Implement**

`src/lib/engine/geometry.ts`:
```ts
import type { Catalog } from '../content/catalog';
import type { Exercise } from '../content/schemas';
import { type Pattern, RACK_STATIONS } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { boolParam, numberParam } from './params';
import type { Reason } from './types';

/** Spec §7.1 (D12): an unknown stature poses at this typical adult stature. */
export const TYPICAL_STATURE_CM = 175;
/** Spec §7.1 (D12): an unknown ceiling is assumed to be this high; exceeding it adds a note, never a failure. */
export const ASSUMED_CEILING_CM = 240;

/**
 * Interim envelope for exercises without a pose probe, until M3 poses every figure. Conservative
 * anthropometric ratios of stature:
 * - overhead work: fingertip reach plus a held implement ≈ 1.33 × stature
 * - top of a pull-up: the head above the bar ≈ 0.13 × stature (chin over the bar)
 */
export const OVERHEAD_REACH_RATIO = 1.33;
export const HEAD_ABOVE_BAR_RATIO = 0.13;
const OVERHEAD_PATTERNS: readonly Pattern[] = ['vertical-push'];

export interface ProbeInput {
  statureCm: number;
}

/** What posing an exercise's frames at a stature reveals (spec §7.1 check 4). */
export interface ProbeResult {
  /** Highest point of the body and implements over all frames (cm above the floor). */
  topCm: number;
  /**
   * Height of the Smith bar's centre in each frame (cm above the floor), for exercises that move a Smith bar.
   * Same datum as the stop parameters and `SmithParams`: floor to the centre of the bar.
   */
  barCentersCm?: readonly number[];
  /** Range-of-motion findings in any frame (pose-layer diagnostics); empty when every joint is within its limits. */
  rom: readonly string[];
  /** Other pose-layer findings (hands or feet off target, bar off the rail, bone lengths); empty when posed cleanly. */
  posing: readonly string[];
}

/** Poses an exercise's frames; may throw when no valid pose exists. */
export type GeometryProbe = (input: ProbeInput) => ProbeResult;

/** Probes keyed by figure spec id (`exercise.figure.spec`). */
export type ProbeRegistry = Readonly<Record<string, GeometryProbe>>;

export interface GeometryOutcome {
  reasons: Reason[];
  /** Non-blocking: e.g. check overhead clearance under an assumed ceiling. */
  notes: Message[];
}

/** The bench sits between the uprights when the exercise uses a bench at a rack station. */
export const benchInRack = (ex: Exercise) => ex.setupState.benchAngleDeg !== undefined && RACK_STATIONS.includes(ex.setupState.station);

/** The stature every check uses: the profile's, else the typical one (D12). */
export const statureFor = (profile: Profile): number => profile.statureCm ?? TYPICAL_STATURE_CM;

/** Which typical values stand in for unknown inputs, as messages (spec §7.1: checks say "typical height"). */
export function assumptions(profile: Profile): Message[] {
  const out: Message[] = [];
  if (profile.statureCm === undefined) out.push({ key: 'engine.assumed.stature', params: { height: { lengthCm: TYPICAL_STATURE_CM } } });
  if (profile.room.ceilingHeightCm === undefined) out.push({ key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: ASSUMED_CEILING_CM } } });
  return out;
}

function envelopeTopCm(ex: Exercise, statureCm: number, profile: Profile, catalog: Catalog): number {
  if (ex.requires.capabilities.includes('pull-up-bar')) {
    const bar = numberParam(profile, catalog, 'pullUpBarHeightCm');
    return bar === undefined ? OVERHEAD_REACH_RATIO * statureCm : bar + HEAD_ABOVE_BAR_RATIO * statureCm;
  }
  if (OVERHEAD_PATTERNS.includes(ex.pattern)) return OVERHEAD_REACH_RATIO * statureCm;
  return statureCm;
}

/**
 * Spec §7.1 check 4: ceiling clearance, Smith bar travel, bench fit and joint range of motion. Unknown
 * inputs use typical values (D12): stature 175 cm, the equipment's illustrative defaults, and an assumed
 * 240 cm ceiling that adds a clearance note instead of failing. A Smith stop or bench-fit answer with no
 * usable value at all (buildCatalog prevents this for owned equipment) fails the check instead of skipping it.
 */
export function checkGeometry(ex: Exercise, profile: Profile, catalog: Catalog, probes: ProbeRegistry): GeometryOutcome {
  const reasons: Reason[] = [];
  const notes: Message[] = [];
  const statureCm = statureFor(profile);
  const poseFailed: GeometryOutcome = { reasons: [{ check: 'pose', message: { key: 'engine.reason.poseFailed' } }], notes };

  const movesSmithBar = ex.requires.capabilities.includes('smith-bar');
  const probe = ex.figure ? probes[ex.figure.spec] : undefined;
  let probed: ProbeResult | undefined;
  if (probe) {
    try {
      probed = probe({ statureCm });
    } catch {
      return poseFailed;
    }
    if (probed.posing.length > 0) return poseFailed;
  }
  if (movesSmithBar && !probed?.barCentersCm?.length) {
    return { reasons: [{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }], notes };
  }

  // Ceiling: head, hands and implements plus the margin.
  const margin = profile.room.clearanceMarginCm;
  const needCm = Math.ceil((probed ? probed.topCm : envelopeTopCm(ex, statureCm, profile, catalog)) + margin);
  const ceiling = profile.room.ceilingHeightCm;
  if (ceiling === undefined) {
    if (needCm > ASSUMED_CEILING_CM) {
      notes.push({ key: 'engine.note.checkClearance', params: { need: { lengthCm: needCm }, margin: { lengthCm: margin }, ceiling: { lengthCm: ASSUMED_CEILING_CM } } });
    }
  } else if (needCm > ceiling) {
    reasons.push({
      check: 'ceiling',
      message: { key: 'engine.reason.ceiling', params: { need: { lengthCm: needCm }, margin: { lengthCm: margin }, ceiling: { lengthCm: ceiling } } },
    });
  }

  // Smith bar travel versus the stops (measured, else typical); both are bar-centre heights. The guard above
  // ensures the probe reported bar heights. A stop that cannot be resolved fails safe: without it the bar's
  // travel cannot be checked, so the exercise is never silently allowed.
  if (movesSmithBar && probed?.barCentersCm) {
    const lowestCm = numberParam(profile, catalog, 'smithLowestBarHeightCm');
    const highestCm = numberParam(profile, catalog, 'smithHighestBarHeightCm');
    if (lowestCm === undefined || highestCm === undefined) {
      reasons.push({ check: 'bar-travel', message: { key: 'engine.reason.stopsUnknown' } });
    } else {
      // Rounded outward, so a bar 0.4 cm past a stop never reads as the stop itself.
      const low = Math.min(...probed.barCentersCm);
      const high = Math.max(...probed.barCentersCm);
      if (low < lowestCm) {
        reasons.push({
          check: 'bar-travel',
          message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: Math.floor(low) }, stop: { lengthCm: lowestCm } } },
        });
      }
      if (high > highestCm) {
        reasons.push({
          check: 'bar-travel',
          message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: Math.ceil(high) }, stop: { lengthCm: highestCm } } },
        });
      }
    }
  }

  // Bench between the uprights (the user's answer, else the typical one). An answer that cannot be resolved
  // fails safe.
  if (benchInRack(ex)) {
    const fits = boolParam(profile, catalog, 'benchFitsInsideRack');
    if (fits === undefined) reasons.push({ check: 'bench-fit', message: { key: 'engine.reason.benchFitUnknown' } });
    else if (!fits) reasons.push({ check: 'bench-fit', message: { key: 'engine.reason.benchFit' } });
  }

  // Joint range of motion at this stature.
  if (probed && probed.rom.length > 0) reasons.push({ check: 'rom', message: { key: 'engine.reason.rom' } });

  return { reasons, notes };
}
```

- [ ] **Step 6: Fail safe at build time: capability rules in `buildCatalog`**

Append to `src/lib/content/vocab.ts`:
```ts
/** The parameter type each geometry parameter must be declared with, so its typical value is usable. */
export const GEOMETRY_PARAM_TYPES: Readonly<Record<GeometryParam, 'cm' | 'bool'>> = {
  smithLowestBarHeightCm: 'cm',
  smithHighestBarHeightCm: 'cm',
  pullUpBarHeightCm: 'cm',
  benchFitsInsideRack: 'bool',
};

/**
 * Geometry parameters that equipment providing a capability must define, with an illustrative default: the
 * Smith bar's stops (bar travel), whether a bench fits between the uprights of a rack station (bench fit),
 * and the pull-up bar height (ceiling). buildCatalog enforces it, so an owned capability always has the
 * values its checks read (spec §7.1 check 4, D12).
 */
export const CAPABILITY_GEOMETRY_PARAMS: Readonly<Record<string, readonly GeometryParam[]>> = {
  'smith-bar': ['smithLowestBarHeightCm', 'smithHighestBarHeightCm', 'benchFitsInsideRack'],
  'rack-uprights': ['benchFitsInsideRack'],
  'pull-up-bar': ['pullUpBarHeightCm'],
};
```

In `src/lib/content/catalog.test.ts`, import `GEOMETRY_PARAM_TYPES` from `./vocab`, and give the `smith` fixture every geometry parameter its capabilities need, plus a `without` helper:
```ts
const smith = EquipmentSchema.parse({
  id: 'smith-functional-trainer',
  kind: 'station',
  name: T('Smith machine + functional trainer'),
  capabilities: ['smith-bar', 'cable-column', 'rack-uprights'],
  parameters: {
    smithLowestBarHeightCm: { type: 'cm', label: T('Lowest bar'), how: T('Measure') },
    smithHighestBarHeightCm: { type: 'cm', label: T('Highest bar'), how: T('Measure') },
    benchFitsInsideRack: { type: 'bool', label: T('Bench fits'), how: T('Try it') },
  },
  illustrativeDefaults: { smithLowestBarHeightCm: 40, smithHighestBarHeightCm: 180, benchFitsInsideRack: true },
});
const without = <V>(o: Readonly<Record<string, V>>, name: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== name));
```
Spread `smith.parameters` / `smith.illustrativeDefaults` in the existing illustrative-default tests so they keep reporting only the problem they test ("requires a typical value…" now lists `smithLowestBarHeightCm`, `smithHighestBarHeightCm` and `benchFitsInsideRack`). Replace the `it.each(GEOMETRY_PARAMS)` test and add the new ones:
```ts
  it.each(GEOMETRY_PARAMS)('requires an illustrative default for geometry parameter %s (D12)', (name) => {
    // equipment that provides no geometry capability but still defines the parameter
    const eq = EquipmentSchema.parse({
      ...smith,
      id: 'gadget',
      capabilities: ['gadget'],
      parameters: { [name]: { type: GEOMETRY_PARAM_TYPES[name], label: T('Param'), how: T('Measure') } },
      illustrativeDefaults: {},
    });
    expect(problemsOf(input({ equipment: [smith, eq] }))).toEqual([
      `equipment "gadget": parameter "${name}" is read by the geometry checks and needs an illustrative default`,
    ]);
  });

  it.each([
    ['smith-bar', 'smithLowestBarHeightCm'],
    ['smith-bar', 'smithHighestBarHeightCm'],
    ['smith-bar', 'benchFitsInsideRack'],
    ['rack-uprights', 'benchFitsInsideRack'],
    ['pull-up-bar', 'pullUpBarHeightCm'],
  ] as const)('requires equipment providing %s to define geometry parameter %s', (capability, name) => {
    const all = EquipmentSchema.parse({
      ...smith,
      id: 'station',
      capabilities: [capability],
      parameters: { ...smith.parameters, pullUpBarHeightCm: { type: 'cm', label: T('Pull-up bar'), how: T('Measure') } },
      illustrativeDefaults: { ...smith.illustrativeDefaults, pullUpBarHeightCm: 210 },
    });
    expect(problemsOf(input({ equipment: [smith, all] }))).toEqual([]);
    const missing = { ...all, parameters: without(all.parameters, name), illustrativeDefaults: without(all.illustrativeDefaults, name) };
    expect(problemsOf(input({ equipment: [smith, missing] }))).toEqual([
      `equipment "station": provides "${capability}", so it must define the geometry parameter "${name}" with an illustrative default`,
    ]);
  });

  it('reports each missing geometry parameter once, naming every capability that needs it', () => {
    const noFit = { ...smith, parameters: without(smith.parameters, 'benchFitsInsideRack'), illustrativeDefaults: without(smith.illustrativeDefaults, 'benchFitsInsideRack') };
    expect(problemsOf(input({ equipment: [noFit] }))).toEqual([
      'equipment "smith-functional-trainer": provides "smith-bar", "rack-uprights", so it must define the geometry parameter "benchFitsInsideRack" with an illustrative default',
    ]);
  });

  it('requires each geometry parameter to have the type the checks read', () => {
    const deg = EquipmentSchema.parse({
      ...smith,
      parameters: { ...smith.parameters, smithLowestBarHeightCm: { type: 'deg', label: T('Lowest bar'), how: T('Measure') } },
    });
    expect(problemsOf(input({ equipment: [deg] }))).toEqual([
      'equipment "smith-functional-trainer": geometry parameter "smithLowestBarHeightCm" must be of type cm, not deg',
    ]);
  });
```
Run `npx vitest run src/lib/content/catalog.test.ts`: the seven new cases fail. Then replace the geometry-parameter loop in `buildCatalog` (import `CAPABILITY_GEOMETRY_PARAMS`, `GEOMETRY_PARAM_TYPES`, `type GeometryParam` from `./vocab`):
```ts
    // D12: the engine uses the typical value whenever the user has not measured, so it must exist and have
    // the type the checks read.
    for (const name of GEOMETRY_PARAMS) {
      const def = eq.parameters[name];
      if (def && def.type !== GEOMETRY_PARAM_TYPES[name]) {
        problems.push(`equipment "${eq.id}": geometry parameter "${name}" must be of type ${GEOMETRY_PARAM_TYPES[name]}, not ${def.type}`);
      }
      if (def && eq.illustrativeDefaults[name] === undefined) {
        problems.push(`equipment "${eq.id}": parameter "${name}" is read by the geometry checks and needs an illustrative default`);
      }
    }
    // Fail safe: equipment providing a capability the geometry checks depend on must define their inputs.
    const needed = new Map<GeometryParam, string[]>();
    for (const cap of eq.capabilities) {
      if (!Object.hasOwn(CAPABILITY_GEOMETRY_PARAMS, cap)) continue;
      for (const name of CAPABILITY_GEOMETRY_PARAMS[cap]!) needed.set(name, [...(needed.get(name) ?? []), cap]);
    }
    for (const [name, caps] of needed) {
      if (!eq.parameters[name]) {
        problems.push(`equipment "${eq.id}": provides "${caps.join('", "')}", so it must define the geometry parameter "${name}" with an illustrative default`);
      }
    }
  }
```
(the last `}` closes the per-equipment loop). The seed Smith station already defines all four parameters, so `npm run build` still passes; removing one from its YAML fails the build with `- equipment "smith-functional-trainer": provides "smith-bar", so it must define the geometry parameter "…" with an illustrative default`.

- [ ] **Step 7: Run the tests and the checks**

Run: `npx vitest run src/lib/engine src/lib/content && npm run lint && npm run check && npm run build`
Expected: `geometry.test.ts` 26 passed, `catalog.test.ts` 22 passed (46 in `src/lib/content`); 0 lint and type errors; the build passes.

- [ ] **Step 8: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine src/lib/content/vocab.ts src/lib/content/catalog.ts src/lib/content/catalog.test.ts src/lib/i18n/en.ts src/lib/i18n/zh.ts
git commit -m $'feat(engine): add geometry checks with typical defaults and synthetic fixtures\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Engine geometry checks with typical defaults" \
  --body $'Ceiling, Smith bar travel, bench fit and ROM checks. Unknown inputs use typical values (D12): 175 cm stature, illustrative equipment defaults, and an assumed 240 cm ceiling that adds a clearance note. Synthetic fixtures for engine tests.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** each geometry check passes and fails as spec §7.1 describes, every unknown input falls back to its typical value (D12), an assumed ceiling only ever adds a note, an input with no usable value fails its check instead of skipping it, and the tests pin the user's own stature (not just the typical 175 cm).

---

### Task 9: Smith squat geometry probe

Connects the engine to the pose layer as merged in #45. For each Smith-squat frame the probe calls `checkFigureFrame(sk, spec, frame, { statureCm, smith: ILLUSTRATIVE_SMITH })`, the helper that solves and validates a frame from one set of inputs, so the solver's rail and the validator's machine cannot disagree. The figure is posed on the typical machine (D12); only the rail position affects the pose. The probe reports the head/plate envelope and the bar heights, floor to the centre of the bar (the datum of `SmithParams` and of the stop parameters), passes the validator's signed ROM findings through (including the documented magnitude-only elbow exception for the Smith squat), and reports its anchor, feet-flat, bar-on-rail and bone-length findings as pose problems. Bar travel and ceiling are left to the engine, which checks them against the profile's or the typical values with localized messages.

**Files:**
- Create: `src/lib/engine/probes.ts`
- Test: `src/lib/engine/probes.test.ts`

**Interfaces:**
- Consumes: pose layer (#45) `checkFigureFrame(sk, spec, frame, ctx): { solution, findings }`, `Finding`, `carriedBarCenter(sk, sol, barRestOffsetCm)`, `headTop(sk, world, scaleFactor)`, `REAL_SKELETON`, `syntheticSkeleton`, `SkeletonDef`, `SmithSquatSpec`, `SMITH_SQUAT`, `ILLUSTRATIVE_SMITH` (`plateDiameterCm`); Task 8 `GeometryProbe`, `ProbeRegistry`, `checkGeometry`, fixtures.
- Produces: `smithSquatProbe(sk, spec): GeometryProbe`, `DEFAULT_PROBES: ProbeRegistry` (`{ 'smith-squat': … }`).

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-smith-probe
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { SMITH_SQUAT } from '../figure/fixtures/smith-squat';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
import { checkFigureFrame } from '../figure/pose/checkFigureFrame';
import { syntheticSkeleton } from '../figure/pose/synthetic';
import type { Profile } from '../profile/schema';
import { checkGeometry } from './geometry';
import { DEFAULT_PROBES, smithSquatProbe } from './probes';
import { fullHomeGym, nothingMeasured, syntheticCatalog } from './testing/fixtures';

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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/probes.test.ts`
Expected: FAIL — `Failed to resolve import "./probes"`.

- [ ] **Step 4: Implement**

```ts
import { SMITH_SQUAT } from '../figure/fixtures/smith-squat';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
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
 * Probes the site uses, keyed by figure spec id, posed on the committed human skeleton. M3 replaces
 * this with the generalized pose library; exercises without a probe use the interim envelope.
 */
export const DEFAULT_PROBES: ProbeRegistry = {
  [SMITH_SQUAT.id]: smithSquatProbe(REAL_SKELETON, SMITH_SQUAT),
};
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/engine src/lib/figure tests/assets && npm run lint && npm run check`
Expected: `probes.test.ts` 17 passed; the M1 figure and asset tests still pass; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/probes.ts src/lib/engine/probes.test.ts
git commit -m $'feat(engine): pose the Smith squat for feasibility checks\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Smith squat geometry probe" \
  --body $'The engine poses the Smith squat at the profile (or typical) stature with checkFigureFrame on the typical machine, for the ceiling, bar-travel, ROM and pose checks.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the probe poses 150–200 cm statures on both skeletons with no ROM or pose findings, reports bar-centre heights, passes pose-layer ROM findings through, and a lowest stop above the squat's bottom makes the exercise infeasible.

---

### Task 10: Feasibility

`checkFeasibility(exercise, profile, catalog)` from spec §7.1: capabilities, attachments, exclusions, then geometry, combined into `feasible | infeasible` (D12: no `needs-info`) with localizable reasons, what would unlock each failure, and non-blocking notes.

**Files:**
- Create: `src/lib/engine/feasibility.ts`
- Test: `src/lib/engine/feasibility.test.ts`

**Interfaces:**
- Consumes: Task 8 (`checkGeometry`, `ProbeRegistry`, `ownedCapabilities`, `providersOf`, `Feasibility`, `Reason`), Task 9 (`DEFAULT_PROBES`).
- Produces: `EngineOptions = { probes?: ProbeRegistry }`, `checkFeasibility(exercise, profile, catalog, opts?): Feasibility`. Geometry runs only when checks 1–3 pass; its notes (e.g. the clearance note) are returned in `notes`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-feasibility
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile/schema';
import { checkFeasibility } from './feasibility';
import type { GeometryProbe } from './geometry';
import { dumbbellsOnly, fullHomeGym, lowCeiling, nothingMeasured, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const probe: GeometryProbe = () => ({ topCm: 180, barCentersCm: [90, 150], rom: [], posing: [] });
const opts = { probes: { 'smith-squat': probe, 'smith-bench-press': probe } };
const check = (id: string, p: Profile) => checkFeasibility(ex(id), p, catalog, opts);

describe('checkFeasibility', () => {
  it('is feasible when every check passes', () => {
    expect(check('smith-squat', fullHomeGym())).toEqual({ status: 'feasible', reasons: [], notes: [] });
    expect(check('plank', dumbbellsOnly())).toEqual({ status: 'feasible', reasons: [], notes: [] });
  });

  describe('1. capabilities', () => {
    it('is infeasible without equipment that provides a required capability, and says which would', () => {
      const r = check('smith-squat', dumbbellsOnly());
      expect(r.status).toBe('infeasible');
      expect(r.reasons).toEqual([
        {
          check: 'capabilities',
          message: { key: 'engine.reason.missingCapability', params: { equipment: [catalog.equipment.get('smith-functional-trainer')!.name] } },
          unlock: { kind: 'equipment', equipmentIds: ['smith-functional-trainer'] },
        },
      ]);
    });
    it('ignores profile equipment that is not in the catalog', () => {
      const p: Profile = { ...dumbbellsOnly(), equipment: [...dumbbellsOnly().equipment, { id: 'mystery-machine', params: {} }] };
      expect(check('smith-squat', p).status).toBe('infeasible');
    });
  });

  describe('2. attachments', () => {
    it('is infeasible when a required attachment is not owned', () => {
      const p: Profile = { ...fullHomeGym(), attachments: ['lat-bar'] };
      expect(check('rope-pushdown', p).reasons).toEqual([
        { check: 'attachments', message: { key: 'engine.reason.missingAttachment', params: { attachment: catalog.attachments.get('rope')!.name } }, unlock: { kind: 'attachment', attachmentId: 'rope' } },
      ]);
    });
    it('is infeasible when an owned attachment fits nothing the user owns', () => {
      const p: Profile = { ...fullHomeGym(), equipment: fullHomeGym().equipment.filter((e) => e.id !== 'smith-functional-trainer') };
      const r = checkFeasibility({ ...ex('rope-pushdown'), requires: { ...ex('rope-pushdown').requires, capabilities: [] } }, p, catalog, opts);
      expect(r.reasons.map((x) => x.message.key)).toEqual(['engine.reason.attachmentNoFit']);
      expect(r.reasons[0]!.unlock).toEqual({ kind: 'equipment', equipmentIds: ['smith-functional-trainer'] });
    });
  });

  describe('3. exclusions', () => {
    it('is infeasible when the user excluded the exercise', () => {
      const p: Profile = { ...fullHomeGym(), exclusions: ['smith-squat'] };
      expect(check('smith-squat', p).reasons).toEqual([
        { check: 'exclusions', message: { key: 'engine.reason.excluded' }, unlock: { kind: 'exclusion', exerciseId: 'smith-squat' } },
      ]);
    });
  });

  describe('4. geometry', () => {
    it('is feasible at typical values when nothing is entered (D12)', () => {
      expect(check('smith-squat', nothingMeasured())).toEqual({ status: 'feasible', reasons: [], notes: [] });
      expect(check('db-shoulder-press', nothingMeasured())).toEqual({
        status: 'feasible',
        reasons: [],
        notes: [{ key: 'engine.note.checkClearance', params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } } }],
      });
    });
    it('is infeasible under a low entered ceiling', () => {
      const r = check('db-shoulder-press', lowCeiling());
      expect(r.status).toBe('infeasible');
      expect(r.reasons.map((x) => x.check)).toEqual(['ceiling']);
    });
    it('checks the measured stops', () => {
      const p: Profile = { ...fullHomeGym(), equipment: fullHomeGym().equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { smithHighestBarHeightCm: 120 } } : e)) };
      const r = check('smith-squat', p);
      expect(r.status).toBe('infeasible');
      expect(r.reasons.map((x) => x.message.key)).toEqual(['engine.reason.barAboveStop']);
    });
    it('skips geometry, and its notes, when the exercise cannot be set up', () => {
      expect(check('db-shoulder-press', { ...nothingMeasured(), equipment: [] })).toMatchObject({ status: 'infeasible', notes: [] });
    });
  });

  it('ignores limitations', () => {
    const p: Profile = { ...fullHomeGym(), limitations: ['knee-sensitive', 'shoulder-sensitive', 'low-back-sensitive', 'wrist-sensitive'] };
    expect(check('split-squat', p).status).toBe('feasible');
  });

  it('uses the default probes when none are given', () => {
    expect(checkFeasibility(ex('smith-squat'), fullHomeGym(), catalog).status).toBe('feasible');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/feasibility.test.ts`
Expected: FAIL — `Failed to resolve import "./feasibility"`.

- [ ] **Step 4: Implement**

```ts
import type { Catalog } from '../content/catalog';
import type { Exercise } from '../content/schemas';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { checkGeometry, type ProbeRegistry } from './geometry';
import { ownedCapabilities, providersOf } from './params';
import { DEFAULT_PROBES } from './probes';
import type { Feasibility, Reason } from './types';

export interface EngineOptions {
  /** Pose probes by figure spec id; defaults to DEFAULT_PROBES. Tests pass synthetic ones. */
  probes?: ProbeRegistry;
}

/**
 * Spec §7.1. Checks run in order: capabilities, attachments, exclusions, then geometry. Geometry is
 * skipped when an earlier check fails (the exercise cannot be set up, so it cannot be posed). Unknown
 * inputs use typical values (D12), so the result is always feasible or infeasible. `limitations` never
 * affect feasibility.
 */
export function checkFeasibility(exercise: Exercise, profile: Profile, catalog: Catalog, opts: EngineOptions = {}): Feasibility {
  const reasons: Reason[] = [];
  const caps = ownedCapabilities(profile, catalog);

  // 1. Required capabilities are provided by owned equipment.
  for (const cap of exercise.requires.capabilities) {
    if (caps.has(cap)) continue;
    const providers = providersOf(catalog, [cap]);
    reasons.push({
      check: 'capabilities',
      message: { key: 'engine.reason.missingCapability', params: { equipment: providers.map((e) => e.name) } },
      unlock: { kind: 'equipment', equipmentIds: providers.map((e) => e.id) },
    });
  }

  // 2. Required attachments are owned and fit an owned capability.
  for (const id of exercise.requires.attachments) {
    const at = catalog.attachments.get(id);
    const name = at?.name ?? { en: id, zh: id };
    if (!profile.attachments.includes(id)) {
      reasons.push({ check: 'attachments', message: { key: 'engine.reason.missingAttachment', params: { attachment: name } }, unlock: { kind: 'attachment', attachmentId: id } });
    } else if (at && !at.fits.some((c) => caps.has(c))) {
      reasons.push({
        check: 'attachments',
        message: { key: 'engine.reason.attachmentNoFit', params: { attachment: name } },
        unlock: { kind: 'equipment', equipmentIds: providersOf(catalog, at.fits).map((e) => e.id) },
      });
    }
  }

  // 3. Not excluded by the user.
  if (profile.exclusions.includes(exercise.id)) {
    reasons.push({ check: 'exclusions', message: { key: 'engine.reason.excluded' }, unlock: { kind: 'exclusion', exerciseId: exercise.id } });
  }

  // 4. Geometry, at the profile's or the typical values.
  let notes: Message[] = [];
  if (reasons.length === 0) {
    const geo = checkGeometry(exercise, profile, catalog, opts.probes ?? DEFAULT_PROBES);
    reasons.push(...geo.reasons);
    notes = geo.notes;
  }

  return { status: reasons.length > 0 ? 'infeasible' : 'feasible', reasons, notes };
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/engine && npm run lint && npm run check`
Expected: `feasibility.test.ts` 12 passed; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/feasibility.ts src/lib/engine/feasibility.test.ts
git commit -m $'feat(engine): add checkFeasibility\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Feasibility" \
  --body $'checkFeasibility(): capabilities, attachments, exclusions and geometry, with reasons, unlocks and non-blocking notes. Unknown inputs use typical values (D12).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** every check has feasible and infeasible tests, a profile with nothing entered is checked at typical values, and limitations never change the status.

---
### Task 11: Time estimates and fit to time

The week's data types and spec §7.3: the day estimate, the over-budget flag and "fit to time".

Owner decision 4: reps are charged at the top of the range; unilateral work counts both sides; the warm-up term is 5 minutes on any day with an exercise; the first exercise's setup counts as a transition; in a kept superset the first exercise's rest is skipped. `supersetWith` always holds the partner's *template* index, so removing slots never renumbers pairs.

**Files:**
- Create: `src/lib/engine/plan.ts`
- Test: `src/lib/engine/plan.test.ts`

**Interfaces:**
- Consumes: Task 3 (`Exercise`, `Reps`, `SetupState`), Task 2 (`Message`), Task 8 (`Unlock`, `syntheticExercise`).
- Produces: `WARMUP_SEC = 300`, `SlotPlan` (no `needsInfo`: D12), `TimeEstimate = { warmupSec, workSec, restSec, transitionSec, totalSec, minutes }`, `DayPlan = { weekday, kind, focus?, budgetMinutes, slots, estimate, overBudget }`, `Week = { templateId, assumptions: Message[], days }`, `repsForTime(reps)`, `setWorkSec(reps, ex)`, `sameSetup(a, b)`, `estimateDay(slots)`, `withEstimate(day)`, `fitToTime(day)`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-time-estimates
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../content/schemas';
import { type DayPlan, estimateDay, fitToTime, type SlotPlan, WARMUP_SEC, withEstimate } from './plan';
import { syntheticExercise } from './testing/fixtures';

const bench = syntheticExercise({ id: 'db-bench-press', pattern: 'horizontal-push', setupState: { station: 'bench', benchAngleDeg: 0 }, setupSeconds: 60, repSeconds: 4 });
const incline = syntheticExercise({ id: 'incline-press', pattern: 'incline-push', setupState: { station: 'bench', benchAngleDeg: 30 }, setupSeconds: 40, repSeconds: 4 });
const pushdown = syntheticExercise({ id: 'rope-pushdown', pattern: 'elbow-extension', setupState: { station: 'cable', pulley: 'high' }, setupSeconds: 45, repSeconds: 3 });
const facePull = syntheticExercise({ id: 'face-pull', pattern: 'rear-delt', setupState: { station: 'cable', pulley: 'high' }, setupSeconds: 30, repSeconds: 3 });
const curl = syntheticExercise({ id: 'cable-curl', pattern: 'elbow-flexion', setupState: { station: 'cable', pulley: 'low' }, setupSeconds: 30, repSeconds: 3 });
const split = syntheticExercise({ id: 'split-squat', pattern: 'lunge', tags: ['unilateral'], setupSeconds: 20, repSeconds: 3 });
const plank = syntheticExercise({ id: 'plank', pattern: 'core-anti-extension', setupSeconds: 10, repSeconds: 1 });

let n = 0;
function slot(pick: Exercise | undefined, over: Partial<SlotPlan> = {}): SlotPlan {
  const index = over.index ?? n++;
  return {
    key: `mon/${index}`,
    index,
    patterns: pick ? [pick.pattern] : ['calf'],
    sets: 3,
    reps: [8, 10],
    rir: 2,
    restSec: 60,
    priority: 1,
    pick,
    why: [],
    notes: [],
    notices: [],
    alternatives: [],
    ...over,
  };
}
const day = (slots: SlotPlan[], budgetMinutes = 30): DayPlan => withEstimate({ weekday: 'mon', kind: 'strength', budgetMinutes, slots });

describe('estimateDay', () => {
  it('adds warm-up, work, rest and the first setup', () => {
    // 3 × (10 × 4) work, 3 × 60 rest, one 60 s setup
    expect(estimateDay([slot(bench, { index: 0 })])).toEqual({
      warmupSec: WARMUP_SEC,
      workSec: 120,
      restSec: 180,
      transitionSec: 60,
      totalSec: WARMUP_SEC + 360,
      minutes: 11,
    });
  });
  it('uses seconds for holds and doubles unilateral work', () => {
    expect(estimateDay([slot(plank, { index: 0, reps: { seconds: 30 } })]).workSec).toBe(90);
    expect(estimateDay([slot(split, { index: 0, reps: [10, 12] })]).workSec).toBe(3 * 2 * 12 * 3);
  });
  it('charges a transition only when station, bench angle or pulley changes', () => {
    const t = (...picks: Exercise[]) => estimateDay(picks.map((p, index) => slot(p, { index }))).transitionSec;
    expect(t(pushdown, facePull)).toBe(45); // same cable station, same pulley
    expect(t(pushdown, curl)).toBe(45 + 30); // pulley high → low
    expect(t(bench, incline)).toBe(60 + 40); // bench angle 0 → 30
    expect(t(bench, pushdown, bench)).toBe(60 + 45 + 60); // station changes twice
  });
  it('skips the first exercise’s rest in a kept superset', () => {
    const straight = estimateDay([slot(pushdown, { index: 0 }), slot(facePull, { index: 1 })]);
    const superset = estimateDay([slot(pushdown, { index: 0 }), slot(facePull, { index: 1, supersetWith: 0 })]);
    expect(straight.restSec - superset.restSec).toBe(3 * 60);
  });
  it('ignores empty slots, and a day with no exercise takes no time', () => {
    expect(estimateDay([slot(bench, { index: 0 }), slot(undefined, { index: 1 })]).totalSec).toBe(WARMUP_SEC + 360);
    expect(estimateDay([slot(undefined, { index: 0 })])).toEqual({ warmupSec: 0, workSec: 0, restSec: 0, transitionSec: 0, totalSec: 0, minutes: 0 });
  });
});

describe('withEstimate', () => {
  it('flags a day over its budget', () => {
    expect(day([slot(bench, { index: 0 })], 11).overBudget).toBe(false);
    expect(day([slot(bench, { index: 0 })], 10).overBudget).toBe(true);
  });
});

describe('fitToTime', () => {
  const full = () => [
    slot(bench, { index: 0, priority: 1 }),
    slot(incline, { index: 1, priority: 2 }),
    slot(pushdown, { index: 2, priority: 3 }),
    slot(facePull, { index: 3, priority: 3, supersetWith: 2 }),
  ];

  it('returns a day that already fits unchanged', () => {
    const d = day(full(), 60);
    expect(fitToTime(d)).toBe(d);
  });
  it('removes priority-3 slots last first, and unlinks their superset partner', () => {
    const d = day(full(), 22);
    const fitted = fitToTime(d);
    expect(fitted.slots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(fitted.slots[2]!.supersetWith).toBeUndefined();
    expect(fitted.overBudget).toBe(false);
  });
  it('then trims priority-2 sets, never priority 1', () => {
    const fitted = fitToTime(day(full(), 14));
    expect(fitted.slots.map((s) => [s.index, s.sets])).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
  it('stops when nothing is left to trim, still over budget', () => {
    const fitted = fitToTime(day(full(), 5));
    expect(fitted.slots.map((s) => [s.index, s.sets])).toEqual([
      [0, 3],
      [1, 1],
    ]);
    expect(fitted.overBudget).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/plan.test.ts`
Expected: FAIL — `Failed to resolve import "./plan"`.

- [ ] **Step 4: Implement**

```ts
import type { Exercise, Reps, SetupState } from '../content/schemas';
import type { DayKind, Pattern, Weekday } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { I18nText } from '../i18n/locales';
import type { Unlock } from './types';

/** The "warm-up" term of spec §7.3: a general warm-up before every day with at least one exercise. */
export const WARMUP_SEC = 300;

export interface SlotPlan {
  /** "mon/0": weekday + the slot's template index (the override key, spec §6). */
  key: string;
  /** The slot's index in the template day; stays stable when other slots are removed. */
  index: number;
  patterns: readonly Pattern[];
  sets: number;
  reps: Reps;
  rir?: number;
  restSec: number;
  priority: 1 | 2 | 3;
  /** Template index of the superset partner; present only when both picks share a station. */
  supersetWith?: number;
  /** The chosen exercise; undefined for an unfillable slot. */
  pick?: Exercise;
  /** Why this pick won (spec §9.1 "why it was chosen"). */
  why: Message[];
  /** Non-blocking notes: overhead clearance under an assumed ceiling (D12), then safety notes from declared limitations. */
  notes: Message[];
  /** Things the user should know, e.g. a dropped override. */
  notices: Message[];
  /** Other feasible exercise ids for ⇄ swap, best first. */
  alternatives: string[];
  /** Set when nothing feasible fills the slot. */
  empty?: { reasons: Message[]; unlock: Unlock[] };
}

export interface TimeEstimate {
  warmupSec: number;
  workSec: number;
  restSec: number;
  transitionSec: number;
  totalSec: number;
  /** totalSec rounded up to whole minutes. */
  minutes: number;
}

export interface DayPlan {
  weekday: Weekday;
  kind: DayKind;
  focus?: I18nText;
  budgetMinutes: number;
  slots: SlotPlan[];
  estimate: TimeEstimate;
  overBudget: boolean;
}

export interface Week {
  templateId: string;
  /** Typical values standing in for unknown inputs, e.g. "planned for a typical height" (D12). */
  assumptions: Message[];
  days: DayPlan[];
}

/** Reps charged per set: the top of the range, so estimates err long. */
export const repsForTime = (reps: Reps): number => (Array.isArray(reps) ? reps[1] : 0);

/** Seconds of work in one set. Holds use their seconds; unilateral exercises are done once per side. */
export function setWorkSec(reps: Reps, ex: Exercise): number {
  const perSide = Array.isArray(reps) ? reps[1] * ex.repSeconds : reps.seconds;
  return ex.tags.includes('unilateral') ? 2 * perSide : perSide;
}

/** Spec §7.3: a transition is charged when station, bench angle or pulley height changes. */
export function sameSetup(a: SetupState, b: SetupState): boolean {
  return a.station === b.station && a.benchAngleDeg === b.benchAngleDeg && a.pulley === b.pulley;
}

/** Template indexes of the first slot of each superset pair that is present and filled. */
function supersetLeaders(slots: readonly SlotPlan[]): Set<number> {
  const filled = new Set(slots.filter((s) => s.pick).map((s) => s.index));
  const leaders = new Set<number>();
  for (const s of slots) {
    if (s.supersetWith === undefined || !filled.has(s.index) || !filled.has(s.supersetWith)) continue;
    leaders.add(Math.min(s.index, s.supersetWith));
  }
  return leaders;
}

/**
 * Spec §7.3: warm-up + Σ sets × (reps × repSeconds + restSec) + transitions. In a kept superset the
 * first exercise's rest is skipped: you go straight to its partner.
 */
export function estimateDay(slots: readonly SlotPlan[]): TimeEstimate {
  const leaders = supersetLeaders(slots);
  let workSec = 0;
  let restSec = 0;
  let transitionSec = 0;
  let prev: SetupState | undefined;
  for (const s of slots) {
    if (!s.pick) continue;
    if (!prev || !sameSetup(prev, s.pick.setupState)) transitionSec += s.pick.setupSeconds;
    prev = s.pick.setupState;
    workSec += s.sets * setWorkSec(s.reps, s.pick);
    if (!leaders.has(s.index)) restSec += s.sets * s.restSec;
  }
  const warmupSec = prev ? WARMUP_SEC : 0;
  const totalSec = warmupSec + workSec + restSec + transitionSec;
  return { warmupSec, workSec, restSec, transitionSec, totalSec, minutes: Math.ceil(totalSec / 60) };
}

/** A day with its estimate and budget flag recomputed. */
export function withEstimate(day: Omit<DayPlan, 'estimate' | 'overBudget'>): DayPlan {
  const estimate = estimateDay(day.slots);
  return { ...day, estimate, overBudget: estimate.minutes > day.budgetMinutes };
}

/** Remove slot at array position `i`, and any superset link to it. */
function removeSlot(slots: readonly SlotPlan[], i: number): SlotPlan[] {
  const gone = slots[i]!.index;
  return slots
    .filter((_, j) => j !== i)
    .map((s) => (s.supersetWith === gone ? { ...s, supersetWith: undefined } : s));
}

/**
 * Spec §7.3 "fit to time": remove priority-3 slots (last first), then trim priority-2 slots one set at
 * a time (the slot with the most sets first, later slots on ties; never below one set). Priority-1
 * slots are never touched. Returns the day unchanged when it already fits.
 */
export function fitToTime(day: DayPlan): DayPlan {
  let current = day;
  while (current.overBudget) {
    const i = current.slots.findLastIndex((s) => s.priority === 3);
    if (i < 0) break;
    current = withEstimate({ ...current, slots: removeSlot(current.slots, i) });
  }
  while (current.overBudget) {
    let best = -1;
    current.slots.forEach((s, i) => {
      if (s.priority === 2 && s.sets > 1 && (best < 0 || s.sets >= current.slots[best]!.sets)) best = i;
    });
    if (best < 0) break;
    current = withEstimate({ ...current, slots: current.slots.map((s, i) => (i === best ? { ...s, sets: s.sets - 1 } : s)) });
  }
  return current;
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/engine && npm run lint && npm run check`
Expected: `plan.test.ts` 10 passed; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/plan.ts src/lib/engine/plan.test.ts
git commit -m $'feat(engine): estimate session time and fit days to their budget\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Time estimates and fit to time" \
  --body $'Day estimate (warm-up, work, rest, transitions), over-budget flag and fit-to-time.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** estimates follow the §7.3 formula and fit-to-time removes priority-3 slots before trimming priority-2 sets, never touching priority 1.

---

### Task 12: Week builder

`buildWeek(template, profile, catalog)` from spec §7.2: candidates by pattern and feasibility, ranking, overrides, supersets, empty slots with reasons and unlocks, clearance and safety notes, the typical values it assumed, and per-day estimates. With D12 there are no `needs-info` candidates: a profile with nothing entered is planned at typical values.

Owner decision 5: a day's budget is the shorter of the template day's `minutes` and the profile's `sessionMinutes`; rest days have a budget of 0.

**Files:**
- Create: `src/lib/engine/week.ts`
- Test: `src/lib/engine/week.test.ts`

**Interfaces:**
- Consumes: Task 10 (`checkFeasibility`, `EngineOptions`), Task 11 (`SlotPlan`, `DayPlan`, `Week`, `withEstimate`), Task 8 (`assumptions`), Task 3 (`slotPatterns`), Task 1 (`LIMITATION_JOINT`).
- Produces: `Ranked = { exercise; score; why }`, `RankContext = { previous?; limitations; used }`, `rankCandidates(candidates, ctx): Ranked[]`, `limitationNotes(exercise, limitations): Message[]`, `buildWeek(template, profile, catalog, opts?): Week`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-week-builder
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { TemplateSchema } from '../content/schemas';
import type { Profile } from '../profile/schema';
import type { GeometryProbe } from './geometry';
import { DEFAULT_PROBES } from './probes';
import { buildWeek, limitationNotes, rankCandidates } from './week';
import { fullHomeGym, nothingMeasured, SYN_TEMPLATE, syntheticCatalog, syntheticExercise } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const benchProbe: GeometryProbe = () => ({ topCm: 150, barCentersCm: [95, 140], rom: [], posing: [] });
const opts = { probes: { ...DEFAULT_PROBES, 'smith-bench-press': benchProbe } };
const build = (p: Profile, tpl = SYN_TEMPLATE) => buildWeek(tpl, p, catalog, opts);
const picks = (p: Profile, tpl = SYN_TEMPLATE) =>
  Object.fromEntries(build(p, tpl).days.flatMap((d) => d.slots.map((s) => [s.key, s.pick?.id ?? null])));
const slotAt = (p: Profile, key: string) => build(p).days.flatMap((d) => d.slots).find((s) => s.key === key)!;

describe('rankCandidates', () => {
  const none = { limitations: [], used: new Set<string>() };
  it('breaks ties by id', () => {
    expect(rankCandidates([ex('smith-squat'), ex('goblet-squat'), ex('box-squat')], none).map((r) => r.exercise.id)).toEqual([
      'box-squat',
      'goblet-squat',
      'smith-squat',
    ]);
  });
  it('gives +3 for the same station as the previous pick', () => {
    const r = rankCandidates([ex('goblet-squat'), ex('smith-squat')], { ...none, previous: ex('smith-bench-press') });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['smith-squat', 3],
      ['goblet-squat', 0],
    ]);
    expect(r[0]!.why).toEqual([{ key: 'engine.why.fits' }, { key: 'engine.why.sameStation' }]);
  });
  it('gives +2 per limitation with low stress and −3 per limitation with high stress', () => {
    const r = rankCandidates([ex('push-up'), ex('db-bench-press')], { ...none, limitations: ['wrist-sensitive', 'knee-sensitive'] });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['db-bench-press', 4],
      ['push-up', -1],
    ]);
    expect(r[1]!.why).toContainEqual({ key: 'engine.why.hardOnJoint', params: { joint: { key: 'joint.wrist' } } });
  });
  it('gives −2 for an exercise already used this week', () => {
    const r = rankCandidates([ex('box-squat'), ex('goblet-squat')], { ...none, used: new Set(['box-squat']) });
    expect(r.map((x) => [x.exercise.id, x.score])).toEqual([
      ['goblet-squat', 0],
      ['box-squat', -2],
    ]);
  });
});

describe('limitationNotes', () => {
  it('adds a note for moderate or high stress on a sensitive joint', () => {
    expect(limitationNotes(ex('db-shoulder-press'), ['shoulder-sensitive'])).toEqual([
      { key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } },
    ]);
    expect(limitationNotes(ex('smith-squat'), ['knee-sensitive', 'wrist-sensitive'])).toEqual([
      { key: 'engine.note.jointModerate', params: { joint: { key: 'joint.knee' } } },
    ]);
  });
});

describe('buildWeek', () => {
  it('fills every slot deterministically', () => {
    expect(picks(fullHomeGym())).toEqual({
      'mon/0': 'db-bench-press',
      'mon/1': 'db-shoulder-press',
      'mon/2': 'rope-pushdown',
      'mon/3': 'db-lateral-raise',
      'tue/0': 'box-squat',
      'tue/1': 'split-squat',
      'tue/2': 'plank',
      'wed/0': null,
      'thu/0': 'lat-pulldown',
      'thu/1': 'goblet-squat',
    });
    expect(build(fullHomeGym())).toEqual(build(fullHomeGym()));
  });

  it('explains picks and lists feasible alternatives', () => {
    const s = slotAt(fullHomeGym(), 'mon/1');
    expect(s.why).toEqual([{ key: 'engine.why.fits' }, { key: 'engine.why.sameStation' }]);
    expect(slotAt(fullHomeGym(), 'mon/0').alternatives).toEqual(['push-up', 'smith-bench-press']);
  });

  it('ranks exercises used earlier in the week lower', () => {
    // box-squat (tue/0) and split-squat (tue/1) were used, so they rank below the unused squats.
    const s = slotAt(fullHomeGym(), 'thu/1');
    expect(s.pick?.id).toBe('goblet-squat');
    expect(s.alternatives).toEqual(['smith-squat', 'box-squat', 'split-squat']);
  });

  it('keeps an unfillable slot with reasons and what would unlock it', () => {
    const s = slotAt(fullHomeGym(), 'wed/0');
    expect(s.pick).toBeUndefined();
    expect(s.empty).toEqual({
      reasons: [
        { key: 'engine.empty.noneFeasible' },
        { key: 'engine.reason.missingCapability', params: { equipment: [catalog.equipment.get('treadmill')!.name] } },
      ],
      unlock: [{ kind: 'equipment', equipmentIds: ['treadmill'] }],
    });
  });

  it('says so when the library has no exercise for a slot', () => {
    const tpl = TemplateSchema.parse({ ...SYN_TEMPLATE, days: [{ weekday: 'mon', kind: 'mobility', focus: SYN_TEMPLATE.name, minutes: 20, slots: [{ pattern: 'mobility', sets: 1, reps: { seconds: 60 }, restSec: 0, priority: 1 }] }] });
    expect(buildWeek(tpl, fullHomeGym(), catalog, opts).days[0]!.slots[0]!.empty).toEqual({ reasons: [{ key: 'engine.empty.noExercise' }], unlock: [] });
  });

  describe('typical values (D12)', () => {
    it('plans a profile with nothing entered, and says what it assumed', () => {
      expect(picks(nothingMeasured())).toEqual(picks(fullHomeGym()));
      expect(build(nothingMeasured()).assumptions).toEqual([
        { key: 'engine.assumed.stature', params: { height: { lengthCm: 175 } } },
        { key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: 240 } } },
      ]);
      expect(build(fullHomeGym()).assumptions).toEqual([]);
    });
    it('keeps an overhead exercise under an assumed ceiling, with the clearance note before safety notes', () => {
      const p: Profile = { ...nothingMeasured(), limitations: ['shoulder-sensitive'] };
      const s = slotAt(p, 'mon/1');
      expect(s.pick?.id).toBe('db-shoulder-press');
      expect(s.notes).toEqual([
        { key: 'engine.note.checkClearance', params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } } },
        { key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } },
      ]);
    });
  });

  describe('limitations', () => {
    it('re-rank picks and add safety notes', () => {
      const p: Profile = { ...fullHomeGym(), limitations: ['shoulder-sensitive'] };
      expect(slotAt(p, 'mon/1').notes).toEqual([{ key: 'engine.note.jointHigh', params: { joint: { key: 'joint.shoulder' } } }]);
      const knees: Profile = { ...fullHomeGym(), limitations: ['knee-sensitive'] };
      // box-squat: +2 (knee low) −2 (used on tue) = 0 ties goblet-squat (0) and wins on id.
      expect(picks(knees)['thu/1']).toBe('box-squat');
      expect(slotAt(knees, 'tue/0').why).toContainEqual({ key: 'engine.why.easyOnJoint', params: { joint: { key: 'joint.knee' } } });
    });
  });

  describe('overrides', () => {
    const withOverride = (key: string, id: string): Profile => ({ ...fullHomeGym(), schedule: { ...fullHomeGym().schedule, overrides: { [key]: id } } });
    it('uses a feasible override', () => {
      const s = slotAt(withOverride('mon/0', 'smith-bench-press'), 'mon/0');
      expect(s.pick?.id).toBe('smith-bench-press');
      expect(s.why).toEqual([{ key: 'engine.why.override' }]);
      expect(s.alternatives).toEqual(['db-bench-press', 'push-up']);
    });
    it('drops an override that is no longer feasible, with a notice', () => {
      const p = withOverride('mon/0', 'smith-bench-press');
      const s = slotAt({ ...p, exclusions: ['smith-bench-press'] }, 'mon/0');
      expect(s.pick?.id).toBe('db-bench-press');
      expect(s.notices).toEqual([{ key: 'engine.notice.overrideDropped', params: { exercise: ex('smith-bench-press').name } }]);
    });
    it('drops an override for an unknown exercise or another pattern', () => {
      expect(slotAt(withOverride('mon/0', 'plank'), 'mon/0').notices).toEqual([{ key: 'engine.notice.overrideInvalid' }]);
      expect(slotAt(withOverride('mon/0', 'no-such-exercise'), 'mon/0').notices).toEqual([{ key: 'engine.notice.overrideInvalid' }]);
    });
  });

  describe('supersets', () => {
    it('drops the pairing when the picks use different stations', () => {
      const s = slotAt(fullHomeGym(), 'mon/3');
      expect(s.supersetWith).toBeUndefined();
    });
    it('keeps the pairing when both picks share a station', () => {
      const tpl = TemplateSchema.parse({
        ...SYN_TEMPLATE,
        days: [
          {
            weekday: 'mon',
            kind: 'strength',
            focus: SYN_TEMPLATE.name,
            minutes: 30,
            slots: [
              { pattern: 'vertical-pull', sets: 3, reps: [8, 10], rir: 2, restSec: 60, priority: 1 },
              { pattern: 'elbow-extension', sets: 3, reps: [12, 15], rir: 2, restSec: 60, priority: 2, supersetWith: 0 },
            ],
          },
        ],
      });
      const day = buildWeek(tpl, fullHomeGym(), catalog, opts).days[0]!;
      expect(day.slots.map((s) => s.pick?.id)).toEqual(['lat-pulldown', 'rope-pushdown']);
      expect(day.slots[1]!.supersetWith).toBe(0);
    });
  });

  describe('time budget', () => {
    it('uses the shorter of the template day and the profile session length', () => {
      const w = build(fullHomeGym());
      expect(w.days.map((d) => d.budgetMinutes)).toEqual([30, 30, 30, 30, 0]);
      const short: Profile = { ...fullHomeGym(), schedule: { ...fullHomeGym().schedule, sessionMinutes: 20 } };
      expect(build(short).days[0]!.budgetMinutes).toBe(20);
    });
    it('estimates every day and flags days over budget', () => {
      const w = build(fullHomeGym());
      const mon = w.days[0]!;
      expect(mon.estimate.totalSec).toBeGreaterThan(0);
      expect(mon.overBudget).toBe(mon.estimate.minutes > mon.budgetMinutes);
      expect(w.days[4]).toMatchObject({ kind: 'rest', slots: [], overBudget: false, estimate: { totalSec: 0 } });
    });
  });

  it('scales to a catalog with more candidates without changing earlier picks', () => {
    const extra = syntheticExercise({ id: 'zz-squat', requires: { capabilities: ['dumbbells'] }, jointStress: { knee: 'moderate', lowBack: 'low', shoulder: 'low', wrist: 'low' } });
    const bigger = syntheticCatalog({ exercises: [...catalog.exercises.values(), extra] });
    expect(buildWeek(SYN_TEMPLATE, fullHomeGym(), bigger, opts).days[1]!.slots[0]!.pick?.id).toBe('box-squat');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/week.test.ts`
Expected: FAIL — `Failed to resolve import "./week"`.

- [ ] **Step 4: Implement**

```ts
import type { Catalog } from '../content/catalog';
import { type Day, type Exercise, slotPatterns, type Template } from '../content/schemas';
import { LIMITATION_JOINT, type Limitation } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { checkFeasibility, type EngineOptions } from './feasibility';
import { assumptions } from './geometry';
import { type DayPlan, type SlotPlan, type Week, withEstimate } from './plan';
import type { Feasibility, Unlock } from './types';

export interface Ranked {
  exercise: Exercise;
  score: number;
  why: Message[];
}

export interface RankContext {
  /** The previous pick of the day, if any. */
  previous?: Exercise;
  limitations: readonly Limitation[];
  /** Exercise ids already picked earlier in the week. */
  used: ReadonlySet<string>;
}

/**
 * Spec §7.2 ranking, highest first, ties broken by id:
 * +3 same station as the previous pick of the day; +2 per declared limitation whose joint has low
 * stress; −3 per declared limitation whose joint has high stress; −2 if already used this week.
 */
export function rankCandidates(candidates: readonly Exercise[], ctx: RankContext): Ranked[] {
  return candidates
    .map((exercise) => {
      let score = 0;
      const why: Message[] = [{ key: 'engine.why.fits' }];
      if (ctx.previous && ctx.previous.setupState.station === exercise.setupState.station) {
        score += 3;
        why.push({ key: 'engine.why.sameStation' });
      }
      for (const lim of ctx.limitations) {
        const joint = LIMITATION_JOINT[lim];
        const level = exercise.jointStress[joint];
        if (level === 'low') {
          score += 2;
          why.push({ key: 'engine.why.easyOnJoint', params: { joint: { key: `joint.${joint}` } } });
        } else if (level === 'high') {
          score -= 3;
          why.push({ key: 'engine.why.hardOnJoint', params: { joint: { key: `joint.${joint}` } } });
        }
      }
      if (ctx.used.has(exercise.id)) {
        score -= 2;
        why.push({ key: 'engine.why.usedEarlier' });
      }
      return { exercise, score, why };
    })
    .sort((a, b) => b.score - a.score || compareIds(a.exercise.id, b.exercise.id));
}

/** Safety notes for a pick that loads a joint the user marked as sensitive (spec §7.1, §12). */
export function limitationNotes(exercise: Exercise, limitations: readonly Limitation[]): Message[] {
  return limitations.flatMap((lim): Message[] => {
    const joint = LIMITATION_JOINT[lim];
    const level = exercise.jointStress[joint];
    if (level === 'low') return [];
    return [{ key: level === 'high' ? 'engine.note.jointHigh' : 'engine.note.jointModerate', params: { joint: { key: `joint.${joint}` } } }];
  });
}

const unique = <T>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = JSON.stringify(i);
    return !seen.has(k) && seen.add(k);
  });
};

/** Spec §7.2 step 4: why nothing fits, and what would unlock the slot. */
function emptyReasons(matching: readonly Exercise[], feas: (e: Exercise) => Feasibility): NonNullable<SlotPlan['empty']> {
  if (matching.length === 0) return { reasons: [{ key: 'engine.empty.noExercise' }], unlock: [] };
  const results = matching.map(feas);
  const reasons = unique(results.flatMap((r) => r.reasons.map((x) => x.message)));
  const unlock: Unlock[] = unique(results.flatMap((r) => r.reasons.flatMap((x) => (x.unlock ? [x.unlock] : []))));
  return { reasons: [{ key: 'engine.empty.noneFeasible' }, ...reasons], unlock };
}

function budgetFor(day: Day, profile: Profile): number {
  if (day.kind === 'rest') return 0;
  return Math.min(day.minutes ?? profile.schedule.sessionMinutes, profile.schedule.sessionMinutes);
}

/**
 * Spec §7.2: fill every slot of every day. Candidates match the slot's pattern and are feasible; a
 * still-feasible user override wins; unfillable slots stay, with reasons. Supersets are kept only when
 * both picks share a station. Unknown inputs use typical values (D12), listed in `assumptions`.
 * Deterministic for the same inputs.
 */
export function buildWeek(template: Template, profile: Profile, catalog: Catalog, opts: EngineOptions = {}): Week {
  const cache = new Map<string, Feasibility>();
  const feas = (e: Exercise): Feasibility => {
    let r = cache.get(e.id);
    if (!r) cache.set(e.id, (r = checkFeasibility(e, profile, catalog, opts)));
    return r;
  };
  const all = [...catalog.exercises.values()];
  const used = new Set<string>();

  const days = template.days.map((day): DayPlan => {
    let previous: Exercise | undefined;
    const slots = day.slots.map((slot, index): SlotPlan => {
      const key = `${day.weekday}/${index}`;
      const patterns = slotPatterns(slot);
      const matching = all.filter((e) => patterns.includes(e.pattern));
      const feasible = matching.filter((e) => feas(e).status === 'feasible');
      const ranked = rankCandidates(feasible, { previous, limitations: profile.limitations, used });
      const notices: Message[] = [];

      let pick = ranked[0]?.exercise;
      let why = ranked[0]?.why ?? [];
      const overrideId = profile.schedule.overrides[key];
      if (overrideId !== undefined) {
        const chosen = catalog.exercises.get(overrideId);
        if (!chosen || !patterns.includes(chosen.pattern)) {
          notices.push({ key: 'engine.notice.overrideInvalid' });
        } else if (feas(chosen).status !== 'feasible') {
          notices.push({ key: 'engine.notice.overrideDropped', params: { exercise: chosen.name } });
        } else {
          pick = chosen;
          why = [{ key: 'engine.why.override' }];
        }
      }

      const plan: SlotPlan = {
        key,
        index,
        patterns,
        sets: slot.sets,
        reps: slot.reps,
        rir: slot.rir,
        restSec: slot.restSec,
        priority: slot.priority,
        supersetWith: slot.supersetWith,
        pick,
        why: pick ? why : [],
        notes: pick ? [...feas(pick).notes, ...limitationNotes(pick, profile.limitations)] : [],
        notices,
        alternatives: ranked.map((r) => r.exercise.id).filter((id) => id !== pick?.id),
        empty: pick ? undefined : emptyReasons(matching, feas),
      };
      if (pick) {
        previous = pick;
        used.add(pick.id);
      }
      return plan;
    });

    // Keep a superset only when both picks share a station (spec §5.5).
    const byIndex = new Map(slots.map((s) => [s.index, s]));
    const paired = slots.map((s) => {
      if (s.supersetWith === undefined) return s;
      const partner = byIndex.get(s.supersetWith);
      const keep = s.pick && partner?.pick && s.pick.setupState.station === partner.pick.setupState.station;
      return keep ? s : { ...s, supersetWith: undefined };
    });

    return withEstimate({ weekday: day.weekday, kind: day.kind, focus: day.focus, budgetMinutes: budgetFor(day, profile), slots: paired });
  });

  return { templateId: template.id, assumptions: assumptions(profile), days };
}
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/engine && npm run lint && npm run check`
Expected: `week.test.ts` 21 passed; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/week.ts src/lib/engine/week.test.ts
git commit -m $'feat(engine): fill a week from a template with ranking, overrides and supersets\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Week builder" \
  --body $'buildWeek(): feasible candidates, §7.2 ranking, overrides with notices, supersets, empty slots with unlocks, clearance and limitation notes, typical-value assumptions (D12).\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** the synthetic template fills deterministically, a profile with nothing entered is planned at typical values with its assumptions and clearance notes, and ranking, overrides, supersets and empty slots each have passing tests.

---

### Task 13: Short session and engine API

Spec §7.4 plus a single public entry point for the engine, so M4 imports `src/lib/engine` rather than individual files.

**Files:**
- Create: `src/lib/engine/shortSession.ts`, `src/lib/engine/index.ts`
- Test: `src/lib/engine/shortSession.test.ts`

**Interfaces:**
- Consumes: Task 11 (`DayPlan`, `withEstimate`), Task 8 fixtures.
- Produces: `SHORT_SESSION_MAX_SLOTS = 3`, `SHORT_SESSION_SETS = 2`, `SHORT_SESSION_MIN_RIR = 3`, `shortSession(day): DayPlan`; `src/lib/engine/index.ts` exporting `checkFeasibility`, `EngineOptions`, `TYPICAL_STATURE_CM`, `ASSUMED_CEILING_CM`, `assumptions`, probe types, `DEFAULT_PROBES`, plan types, `estimateDay`, `fitToTime`, `withEstimate`, `shortSession`, feasibility types and `buildWeek`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-short-session
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../content/schemas';
import { type DayPlan, type SlotPlan, withEstimate } from './plan';
import { shortSession } from './shortSession';
import { syntheticExercise } from './testing/fixtures';

const a = syntheticExercise({ id: 'a-press', pattern: 'horizontal-push' });
const b = syntheticExercise({ id: 'b-row', pattern: 'horizontal-pull' });
const c = syntheticExercise({ id: 'c-squat', pattern: 'squat' });
const d = syntheticExercise({ id: 'd-hinge', pattern: 'hip-hinge' });
const e = syntheticExercise({ id: 'e-curl', pattern: 'elbow-flexion' });

function slot(index: number, pick: Exercise | undefined, over: Partial<SlotPlan> = {}): SlotPlan {
  return {
    key: `fri/${index}`,
    index,
    patterns: [pick?.pattern ?? 'calf'],
    sets: 3,
    reps: [8, 10],
    rir: 2,
    restSec: 90,
    priority: 1,
    pick,
    why: [],
    notes: [],
    notices: [],
    alternatives: [],
    ...over,
  };
}
const day = (slots: SlotPlan[]): DayPlan => withEstimate({ weekday: 'fri', kind: 'strength', budgetMinutes: 35, slots });

describe('shortSession', () => {
  it('keeps the first three filled priority-1 slots at 2 sets and RIR ≥ 3', () => {
    const s = shortSession(
      day([
        slot(0, a),
        slot(1, e, { priority: 2 }),
        slot(2, undefined),
        slot(3, b, { sets: 1, rir: 4 }),
        slot(4, c),
        slot(5, d),
      ]),
    );
    expect(s.slots.map((x) => [x.index, x.sets, x.rir])).toEqual([
      [0, 2, 3],
      [3, 1, 4],
      [4, 2, 3],
    ]);
  });
  it('re-estimates the time', () => {
    const full = day([slot(0, a), slot(1, b), slot(2, c)]);
    const short = shortSession(full);
    expect(short.estimate.totalSec).toBeLessThan(full.estimate.totalSec);
    expect(short.estimate.workSec).toBe((2 / 3) * full.estimate.workSec);
  });
  it('keeps a superset only when both partners stay', () => {
    const s = shortSession(day([slot(0, a), slot(1, b, { supersetWith: 0 }), slot(2, c, { priority: 3 }), slot(3, d, { supersetWith: 2 })]));
    expect(s.slots.map((x) => [x.index, x.supersetWith])).toEqual([
      [0, undefined],
      [1, 0],
      [3, undefined],
    ]);
  });
  it('leaves slots without an RIR target without one', () => {
    const walk = syntheticExercise({ id: 'walk', pattern: 'cardio-steady', setupState: { station: 'cardio' }, figure: undefined });
    const s = shortSession(day([slot(0, walk, { sets: 1, reps: { seconds: 1200 }, rir: undefined })]));
    expect(s.slots[0]).toMatchObject({ sets: 1, rir: undefined });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/engine/shortSession.test.ts`
Expected: FAIL — `Failed to resolve import "./shortSession"`.

- [ ] **Step 4: Implement**

`src/lib/engine/shortSession.ts`:
```ts
import { type DayPlan, withEstimate } from './plan';

export const SHORT_SESSION_MAX_SLOTS = 3;
export const SHORT_SESSION_SETS = 2;
export const SHORT_SESSION_MIN_RIR = 3;

/**
 * Spec §7.4: for poor sleep, little time or incomplete recovery. Keeps up to three filled priority-1
 * slots in day order, at most 2 sets each, RIR raised to at least 3 (slots without an RIR target, such
 * as cardio, keep none). A superset survives only if both partners are kept.
 */
export function shortSession(day: DayPlan): DayPlan {
  const kept = day.slots.filter((s) => s.priority === 1 && s.pick).slice(0, SHORT_SESSION_MAX_SLOTS);
  const indexes = new Set(kept.map((s) => s.index));
  const slots = kept.map((s) => ({
    ...s,
    sets: Math.min(s.sets, SHORT_SESSION_SETS),
    rir: s.rir === undefined ? undefined : Math.max(s.rir, SHORT_SESSION_MIN_RIR),
    supersetWith: s.supersetWith !== undefined && indexes.has(s.supersetWith) ? s.supersetWith : undefined,
  }));
  return withEstimate({ ...day, slots });
}
```

`src/lib/engine/index.ts`:
```ts
/** Public API of the planning engine (spec §7). Pure: no DOM, no storage, no Astro. */
export { checkFeasibility, type EngineOptions } from './feasibility';
export { ASSUMED_CEILING_CM, assumptions, type GeometryProbe, type ProbeRegistry, type ProbeResult, TYPICAL_STATURE_CM } from './geometry';
export { DEFAULT_PROBES } from './probes';
export { type DayPlan, estimateDay, fitToTime, type SlotPlan, type TimeEstimate, type Week, withEstimate } from './plan';
export { shortSession } from './shortSession';
export type { Feasibility, FeasibilityStatus, Reason, Unlock } from './types';
export { buildWeek } from './week';
```

- [ ] **Step 5: Run the tests and the checks**

Run: `npx vitest run src/lib/engine && npm run lint && npm run check`
Expected: `shortSession.test.ts` 4 passed; 0 lint and type errors.

- [ ] **Step 6: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/shortSession.ts src/lib/engine/shortSession.test.ts src/lib/engine/index.ts
git commit -m $'feat(engine): add short sessions and the engine public API\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Short session and engine API" \
  --body $'shortSession(): up to three priority-1 slots at 2 sets, RIR ≥ 3; src/lib/engine/index.ts.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

**Done when:** short sessions keep at most three priority-1 slots at 2 sets and RIR ≥ 3, and supersets survive only with both partners.

---

### Task 14: Synthetic-profile scenarios and docs (M2 exit)

The M2 exit criterion: the whole engine on four synthetic profiles, checked by invariants (every pick feasible, alternatives feasible, fit-to-time never touches priority 1, short sessions bounded, determinism) plus one concrete expectation per profile. Also documents the content model and engine.

**Files:**
- Test: `src/lib/engine/scenarios.test.ts`
- Create: `docs/content-authoring.md`
- Modify: `docs/architecture.md` (Layers table, Conventions, new Engine section)

**Interfaces:**
- Consumes: the engine API (Task 13) and fixtures (Task 8).
- Produces: documentation only.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b m2/<issue>-m2-exit
```

- [ ] **Step 2: Write the scenario tests**

```ts
/**
 * M2 exit criterion (spec §16): the engine end to end on synthetic profiles. Invariants hold for every
 * profile; a few concrete expectations pin the behaviour of each.
 */
import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile/schema';
import { checkFeasibility, fitToTime, shortSession } from './index';
import { buildWeek } from './week';
import { dumbbellsOnly, fullHomeGym, lowCeiling, nothingMeasured, SYN_TEMPLATE, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const PROFILES: Record<string, () => Profile> = { fullHomeGym, dumbbellsOnly, nothingMeasured, lowCeiling };

describe.each(Object.entries(PROFILES))('synthetic profile %s', (_name, make) => {
  const profile = make();
  const week = buildWeek(SYN_TEMPLATE, profile, catalog);
  const slots = week.days.flatMap((d) => d.slots);

  it('never picks an exercise that is not feasible', () => {
    for (const s of slots) if (s.pick) expect(checkFeasibility(s.pick, profile, catalog).status, s.key).toBe('feasible');
  });
  it('only picks exercises of the slot pattern, and explains every empty slot', () => {
    for (const s of slots) {
      if (s.pick) expect(s.patterns, s.key).toContain(s.pick.pattern);
      else expect(s.empty?.reasons.length, s.key).toBeGreaterThan(0);
    }
  });
  it('lists only feasible alternatives', () => {
    for (const s of slots) {
      for (const id of s.alternatives) expect(checkFeasibility(catalog.exercises.get(id)!, profile, catalog).status, `${s.key} ${id}`).toBe('feasible');
    }
  });
  it('fit to time never removes priority-1 slots', () => {
    for (const d of week.days) {
      const fitted = fitToTime(d);
      const p1 = (x: typeof d) => x.slots.filter((s) => s.priority === 1).map((s) => [s.index, s.sets]);
      expect(p1(fitted)).toEqual(p1(d));
    }
  });
  it('short sessions keep at most three slots at 2 sets and RIR ≥ 3', () => {
    for (const d of week.days) {
      const short = shortSession(d);
      expect(short.slots.length).toBeLessThanOrEqual(3);
      for (const s of short.slots) {
        expect(s.sets).toBeLessThanOrEqual(2);
        if (s.rir !== undefined) expect(s.rir).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('is deterministic and serializable', () => {
    expect(JSON.parse(JSON.stringify(buildWeek(SYN_TEMPLATE, profile, catalog)))).toEqual(JSON.parse(JSON.stringify(week)));
  });
});

describe('scenario expectations', () => {
  const filled = (p: Profile) =>
    buildWeek(SYN_TEMPLATE, p, catalog)
      .days.flatMap((d) => d.slots)
      .filter((s) => s.pick)
      .map((s) => s.key);

  it('a full home gym fills every slot except cardio without a treadmill', () => {
    expect(filled(fullHomeGym())).toEqual(['mon/0', 'mon/1', 'mon/2', 'mon/3', 'tue/0', 'tue/1', 'tue/2', 'thu/0', 'thu/1']);
  });
  it('dumbbells only: no cable or Smith work, no vertical pull', () => {
    expect(filled(dumbbellsOnly())).toEqual(['mon/0', 'mon/1', 'mon/3', 'tue/0', 'tue/1', 'tue/2', 'thu/1']);
  });
  it('a profile with nothing entered is planned at typical values (D12)', () => {
    expect(filled(nothingMeasured())).toEqual(filled(fullHomeGym()));
    const week = buildWeek(SYN_TEMPLATE, nothingMeasured(), catalog);
    expect(week.assumptions.map((m) => m.key)).toEqual(['engine.assumed.stature', 'engine.assumed.ceiling']);
    const overhead = week.days[0]!.slots[1]!;
    expect(overhead.notes.map((m) => m.key)).toEqual(['engine.note.checkClearance']);
  });
  it('a low ceiling rules out overhead pressing but keeps the rest', () => {
    expect(filled(lowCeiling())).not.toContain('mon/1');
    expect(filled(lowCeiling())).toContain('mon/0');
  });
});
```

- [ ] **Step 3: Run them**

Run: `npx vitest run src/lib/engine/scenarios.test.ts`
Expected: 28 passed. These tests cover code from earlier tasks; a failure here is a bug in that code, so debug it (superpowers:systematic-debugging) rather than editing the expectation.

- [ ] **Step 4: Write the docs**

`docs/content-authoring.md`:
````markdown
# Content authoring

Fitness content is generic knowledge in YAML under `src/content/`. The Zod schemas in
`src/lib/content/schemas.ts` validate every file at build time, and `src/catalog.ts` cross-checks all
references, so `npm run build` fails on any mistake. The design spec (§5) is the reference.

## Rules

- **Generic only.** No brand or model names, no personal measurements, no photos of anyone's home.
  Dimensions in `illustrativeDefaults` are typical values: pages draw them (labeled "illustrative"), and
  the engine uses them whenever a user has not entered their own (spec D12). Every parameter the geometry
  checks read (`GEOMETRY_PARAMS` in `src/lib/content/vocab.ts`) needs one of the right type, and equipment
  providing `smith-bar`, `rack-uprights` or `pull-up-bar` must define the parameters those checks read
  (`CAPABILITY_GEOMETRY_PARAMS`), or the build fails.
- **Both languages.** Every user-facing field is `{ en, zh }`; `zh` is Simplified Chinese and must contain
  Chinese characters.
- **Ids** are kebab-case, unique per collection, and match the file name (`rope.yaml` → `id: rope`).
- **Positions in words.** Describe pulley, J-hook and catch positions as high / chest height / low. There
  are no hole numbers in v1 (spec D12).

## Equipment (`src/content/equipment/<id>.yaml`)

`id`, `kind` (station | bench | free-weight | cardio | accessory), `name`, `capabilities` (what exercises can
require), and `parameters`: what a user can measure. Each parameter has a `type` (cm, deg, bool, count,
enum, enum-set, stack, weights), a `label` and `how` to measure it; `enum` and `enum-set` also list
`values`. No parameter is ever required: users may enter their own values, and nothing asks them to. Smith
bar heights (stops, typical values) are measured from the floor to the centre of the bar, the geometry
layer's datum.

## Attachments (`src/content/attachments/<id>.yaml`)

`id`, `name`, `fits` (capabilities it attaches to). An attachment used in distinct ways lists `uses`; every
exercise that requires it must then declare its use under `requires.attachmentUses`.

## Exercises (`src/content/exercises/<id>.yaml`)

See `smith-squat.yaml`. Required: `pattern` (spec §5.4), `muscles`, `requires`, `jointStress` for knee,
lowBack, shoulder and wrist, `guideSection`, `setupState` (station, plus `benchAngleDeg` and/or `pulley`),
`setupSeconds`, `repSeconds`, `setup`, 2–3 `cues`, `mistakes` and `warmup`. `figure.spec` names a figure in
`src/lib/figure/fixtures`; only cardio-machine exercises may omit it. `alternatives` must exist.

## Templates (`src/content/templates/<id>.yaml`)

Days by `weekday` with `kind` (strength | cardio-core | mobility | rest). Training days need `focus`,
`minutes` and `slots`; rest days have none. A slot has `pattern` (one or a list), `sets`, `reps`
(`[low, high]` or `{ seconds }`), optional `rir`, `restSec`, `priority` (1 keeps, 3 goes first when time is
short) and optional `supersetWith` (the partner's index). A `fullBody: true` day allows at most 10 working
sets, all at RIR ≥ 2. Every slot needs at least one exercise of its pattern in the library.

## Check your change

```bash
npm test          # schemas, catalog rules and engine
npm run build     # validates every YAML file and cross-reference
```
````

In `docs/architecture.md`, add this row to the Layers table after "Pages and components":
```markdown
| Content | `src/content/**/*.yaml`, `src/content.config.ts`, `src/catalog.ts` | Generic knowledge only, validated by the Zod schemas in `src/lib/content`. `loadCatalog()` in `src/catalog.ts` is the only reader for the engine and fails the build on a broken reference. See [content-authoring.md](content-authoring.md) |
```
Replace the Conventions bullet "Personal data never enters the repository; it stays in the visitor's browser." with:
```markdown
- Personal data never enters the repository; it stays in the visitor's browser. `src/lib/profile` is the only code that touches `localStorage` (key `aih.profile`); everything else receives a `Profile` value.
- Pure code returns `Message` objects (`src/lib/i18n/format.ts`), never finished strings; UI code formats them with `formatMessage(locale, message, { length })`.
- Profiles and content store metric values; `src/lib/units.ts` converts only for display and input. Cable stacks and owned loads keep their printed unit.
```
Add a section before "## Figures":
```markdown
## Engine

`src/lib/engine` implements spec §7: `checkFeasibility` (capabilities, attachments, exclusions, geometry; feasible or infeasible), `buildWeek` (pattern slots, ranking, overrides, supersets, empty slots, assumptions), `estimateDay` / `fitToTime` and `shortSession`. Nothing waits on a measurement (spec D12): an unknown height poses at a typical 175 cm, an unknown ceiling is assumed to be 240 cm (exceeding it adds a "check overhead clearance" note), and unmeasured equipment uses its `illustrativeDefaults`. Geometry poses an exercise with a probe from `DEFAULT_PROBES` (the Smith squat, through `checkFigureFrame` on the typical machine); exercises without a probe use a conservative stature-based envelope until the M3 pose library. Tests use synthetic catalogs and profiles from `src/lib/engine/testing/fixtures.ts`.
```

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run check && npm run build`
Expected: every test file passes (M2 adds 16 test files and 185 tests to the suite); 0 lint and type errors; the build completes with only the two expected `templates` warnings.

- [ ] **Step 6: Privacy check**

Run: `grep -rinE "brand|model no|serial" src/content src/lib/engine/testing src/lib/profile || echo clean`
Expected: `clean`. Then read every added fixture and content value once more: each must be invented or illustrative, never a measurement shared by the owner.

- [ ] **Step 7: Commit, open the PR, merge when CI is green**

```bash
git add src/lib/engine/scenarios.test.ts docs/content-authoring.md docs/architecture.md
git commit -m $'test(engine): cover the engine end to end on synthetic profiles; document content and engine\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git push -u origin HEAD
gh pr create --repo tomqwu/ai_health --title "Synthetic-profile scenarios and docs (M2 exit)" \
  --body $'M2 exit criterion: engine tests green on synthetic profiles. Adds docs/content-authoring.md and the engine section of the architecture doc.\n\nCloses #<issue>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
```
When CI is green: `gh pr merge --squash --delete-branch && git checkout main && git pull`.

- [ ] **Step 8: Close the milestone**

```bash
gh issue close 17 --repo tomqwu/ai_health --comment "M2 exit criterion met: engine tests green on synthetic profiles."
M=$(gh api repos/tomqwu/ai_health/milestones --jq '.[] | select(.title=="M2 Content model & engine") | .number')
gh issue list --repo tomqwu/ai_health --milestone "M2 Content model & engine" --state open
```
Close the milestone (`gh api -X PATCH repos/tomqwu/ai_health/milestones/$M -f state=closed`) only when the list is empty.

**Done when (M2 exit):** engine tests are green on synthetic profiles and CI passes on `main`. Next: write the M3 plan.

---

## Self-review

**Spec coverage.**
- §3 D12: typical stature and ceiling, illustrative defaults for unmeasured parameters and the clearance note (Tasks 2, 8, 10, 12); every geometry parameter has a typical value, enforced by the catalog (Tasks 1, 4, 5); no hole numbers (Tasks 1, 5); no measurement prompts or required values (Tasks 1, 6); `needs-info` dropped consistently (Tasks 8–14).
- §4.1/§4.2 layout and boundaries: content in `src/content`, schemas and engine pure in `src/lib`, `src/catalog.ts` the only collection reader (Tasks 3–5); profile the only storage user (Task 7, Step 5 grep).
- §5.1–5.5 content model: Tasks 1, 3; cross-references and "every template pattern has an exercise": Task 4; build failure: Task 5. Guide MDX pairs and `guide`/`model3d` reference checks wait for M5/M3 (the fields are optional until then).
- §6 profile: schema, `aih.profile`, version + migrations, export/import, no personal fields (strict objects), optional stature, ceiling, limitations and equipment overrides (§9.1, D12): Tasks 6–7.
- §7.1 feasibility with the D12 unknown-input rules: Tasks 8–10, on the pose API merged in #45 (`checkFigureFrame`, signed ROM with the Smith-squat elbow exception). §7.2 week builder: Task 12. §7.3 estimate and fit-to-time: Task 11. §7.4 short session: Task 13. §7.5 is not in v1 (D12); §7.6 is M4 (owner decision 13).
- §10 i18n and units: Task 2 (dictionaries, `Message`, units); Zod `I18n` checks: Tasks 1, 3.
- §11 errors: corrupt profile backup, storage unavailable, invalid import, unfillable slot, over budget, dropped override, older version: Tasks 6, 7, 11, 12.
- §12 safety: limitations add notes and never change feasibility (Tasks 10, 12); no bypassed stops (bar travel against the measured or typical stops, Task 8); overhead clearance is flagged under an assumed ceiling (Tasks 8, 12).
- §5.1 bar-height datum (floor to the bar centre): content `how` text and typical values (Task 5), `GEOMETRY_PARAMS` and `EquipmentSchema` JSDoc (Tasks 1, 3), `ProbeResult.barCentersCm` and the stop comparisons (Tasks 8, 9).
- §13 privacy: synthetic fixtures only, no brands, test ceilings are a standard 8 ft (243.84 cm) or deliberately low, profile never leaves the browser (no network code in M2).
- §14 testing rows for Engine, Profile, i18n and Content integrity: Tasks 2–14; M2 exit: Task 14.

**Placeholder scan.** Every code step contains the complete file or the exact lines to add. `<issue>` is the number from the Task 0 table, filled in at execution time. No code in the plan uses a `needs-info` status, `MissingInfo`, hole types, an `optional` parameter flag or the pre-#45 pose API (`romExceeded`, numeric `ROM_LIMITS`, `jointAngles(world, side)`, separate `solveSmithSquat` + `validateSmithSquat` calls).

**Type consistency.** `ProbeResult` (`topCm`, `barCentersCm`, `rom`, `posing`; Tasks 8–10, 12), `Feasibility` (`status`, `reasons`, `notes`; Tasks 8, 10, 12, 14), `Week.assumptions` (Tasks 11, 12, 14), `GeometryParam` (Tasks 1, 4, 8), `SlotPlan.supersetWith` as a template index (Tasks 11–13), `EngineOptions.probes` (Tasks 10, 12), `Message`/`MessageKey` (Tasks 2, 6, 8–12) and `ParamValue` (Tasks 1, 6, 8) are used with the same names and shapes throughout.

**Dry run (2026-09-30).** Every code block of this plan was extracted into a scratch copy of `docs/m2-plan` (rebased on `main` after #45), task by task and as a whole. The full suite passed (34 files, 386 tests: M2 adds 16 files and 185 tests), `eslint` and `astro check` reported 0 problems, `astro build` completed with only the two expected `templates` warnings, and the three Task 5 "rejects bad content" builds failed with the expected messages.

> **Execution note (Task 12 review):** tie-breaks use `compareIds` from `src/lib/engine/order.ts` (code-unit order), not `localeCompare`, whose order depends on the runtime locale. `params.ts` and `week.ts` import it.
