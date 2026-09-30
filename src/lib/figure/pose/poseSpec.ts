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
