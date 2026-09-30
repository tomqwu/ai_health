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
