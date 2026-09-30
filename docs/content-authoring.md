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
