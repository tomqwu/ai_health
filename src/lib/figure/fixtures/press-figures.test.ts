/**
 * What the press figures teach, pinned on the committed human at the sweep statures: the Smith bench
 * press is set up with its safety catches just below the bar at the chest, and both presses keep the
 * elbows about 45° from the body with the forearms under the hands.
 */
import { describe, expect, it } from 'vitest';
import { FIGURES } from '.';
import type { FrameRef, PosedFigure } from '../figures';
import { aabbOf } from '../geometry/primitives';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { type Vec3, cross, dot, normalize, scale, sub } from '../math/vec3';
import { REAL_SKELETON } from '../pose/realSkeleton';

const STATURES = [150, 165, 175, 190, 200] as const;
const deg = (r: number) => (r * 180) / Math.PI;

/** The torso's frame: toward the head, toward the figure's left, and out of the chest. */
function torso(p: PosedFigure) {
  const P = (n: string) => p.world[n]!.position;
  const up = normalize(sub(P('neck_01'), P('pelvis')));
  const across = sub(P('upperarm_l'), P('upperarm_r'));
  const left = normalize(sub(across, scale(up, dot(across, up))));
  return { P, up, left, out: cross(up, left) };
}

/**
 * The left elbow's angle from the body, seen square to the chest (0° = along the body toward the feet,
 * 90° = straight out to the side), and how much of the upper arm lies in that view (0–1).
 */
function elbowFromBody(p: PosedFigure): { deg: number; inView: number } {
  const { P, up, left, out } = torso(p);
  const arm = sub(P('lowerarm_l'), P('upperarm_l'));
  const flat = sub(arm, scale(out, dot(arm, out)));
  return { deg: deg(Math.atan2(dot(flat, left), -dot(flat, up))), inView: Math.hypot(...flat) / Math.hypot(...arm) };
}

/** The left forearm's lean from vertical (°). */
function forearmLean(p: PosedFigure): number {
  const f: Vec3 = normalize(sub(p.world.hand_l!.position, p.world.lowerarm_l!.position));
  return deg(Math.acos(f[1]));
}

/** How far the left hand is out from the middle of the chest (cm at the reference stature). */
function handOut(p: PosedFigure, statureCm: number): number {
  const { P, left } = torso(p);
  return (dot(sub(P('hand_l'), P('spine_03')), left) * 175) / statureCm;
}

describe('Smith machine bench press', () => {
  const fig = FIGURES['smith-bench-press']!;
  const lower = fig.frames.findIndex((f) => f.id === 'lower');
  const floorFrameTop = ILLUSTRATIVE_SMITH.uprightSizeCm / 2;

  it.each(STATURES)('sets the safety catches 2–5 cm below the bar at the chest, above the floor frame, at %i cm', (statureCm) => {
    const scene = fig.scene(REAL_SKELETON, { statureCm });
    const bars = fig.frames.map((_, i) => fig.pose(REAL_SKELETON, i, { statureCm }).smithBarCm!);
    const bottom = bars[lower]!;
    expect(Math.min(...bars)).toBe(bottom);
    const catchCm = scene.anchors['smith.catch']![1];
    expect(bottom - catchCm).toBeGreaterThanOrEqual(2);
    expect(bottom - catchCm).toBeLessThanOrEqual(5);
    const blocks = scene.prims.filter((p) => p.id.startsWith('catch-'));
    expect(blocks).toHaveLength(2);
    for (const b of blocks) expect(aabbOf(b).min[1]).toBeGreaterThan(floorFrameTop);
  });

  it('moves the catches with the lifter: a taller lifter lies higher on the bench', () => {
    const at = (statureCm: number) => fig.scene(REAL_SKELETON, { statureCm }).anchors['smith.catch']![1];
    expect(at(200)).toBeGreaterThan(at(150) + 5);
  });

  it.each([150, 175, 200])('keeps the elbows about 45° from the body and the forearms under the bar at %i cm', (statureCm) => {
    for (const i of [lower, fig.frames.findIndex((f) => f.id === 'press')]) {
      const p = fig.pose(REAL_SKELETON, i, { statureCm });
      expect(elbowFromBody(p).deg, p.frameId).toBeGreaterThan(40);
      expect(elbowFromBody(p).deg, p.frameId).toBeLessThan(50);
      expect(forearmLean(p), p.frameId).toBeLessThan(10);
    }
  });
});

describe('incline dumbbell press', () => {
  const fig = FIGURES['db-incline-press']!;
  const [start, lower, press] = ['start', 'lower', 'press'].map((id) => fig.frames.findIndex((f) => f.id === id)) as [number, number, number];

  it.each([150, 175, 200])('keeps the elbows about 45° from the body from the chest through the press at %i cm', (statureCm) => {
    const refs: FrameRef[] = [lower, ...[0.25, 0.5, 0.75].map((t) => ({ from: lower, to: press, t })), press];
    for (const ref of refs) {
      const p = fig.pose(REAL_SKELETON, ref, { statureCm });
      const e = elbowFromBody(p);
      expect(e.inView, p.frameId).toBeGreaterThan(0.8);
      expect(e.deg, p.frameId).toBeGreaterThan(40);
      expect(e.deg, p.frameId).toBeLessThan(55);
      expect(forearmLean(p), p.frameId).toBeLessThan(10);
    }
  });

  it('presses up and slightly in', () => {
    const out = (i: number) => handOut(fig.pose(REAL_SKELETON, i, { statureCm: 175 }), 175);
    expect(out(press)).toBeLessThan(out(lower) - 1);
    expect(out(start)).toBeLessThan(out(press) - 1);
  });
});
