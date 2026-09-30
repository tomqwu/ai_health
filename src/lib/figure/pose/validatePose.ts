import { type Vec3, add, distance, dot, length, midpoint, normalize, sub } from '../math/vec3';
import type { Built } from '../geometry/built';
import { aabbOf, aabbOverlap, overlapDepth, type Primitive, signedDistance } from '../geometry/primitives';
import type { SceneParams } from '../geometry/scene';
import { bodyBottom, bodyCapsules, bodyTop, type Capsule, contactGap, footPoints, gripPoint, wristBendDeg } from './body';
import type { Side } from './hands';
import type { PoseFrame } from './poseSpec';
import { SMITH_BAR_PART, SOLID_PROP } from './props';
import type { SkeletonDef } from './skeleton';
import { gripKind, type PoseSolution } from './solvePose';
import { type Finding, headTop, romFindings } from './validate';

/** Spec §8.1: anchored parts within 1 cm of their targets. */
export const CONTACT_TOLERANCE_CM = 1;
/** Hanging bodies keep this much air under them. */
export const HANG_CLEARANCE_CM = 2;
/** A body part may sink this far into padding or skin contact before it counts as overlapping. */
export const BODY_OVERLAP_CM = 2;
/** A held implement may reach this far into the body before it counts as passing through it (spec §12). */
export const IMPLEMENT_IN_BODY_CM = 4;
/**
 * Wrist bend (the hand's direction against its rest direction, both in the forearm's frame) the
 * validators accept: a hand holding something stays near neutral, a pressing hand even more so (bent-back
 * wrists under a press are a form fault); a hand flat on the floor or a pad bends back as far as a
 * push-up needs. A `free` hand (holding nothing) gets the `held` limit: decision 5 names only these three.
 */
export const WRIST_MAX_DEG = { held: 30, press: 25, flat: 85 } as const;
/** Limits on the authored trunk and neck (deg): a neutral spine and gaze, as figures teach. */
export const SPINE_LIMITS_DEG = {
  spineFlex: { min: -10, max: 45 },
  spineSide: { min: -20, max: 20 },
  spineTwist: { min: -30, max: 30 },
  headFlex: { min: -30, max: 45 },
  headTurn: { min: -60, max: 60 },
} as const;

export interface PoseCheckContext {
  scene: Built;
  params: SceneParams;
  /** Room ceiling (profile only, spec §8.1): omit for illustrative renders. */
  ceilingCm?: number;
  clearanceMarginCm?: number;
}

/** The props the body carries: solid implements and the Smith bar with its plates (not cables or handles). */
function carriedProps(props: readonly Primitive[]): Primitive[] {
  return props.filter((p) => SOLID_PROP.test(p.id) || SMITH_BAR_PART.test(p.id));
}

/** Highest point of the body and what it moves (cm): head, every capsule, held implements and the Smith bar with its plates (not cables or handles). */
export function poseTop(sk: SkeletonDef, sol: PoseSolution, props: readonly Primitive[]): number {
  const caps = bodyCapsules(sk, sol.world, sol.scaleFactor, sol.k);
  const carried = carriedProps(props);
  return Math.max(headTop(sk, sol.world, sol.scaleFactor)[1], bodyTop(caps), ...carried.map((p) => aabbOf(p).max[1]));
}

/** Authored spine and neck angles outside `SPINE_LIMITS_DEG`, as findings. */
function spineFindings(frame: PoseFrame): Finding[] {
  const t = frame.trunk;
  const values: Record<keyof typeof SPINE_LIMITS_DEG, number> = {
    spineFlex: t.spine?.flexDeg ?? 0,
    spineSide: t.spine?.sideDeg ?? 0,
    spineTwist: t.spine?.twistDeg ?? 0,
    headFlex: t.head?.flexDeg ?? 0,
    headTurn: t.head?.turnDeg ?? 0,
  };
  const out: Finding[] = [];
  for (const [k, { min, max }] of Object.entries(SPINE_LIMITS_DEG) as Array<[keyof typeof SPINE_LIMITS_DEG, { min: number; max: number }]>) {
    const v = values[k];
    if (v < min || v > max) out.push({ check: 'rom', severity: 'error', message: `${k} at ${v.toFixed(0)}° is outside ${min}…${max}°` });
  }
  return out;
}

/**
 * Every validator of spec §8.1 for one solved frame: contacts (hands, feet, declared body contacts)
 * within 1 cm, feet flat, bone lengths, signed joint limits, the wrists, the authored spine and neck,
 * nothing below the floor, hanging clearance, the Smith bar on its rail, within its stops and above its
 * safety catches, bench against rack, held implements against the floor, the equipment and the body,
 * the ceiling (only when given), and a warning when a body part sinks into equipment or a held implement
 * it does not declare contact with.
 */
export function validatePose(sk: SkeletonDef, frame: PoseFrame, sol: PoseSolution, props: readonly Primitive[], ctx: PoseCheckContext): Finding[] {
  const out: Finding[] = [];
  const error = (check: Finding['check'], message: string) => out.push({ check, severity: 'error', message });
  const w = sol.world;
  const s = sol.scaleFactor;
  const k = sol.k;
  const caps = bodyCapsules(sk, w, s, k);

  // Hands.
  for (const side of ['l', 'r'] as const) {
    const goal = frame.arms[side];
    const checked = goal.contact ?? ('hold' in goal.to || goal.hand.grip === 'flat');
    if (!checked) continue;
    const d = distance(gripPoint(w, side, gripKind(goal), k), sol.handTargets[side]);
    if (d > CONTACT_TOLERANCE_CM) error('anchor', `hand_${side} is ${d.toFixed(1)} cm from its grip`);
  }
  // Feet.
  for (const side of ['l', 'r'] as const) {
    const goal = frame.legs[side];
    if (goal.contact === 'none') continue;
    const { ball, heel } = footPoints(sk, w, side, s, k);
    const d = distance(ball, sol.footTargets[side]);
    if (d > CONTACT_TOLERANCE_CM) error('anchor', `foot_${side} is ${d.toFixed(1)} cm from its target`);
    if (goal.contact === 'flat') {
      const surface = ctx.scene.surfaces[goal.on ?? 'floor'];
      if (surface?.kind === 'plane') {
        const lift = Math.abs(dot(sub(heel, surface.point), normalize(surface.normal)));
        if (lift > CONTACT_TOLERANCE_CM) error('feet-flat', `heel_${side} is ${lift.toFixed(1)} cm off its surface`);
      }
    }
  }
  // Declared body contacts (a loose one is only excused from the overlap warning).
  for (const c of frame.contacts ?? []) {
    if (c.loose) continue;
    const cap = caps.find((x) => x.part === c.part);
    const surface = ctx.scene.surfaces[c.on];
    if (!cap || !surface) throw new Error(`frame "${frame.id}": unknown contact ${c.part} on ${c.on}`);
    const gap = contactGap(cap, surface, c.along);
    if (Math.abs(gap) > CONTACT_TOLERANCE_CM) error('anchor', `${c.part} is ${gap.toFixed(1)} cm ${gap > 0 ? 'above' : 'into'} ${c.on}`);
  }

  // Bone lengths.
  for (const bone of sk.bones) {
    if (!bone.parent) continue;
    const expected = length(bone.restLocalT) * s;
    const actual = distance(w[bone.name]!.position, w[bone.parent]!.position);
    if (Math.abs(actual - expected) > 0.1) error('bone-length', `${bone.name} length changed by ${(actual - expected).toFixed(2)} cm`);
  }

  // Joint limits: signed knees, elbows and hips (the solver bends them on their hinges), ankles, wrists,
  // and the authored spine and neck. An arm posed without the hinge roll (issue #47, option a) has its
  // elbows checked by bend magnitude only.
  const hinged = frame.arms.l.hinge !== false && frame.arms.r.hinge !== false;
  out.push(...romFindings(sk, w, { signedElbow: hinged }));
  for (const side of ['l', 'r'] as const) {
    const bend = wristBendDeg(sk, w, side);
    const kind = gripKind(frame.arms[side]);
    const max = WRIST_MAX_DEG[kind === 'flat' ? 'flat' : kind === 'press' ? 'press' : 'held'];
    if (bend > max) error('rom', `wrist_${side} bent ${bend.toFixed(0)}° exceeds ${max}°`);
  }
  out.push(...spineFindings(frame));

  // Floor and hanging.
  // Feet count by their sole points (ball, heel and toe tip); the rounded foot capsule dips when the foot
  // tilts, and stops at the ball of the foot, where the skeleton ends.
  let low = bodyBottom(caps.filter((c) => !c.part.startsWith('foot_')));
  for (const side of ['l', 'r'] as const) {
    for (const p of Object.values(footPoints(sk, w, side, s, k))) if (p[1] < low.y) low = { part: `foot_${side}`, y: p[1] };
  }
  if (low.y < -CONTACT_TOLERANCE_CM) error('floor', `${low.part} reaches ${(-low.y).toFixed(1)} cm below the floor`);
  if (frame.hanging && low.y < HANG_CLEARANCE_CM) error('hang-clearance', `hanging, ${low.part} is only ${low.y.toFixed(1)} cm above the floor`);

  // The Smith bar, re-derived from the hands that hold it, against the rail the scene draws.
  if (sol.smithBar) {
    const held = midpoint(gripPoint(w, 'l', gripKind(frame.arms.l), k), gripPoint(w, 'r', gripKind(frame.arms.r), k));
    const rail = ctx.scene.anchors['smith.rail'] ?? sol.smithBar;
    const offRail = Math.abs(held[2] - rail[2]);
    const offCentre = Math.abs(held[0] - rail[0]);
    if (offRail > 0.5 || offCentre > 0.5) error('bar-on-rail', `the hands hold the bar ${offRail.toFixed(1)} cm off the rail and ${offCentre.toFixed(1)} cm off centre`);
    const t = ctx.params.trainer;
    if (held[1] < t.lowestBarHeightCm || held[1] > t.highestBarHeightCm) {
      error('bar-travel', `bar at ${held[1].toFixed(0)} cm is outside ${t.lowestBarHeightCm}–${t.highestBarHeightCm} cm`);
    }
    // Spec §12: no figure shows a bypassed stop, so the bar stays above the safety catches it is drawn with.
    const catches = ctx.scene.anchors['smith.catch'];
    if (catches && held[1] < catches[1] - 0.5) error('bar-travel', `bar at ${held[1].toFixed(0)} cm is below the safety catches at ${catches[1].toFixed(0)} cm`);
  }

  // Bench against the rack; implements against the floor and the equipment. `overlapDepth` measures both
  // ways, so a thin rail, bar or tube through a thick implement counts wherever it pierces it.
  const benchPrims = ctx.scene.prims.filter((p) => p.id.startsWith('bench-'));
  const frameParts = ctx.scene.prims.filter((p) => !p.id.startsWith('bench-'));
  if (ctx.scene.anchors['smith.rail']) {
    for (const bp of benchPrims) {
      for (const fp of frameParts) {
        if (overlapDepth(bp, fp) > 0.5) error('bench-rack', `${bp.id} intersects ${fp.id}`);
      }
    }
  }
  for (const ip of props.filter((p) => SOLID_PROP.test(p.id))) {
    if (aabbOf(ip).min[1] < -0.5) error('implement', `${ip.id} goes through the floor`);
    for (const sp of ctx.scene.prims) if (overlapDepth(ip, sp) > 0.5) error('implement', `${ip.id} intersects ${sp.id}`);
  }

  // The ceiling, when the room is known.
  if (ctx.ceilingCm !== undefined) {
    const margin = ctx.clearanceMarginCm ?? 10;
    const top = poseTop(sk, sol, props);
    if (top > ctx.ceilingCm - margin) error('ceiling', `highest point ${top.toFixed(0)} cm leaves less than ${margin} cm below the ${ctx.ceilingCm} cm ceiling`);
  }

  // Warn: a body part sinking into equipment it does not rest on. Hands are skipped: they grip things.
  const excused = new Set((frame.contacts ?? []).map((c) => `${c.part}|${ctx.scene.surfaces[c.on]?.primitive ?? ''}`));
  for (const cap of caps.filter((c) => !c.part.startsWith('hand_'))) {
    for (const prim of ctx.scene.prims) {
      if (excused.has(`${cap.part}|${prim.id}`) || footRestsOn(frame, cap, prim, ctx.scene)) continue;
      const depth = capsuleDepth(cap, prim);
      if (depth > BODY_OVERLAP_CM) out.push({ check: 'body-overlap', severity: 'warn', message: `${cap.part} sinks ${depth.toFixed(1)} cm into ${prim.id}` });
    }
  }
  // Held implements against the body (hands and forearms hold them): a warning past 2 cm, and an error
  // past 4 cm, where the implement would pass through a limb (spec §12). A frame may declare a touch.
  const touches = frame.touches ?? [];
  const held = carriedProps(props);
  for (const cap of caps.filter((c) => !/^(hand|forearm)_/.test(c.part))) {
    for (const prop of held) {
      if (touches.some((t) => t.part === cap.part && prop.id.startsWith(t.prop))) continue;
      const depth = capsuleDepth(cap, prop);
      if (depth > IMPLEMENT_IN_BODY_CM) error('implement', `${prop.id} is ${depth.toFixed(1)} cm inside ${cap.part}`);
      else if (depth > BODY_OVERLAP_CM) out.push({ check: 'body-overlap', severity: 'warn', message: `${cap.part} sinks ${depth.toFixed(1)} cm into ${prop.id}` });
    }
  }
  return out;
}

/** Feet and shanks may touch the surface their foot stands on. */
function footRestsOn(frame: PoseFrame, cap: Capsule, prim: Primitive, scene: Built): boolean {
  const m = /^(foot|shank)_(l|r)$/.exec(cap.part);
  if (!m) return false;
  const on = frame.legs[m[2] as Side].on ?? 'floor';
  return scene.surfaces[on]?.primitive === prim.id;
}

/** Spacing of the samples along a capsule's axis (cm): a thin bar between two samples is underestimated by at most a few mm. */
const CAPSULE_SAMPLE_CM = 1;

/** How deep a capsule reaches into a primitive (cm, ≥ 0), sampled along its axis every `CAPSULE_SAMPLE_CM`. */
function capsuleDepth(c: Capsule, p: Primitive): number {
  const r: Vec3 = [c.r, c.r, c.r];
  if (!aabbOverlap({ min: sub(minOf(c.a, c.b), r), max: add(maxOf(c.a, c.b), r) }, aabbOf(p))) return 0;
  const n = Math.max(6, Math.ceil(distance(c.a, c.b) / CAPSULE_SAMPLE_CM));
  let depth = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const point: Vec3 = [c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t, c.a[2] + (c.b[2] - c.a[2]) * t];
    depth = Math.max(depth, c.r - signedDistance(p, point));
  }
  return depth;
}

const minOf = (a: Vec3, b: Vec3): Vec3 => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const maxOf = (a: Vec3, b: Vec3): Vec3 => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
