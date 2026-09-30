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

/**
 * How clearly a palm hint must pick its side: the sine of the smallest angle (about 14.5°) between the
 * hint and the directions where it would pick neither. A bar grip's palm faces one of two opposite
 * sides, and the hint picks the one it points toward; within 14.5° of the plane between them, a few
 * degrees of forearm lean (another stature, rig or in-between pose) would turn the grip over, silently,
 * since the grip point and the wrist stay valid either way. The band is 29° wide, wider than the change
 * in forearm direction between neighbouring sweep samples, so a grip that turns over between two samples
 * lands in it at one of them. A hint that names a side points at it (|dot| near 1) or at least 45°
 * toward it (0.71), far outside the band. A free hand's palm turns to the hint as seen across the
 * forearm, which swings wildly for a hint within 14.5° of the forearm and is undefined along it.
 */
export const PALM_HINT_MIN = 0.25;

/**
 * Hand world rotation for a pose, given the current estimate of the forearm's direction. `strict`
 * (the pass whose rotation is kept) throws when the palm hint does not clearly pick the palm's side.
 */
function handRotation(rest: WorldPose, side: Side, goal: ArmGoal, forearm: Vec3, where: { frameId: string; strict: boolean }): Quat {
  const ambiguous = (why: string, measure: string, value: number) => {
    const hand = side === 'l' ? 'left' : 'right';
    const hint = goal.hand.palm.map((x) => +x.toFixed(2)).join(', ');
    return new Error(`frame "${where.frameId}": the ${hand} hand's palm hint [${hint}] ${why} (${measure} ${value.toFixed(2)} < ${PALM_HINT_MIN}); point it at the side the palm should face`);
  };
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
    const toward = dot(p, normalize(h.palm));
    // `!(… >= …)` also catches NaN (a hint along the bar or of zero length).
    if (where.strict && !(Math.abs(toward) >= PALM_HINT_MIN)) {
      throw ambiguous('is nearly perpendicular to both palm sides, so overhand or underhand is ambiguous', '|dot|', Math.abs(toward));
    }
    palm = toward >= 0 ? p : scale(p, -1);
  } else if (h.grip === 'flat' || h.fingers) {
    fingers = h.grip === 'flat' ? h.fingers : h.fingers!;
    palm = h.palm;
  } else {
    // A free hand keeps a straight wrist: the fingers follow the forearm, the palm turns as near the hint as it can.
    fingers = forearm;
    const hint = normalize(h.palm);
    const across = sub(hint, scale(forearm, dot(hint, forearm)));
    if (where.strict && !(length(across) >= PALM_HINT_MIN)) {
      throw ambiguous('lies nearly along the forearm, so the way the palm faces is ambiguous', 'sine of the angle', length(across));
    }
    palm = across;
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

  // 5. Arms: grip target → hand orientation → wrist target → IK; three passes, so a bar grip's fingers follow the solved forearm.
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
      // Only the last pass's rotation is kept; the first starts from a rough forearm (shoulder → target).
      const handRot = handRotation(rest, side, goal, forearm, { frameId: frame.id, strict: pass === 2 });
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
  if (hold === 'ab-wheel' && !(Math.abs(goal.to.alongCm) > 0)) throw new Error(`frame "${frameId}": an ab-wheel hand must say which handle it holds (alongCm + for the left, − for the right, not 0)`);
  const along = hold === 'ab-wheel' ? Math.sign(goal.to.alongCm) * AB_WHEEL_GRIP_OFFSET_CM : goal.to.alongCm * k;
  return add(center, [along, 0, 0]);
}
