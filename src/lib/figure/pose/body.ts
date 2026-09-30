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
 * How far the toe tip reaches past the ball of the foot (cm at 175 cm; scaled by stature ÷ 175). A typical
 * adult foot is about 15% of stature (26 cm at 175 cm) with the ball at about 73% of its length from the
 * heel, which leaves about 7 cm of toes. The skeleton ends at the ball (`ball_l`/`ball_r` are leaf bones),
 * so the toes are modelled by this one point.
 */
export const TOE_LENGTH_CM = 7;

/**
 * Foot contact points, posed: under the ball of the foot and under the heel (on the floor at rest), and
 * the toe tip, `TOE_LENGTH_CM` past the ball at sole level along the toes (the `ball_` bone: in line with
 * the foot, or along the surface for a raised heel). `s` is the skeleton scale factor, `k` = stature ÷ 175.
 */
export function footPoints(sk: SkeletonDef, w: WorldPose, side: Side, s: number, k: number): { ball: Vec3; heel: Vec3; toe: Vec3 } {
  const rest = restPose(sk, s);
  const foot = rest[`foot_${side}`]!.position;
  const ball = rest[`ball_${side}`]!.position;
  const turn = turnFromRest(sk, w, `foot_${side}`);
  const at = (p: Vec3) => add(w[`foot_${side}`]!.position, rotate(turn, sub(p, foot)));
  const ballSole = at([ball[0], 0, ball[2]]);
  const toesRest = normalize([ball[0] - foot[0], 0, ball[2] - foot[2]]);
  const toe = add(ballSole, scale(rotate(turnFromRest(sk, w, `ball_${side}`), toesRest), TOE_LENGTH_CM * k));
  return { ball: ballSole, heel: at([foot[0], 0, foot[2] - 4 * k]), toe };
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
