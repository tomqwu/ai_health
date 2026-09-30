import { type Vec3, add, angleBetweenDeg, cross, distance, dot, length, normalize, scale, sub } from '../math/vec3';
import { conjugate, rotate } from '../math/quat';
import type { SmithParams } from '../geometry/smith';
import type { Side } from './hands';
import { bodyForward, type SkeletonDef, type WorldPose, restPose } from './skeleton';
import type { SmithSquatSolution } from './smithSquat';

export type Severity = 'error' | 'warn';

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
  message: string;
}

/**
 * Conservative joint limits in degrees, signed. Flexion is positive; the lower bound catches bending
 * the wrong way: knee and elbow hyperextension (more than a few degrees past straight), hip extension
 * past the typical active range (about 10–20°; the hip reads 0 when standing, as the ankle does), and
 * ankle plantarflexion.
 */
export const ROM_LIMITS = {
  elbowFlexDeg: { min: -5, max: 145 },
  kneeFlexDeg: { min: -5, max: 150 },
  hipFlexDeg: { min: -20, max: 130 },
  ankleDorsiflexDeg: { min: -40, max: 40 },
} as const;

export type JointAngles = Record<keyof typeof ROM_LIMITS, number>;

/**
 * A hinge's flexion axis, fixed in the bone that carries it. Derived once per skeleton from its rest
 * pose, never from rig axis conventions: the axis is perpendicular to the proximal segment and to the
 * direction flexion moves the distal segment (knee: backward; elbow and hip: forward), where forward is
 * the body's facing ({@link bodyForward} of the rest pose).
 */
interface Hinge {
  carrier: string;
  axisLocal: Vec3;
}

interface RigFrame {
  hinges: Record<'elbow' | 'knee' | 'hip', Record<Side, Hinge>>;
  /** Angle between shank (ankle→knee) and foot (ankle→ball) at rest, per side (deg). */
  restAnkleDeg: Record<Side, number>;
  /** The hip's sagittal bend at rest (standing), per side: the hip angle's zero. */
  restHipDeg: Record<Side, number>;
}

const rigFrames = new WeakMap<SkeletonDef, RigFrame>();
/** A rest segment within this fraction (sine of the angle) of the body's forward defines no hinge. */
const HINGE_EPS = 1e-6;

function rigFrame(sk: SkeletonDef): RigFrame {
  let f = rigFrames.get(sk);
  if (f) return f;
  const rest = restPose(sk, 1);
  const P = (n: string) => rest[n]!.position;
  const forward = bodyForward(rest);
  /** `segment` names the proximal segment in the error when the rest pose leaves the hinge undefined. */
  const hinge = (joint: string, segment: string, carrier: string, proximal: Vec3, flexToward: Vec3): Hinge => {
    const axis = cross(proximal, flexToward);
    if (!(length(axis) > HINGE_EPS * length(proximal) * length(flexToward))) {
      throw new Error(`jointAngles: rest ${segment} is parallel to the body's forward; cannot derive the ${joint} hinge`);
    }
    return { carrier, axisLocal: rotate(conjugate(rest[carrier]!.rotation), normalize(axis)) };
  };
  const back = scale(forward, -1);
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
  rigFrames.set(sk, f);
  return f;
}

/**
 * Angle between two segments meeting at a hinge (0 = straight), signed by which way the distal
 * segment turned about the hinge's flexion axis: positive = flexion, negative = the wrong way.
 *
 * Limitation: the magnitude is the full angle between the segments and the axis only sets the sign, so
 * a bend that leaves the hinge plane (a sideways bend) reads as ordinary flexion and is not flagged. It
 * happens when a solver leaves the proximal bone's twist at the shortest swing: in the Smith squat the
 * knee's bend plane sits up to about 25° off the thigh's hinge on the real rig (about 19° on the
 * synthetic one), for the same reason as the elbow (see `validateSmithSquat`). Rolling the thighs with
 * `twoBoneIK`'s `bendSide` would put the knee back on its hinge.
 */
function signedBendDeg(w: WorldPose, hinge: Hinge, proximal: Vec3, distal: Vec3): number {
  const axis = rotate(w[hinge.carrier]!.rotation, hinge.axisLocal);
  const deg = angleBetweenDeg(proximal, distal);
  return dot(cross(proximal, distal), axis) < 0 ? -deg : deg;
}

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
  const thigh = sub(p('calf'), p('thigh'));
  return {
    elbowFlexDeg: signedBendDeg(w, hinges.elbow[side], sub(p('lowerarm'), p('upperarm')), sub(p('hand'), p('lowerarm'))),
    kneeFlexDeg: signedBendDeg(w, hinges.knee[side], thigh, sub(p('foot'), p('calf'))),
    hipFlexDeg: sagittalBendDeg(w, hinges.hip[side], sub(w.pelvis!.position, w.spine_03!.position), thigh) - restHipDeg[side],
    ankleDorsiflexDeg: restAnkleDeg[side] - angleBetweenDeg(sub(p('calf'), p('foot')), sub(p('ball'), p('foot'))),
  };
}

const WRONG_WAY: Record<keyof typeof ROM_LIMITS, string> = {
  elbowFlexDeg: 'hyperextension',
  kneeFlexDeg: 'hyperextension',
  hipFlexDeg: 'extension',
  ankleDorsiflexDeg: 'plantarflexion',
};

/**
 * ROM findings for both sides of a posed body.
 *
 * `signedElbow: false` checks only the elbow's bend magnitude against its upper limit. It exists for
 * solvers that leave the upper arm's twist at the shortest swing (they do not model humeral rotation),
 * so the humerus's hinge, and with it the elbow's sign, says nothing about the intended pose.
 */
export function romFindings(sk: SkeletonDef, w: WorldPose, opts: { signedElbow?: boolean } = {}): Finding[] {
  const out: Finding[] = [];
  for (const side of ['l', 'r'] as const) {
    const a = jointAngles(sk, w, side);
    if (opts.signedElbow === false) a.elbowFlexDeg = Math.abs(a.elbowFlexDeg);
    for (const [k, { min, max }] of Object.entries(ROM_LIMITS) as Array<[keyof typeof ROM_LIMITS, { min: number; max: number }]>) {
      const name = `${k.replace('Deg', '')}_${side}`;
      if (a[k] > max) out.push({ check: 'rom', severity: 'error', message: `${name} at ${a[k].toFixed(0)}° exceeds ${max}°` });
      if (a[k] < min) {
        out.push({ check: 'rom', severity: 'error', message: `${name} at ${a[k].toFixed(0)}° is past the ${min}° limit (${WRONG_WAY[k]})` });
      }
    }
  }
  return out;
}

export function headTop(sk: SkeletonDef, w: WorldPose, scaleFactor: number) {
  return add(w.head!.position, rotate(w.head!.rotation, scale(sk.headTopLocal, scaleFactor)));
}

/**
 * Where the posed body actually carries the bar. The solver places the bar at neck_01 (rest) plus the
 * offset, rigid with the torso; spine_03 moves with the torso and ignores the neck/head counter-rotation,
 * so the bar is expressed in spine_03's frame at rest and re-posed from the solved world.
 */
export function carriedBarCenter(sk: SkeletonDef, sol: SmithSquatSolution, barRestOffsetCm: Vec3): Vec3 {
  const s = sol.scaleFactor;
  const rest = restPose(sk, s);
  const barRest = add(rest.neck_01!.position, scale(barRestOffsetCm, s));
  const barLocal = rotate(conjugate(rest.spine_03!.rotation), sub(barRest, rest.spine_03!.position));
  return add(sol.world.spine_03!.position, rotate(sol.world.spine_03!.rotation, barLocal));
}

export function validateSmithSquat(
  sk: SkeletonDef,
  sol: SmithSquatSolution,
  ctx: { smith: SmithParams; barRestOffsetCm: Vec3; ceilingCm?: number; clearanceMarginCm?: number },
): Finding[] {
  const out: Finding[] = [];
  const error = (check: Finding['check'], message: string) => out.push({ check, severity: 'error', message });
  const w = sol.world;
  const s = sol.scaleFactor;

  for (const [bone, target] of Object.entries(sol.targets)) {
    const d = distance(w[bone]!.position, target);
    if (d > 1) error('anchor', `${bone} is ${d.toFixed(1)} cm from its target`);
  }

  const rest = restPose(sk, s);
  for (const side of ['l', 'r'] as const) {
    const dy = Math.abs(w[`ball_${side}`]!.position[1] - rest[`ball_${side}`]!.position[1]);
    if (dy > 1.5) error('feet-flat', `ball_${side} lifted ${dy.toFixed(1)} cm off the floor`);
  }

  const carried = carriedBarCenter(sk, sol, ctx.barRestOffsetCm);
  const offRail = Math.abs(carried[2] - ctx.smith.railZCm);
  const offCentre = Math.abs(carried[0]);
  if (offRail > 0.5 || offCentre > 0.5) {
    error('bar-on-rail', `bar is ${offRail.toFixed(1)} cm off the rail and ${offCentre.toFixed(1)} cm off the centre line`);
  }
  const drift = distance(carried, sol.barCenter);
  if (drift > 0.5) error('bar-on-rail', `bar is not where the body carries it (${drift.toFixed(1)} cm apart)`);
  const y = carried[1];
  if (y < ctx.smith.lowestBarHeightCm || y > ctx.smith.highestBarHeightCm) {
    error('bar-travel', `bar at ${y.toFixed(0)} cm is outside ${ctx.smith.lowestBarHeightCm}–${ctx.smith.highestBarHeightCm} cm`);
  }

  for (const b of sk.bones) {
    if (!b.parent) continue;
    const expected = length(b.restLocalT) * s;
    const actual = distance(w[b.name]!.position, w[b.parent]!.position);
    if (Math.abs(actual - expected) > 0.1) error('bone-length', `${b.name} length changed by ${(actual - expected).toFixed(2)} cm`);
  }

  // Known limitation (#40): solveSmithSquat swings the upper arms the shortest way and does not rotate
  // the humerus, so about the humerus's own hinge its elbows bend 100–120° around from the flexion side
  // and would read as hyperextended. Rolling the humerus (twoBoneIK's `bendSide`) makes them true hinge
  // flexion but visibly twists the shirt sleeve on this rig, which has no twist bones. Until that is
  // decided, the Smith squat checks the elbow's bend magnitude only; knees, hips and ankles are signed.
  // The knee has the same cause on a smaller scale: its bend sits up to ~25° off the thigh's hinge. The
  // sign is still right, but the signed metric cannot see bending off the hinge (see `signedBendDeg`).
  out.push(...romFindings(sk, w, { signedElbow: false }));

  if (ctx.ceilingCm !== undefined) {
    const margin = ctx.clearanceMarginCm ?? 10;
    const top = Math.max(headTop(sk, w, s)[1], y + ctx.smith.plateDiameterCm / 2);
    if (top > ctx.ceilingCm - margin) {
      error('ceiling', `highest point ${top.toFixed(0)} cm leaves less than ${margin} cm below the ${ctx.ceilingCm} cm ceiling`);
    }
  }
  return out;
}
