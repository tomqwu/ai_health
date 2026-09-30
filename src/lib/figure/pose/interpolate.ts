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
