import { type Vec3, add, distance, midpoint, scale, sub, X_AXIS, Y_AXIS } from '../math/vec3';
import { type Quat, degToRad, fromAxisAngle, multiply, rotate } from '../math/quat';
import type { I18nText } from '../../i18n/locales';
import { PoseBuilder } from './builder';
import { curlFingers, type Side } from './hands';
import { type SkeletonDef, type WorldPose, restPose } from './skeleton';

export interface SmithSquatFrame {
  id: string;
  label: I18nText;
  cue: I18nText;
  /** Forward tilt of the shin from vertical (deg). */
  shankDeg: number;
  /** Thigh angle from vertical (deg); negative = hips behind the knees. */
  thighDeg: number;
  /** Movement arrow drawn beside the bar in this frame. */
  arrow?: 'down' | 'up';
}

export interface SmithSquatSpec {
  id: string;
  name: I18nText;
  /** Camera at the 175 cm default stature; distance and target scale with stature. */
  camera: { azimuthDeg: number; elevationDeg: number; distanceCm: number; targetYCm: number };
  stance: { halfWidthCm: number; toeOutDeg: number; forwardOfRailCm: number };
  grip: {
    halfWidthCm: number;
    /** Wrist target relative to the grip point (left hand; mirrored for the right). */
    wristOffsetCm: Vec3;
    /** Knuckle aim point relative to the grip point (left hand; mirrored for the right). */
    knuckleOffsetCm: Vec3;
    fingerCurlDeg: readonly [number, number, number];
    thumbCurlDeg: readonly [number, number, number];
  };
  /** Bar centre relative to the neck_01 head at rest (cm at native scale). */
  barRestOffsetCm: Vec3;
  /** Fraction of the trunk lean the head keeps (0.4 = the head tilts 40% as much as the trunk). */
  headFollow: number;
  frames: readonly SmithSquatFrame[];
}

export type AnchorBone = 'hand_l' | 'hand_r' | 'foot_l' | 'foot_r';

export interface SmithSquatSolution {
  frameId: string;
  scaleFactor: number;
  local: Record<string, Quat>;
  rootPosition: Vec3;
  world: WorldPose;
  barCenter: Vec3;
  trunkDeg: number;
  targets: Record<AnchorBone, Vec3>;
}

const mirror = (v: Vec3, sx: number): Vec3 => [sx * v[0], v[1], v[2]];

export function solveSmithSquat(
  sk: SkeletonDef,
  spec: SmithSquatSpec,
  frame: SmithSquatFrame,
  ctx: { statureCm: number; railZCm: number },
): SmithSquatSolution {
  const s = ctx.statureCm / sk.statureCm;
  const b = new PoseBuilder(sk, s);
  const rest = restPose(sk, s);
  const P = (n: string): Vec3 => rest[n]!.position;

  // Legs in the sagittal plane; the stance's lateral offset is folded into effective segment lengths.
  const hipRest = midpoint(P('thigh_l'), P('thigh_r'));
  const thighLen = distance(P('thigh_l'), P('calf_l'));
  const shankLen = distance(P('calf_l'), P('foot_l'));
  const lateral = Math.max(0, spec.stance.halfWidthCm - Math.abs(P('thigh_l')[0] - hipRest[0]));
  const thighEff = Math.sqrt(thighLen ** 2 - ((lateral * thighLen) / (thighLen + shankLen)) ** 2);
  const shankEff = Math.sqrt(shankLen ** 2 - ((lateral * shankLen) / (thighLen + shankLen)) ** 2);
  const ankleY = (P('foot_l')[1] + P('foot_r')[1]) / 2;
  const footZ = ctx.railZCm + spec.stance.forwardOfRailCm;
  const sr = degToRad(frame.shankDeg);
  const tr = degToRad(frame.thighDeg);
  const kneeY = ankleY + shankEff * Math.cos(sr);
  const kneeZ = footZ + shankEff * Math.sin(sr);
  const hip: Vec3 = [0, kneeY + thighEff * Math.cos(tr), kneeZ + thighEff * Math.sin(tr)];

  // Trunk lean: rotate the rigid torso about the hip axis until the bar sits on the rail.
  const barRest = add(P('neck_01'), scale(spec.barRestOffsetCm, s));
  const hipToBar = sub(barRest, hipRest);
  const barAt = (deg: number): Vec3 => add(hip, rotate(fromAxisAngle(X_AXIS, degToRad(deg)), hipToBar));
  let lo = -15;
  let hi = 75;
  if (barAt(lo)[2] > ctx.railZCm || barAt(hi)[2] < ctx.railZCm) {
    throw new Error(`smith-squat frame "${frame.id}": no trunk angle puts the bar on the rail`);
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (barAt(mid)[2] < ctx.railZCm) lo = mid;
    else hi = mid;
  }
  const trunkDeg = (lo + hi) / 2;
  const lean = fromAxisAngle(X_AXIS, degToRad(trunkDeg));
  const root = sk.bones[0]!;
  b.local[root.name] = multiply(lean, root.restLocalR);
  b.rootPosition = add(hip, rotate(lean, sub(rest[root.name]!.position, hipRest)));

  // Head keeps only `headFollow` of the lean (neutral neck, gaze slightly down).
  const headBack = -(1 - spec.headFollow) * degToRad(trunkDeg);
  b.rotateWorld('neck_01', X_AXIS, headBack / 2);
  b.rotateWorld('head', X_AXIS, headBack / 2);

  const barCenter = barAt(trunkDeg);
  const targets = {} as Record<AnchorBone, Vec3>;
  const toe = degToRad(spec.stance.toeOutDeg);

  for (const [side, sx] of [
    ['l', 1],
    ['r', -1],
  ] as Array<[Side, number]>) {
    // Legs: knees track over the toes; feet flat and turned out.
    const ankle: Vec3 = [sx * spec.stance.halfWidthCm, P(`foot_${side}`)[1], footZ];
    b.twoBoneIK(`thigh_${side}`, `calf_${side}`, `foot_${side}`, ankle, [sx * Math.sin(toe), 0.1, Math.cos(toe)]);
    b.setWorldRotation(`foot_${side}`, multiply(fromAxisAngle(Y_AXIS, sx * toe), rest[`foot_${side}`]!.rotation));
    targets[`foot_${side}`] = ankle;

    // Arms: hands on the bar, elbows down and back.
    const grip: Vec3 = [sx * spec.grip.halfWidthCm, barCenter[1], barCenter[2]];
    const wrist = add(grip, mirror(spec.grip.wristOffsetCm, sx));
    b.twoBoneIK(`upperarm_${side}`, `lowerarm_${side}`, `hand_${side}`, wrist, [sx * 0.6, -1, -0.6]);
    b.aim(`hand_${side}`, `middle_01_${side}`, add(grip, mirror(spec.grip.knuckleOffsetCm, sx)));
    curlFingers(b, side, spec.grip.fingerCurlDeg, spec.grip.thumbCurlDeg);
    targets[`hand_${side}`] = wrist;
  }

  return {
    frameId: frame.id,
    scaleFactor: s,
    local: { ...b.local },
    rootPosition: b.rootPosition,
    world: b.world(),
    barCenter,
    trunkDeg,
    targets,
  };
}
