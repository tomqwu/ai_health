import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, midpoint, normalize, scale, sub } from '../math/vec3';
import { angleBetweenQuatsDeg, degToRad, fromAxisAngle, rotate } from '../math/quat';
import { PoseBuilder } from './builder';
import { curlFingers, palmNormal } from './hands';
import { restPose } from './skeleton';
import { syntheticSkeleton } from './synthetic';

const SEEDS = [undefined, 2, 11];

describe('behaviours the first suite does not pin', () => {
  it('aim puts the child on the ray toward the target', () => {
    for (const seed of SEEDS) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1.2);
      const target: Vec3 = [60, 150, 40];
      b.aim('upperarm_l', 'lowerarm_l', target);
      const w = b.world();
      const got = normalize(sub(w.lowerarm_l!.position, w.upperarm_l!.position));
      const want = normalize(sub(target, w.upperarm_l!.position));
      expect(distance(got, want)).toBeLessThan(1e-9);
    }
  });
  it('aim does not depend on the bone orientation before the call', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    const a = new PoseBuilder(sk, 1);
    const c = new PoseBuilder(sk, 1);
    a.aim('upperarm_l', 'lowerarm_l', [80, 200, 10]);
    a.aim('upperarm_l', 'lowerarm_l', [-30, 100, 60]);
    c.aim('upperarm_l', 'lowerarm_l', [-30, 100, 60]);
    expect(angleBetweenQuatsDeg(a.world().upperarm_l!.rotation, c.world().upperarm_l!.rotation)).toBeLessThan(1e-3);
  });
  it('rotateWorld turns a bone and its children about a world axis through its head', () => {
    for (const seed of SEEDS) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1.2);
      const before = b.world();
      const axis = normalize([0.3, -1, 0.5]);
      b.rotateWorld('upperarm_l', axis, 0.9);
      const after = b.world();
      const head = before.upperarm_l!.position;
      expect(distance(after.upperarm_l!.position, head)).toBeLessThan(1e-9);
      const expected = add(head, rotate(fromAxisAngle(axis, 0.9), sub(before.hand_l!.position, head)));
      expect(distance(after.hand_l!.position, expected)).toBeLessThan(1e-9);
    }
  });
  it('rotateLocal turns about an axis expressed in the bone frame', () => {
    for (const seed of SEEDS) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
      const before = b.world();
      const axisLocal = normalize([1, 0.2, -0.4]);
      b.rotateLocal('lowerarm_l', axisLocal, 0.7);
      const head = before.lowerarm_l!.position;
      const axisWorld = rotate(before.lowerarm_l!.rotation, axisLocal);
      const expected = add(head, rotate(fromAxisAngle(axisWorld, 0.7), sub(before.hand_l!.position, head)));
      expect(distance(b.world().hand_l!.position, expected)).toBeLessThan(1e-9);
    }
  });
  it('twoBoneIK clamps unreachable targets to full extension and returns the point reached', () => {
    const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 3 }), 1);
    const w0 = b.world();
    const a = w0.thigh_l!.position;
    const reach = distance(a, w0.calf_l!.position) + distance(w0.calf_l!.position, w0.foot_l!.position);
    const reached = b.twoBoneIK('thigh_l', 'calf_l', 'foot_l', [9, -200, 0], [0, 0, 1]);
    expect(distance(a, reached)).toBeGreaterThan(reach - 1e-3);
    expect(distance(a, reached)).toBeLessThanOrEqual(reach);
    expect(distance(b.world().foot_l!.position, reached)).toBeLessThan(1e-6);
  });
  it('twoBoneIK honours a non-unit scale factor on a posed body', () => {
    const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 4 }), 1.37);
    b.rotateWorld('pelvis', [0, 1, 0], degToRad(30));
    b.rootPosition = add(b.rootPosition, [5, -10, 7]);
    const a = b.world().thigh_l!.position;
    const target = add(a, scale(normalize([0.3, -0.6, 0.7]), 60));
    b.twoBoneIK('thigh_l', 'calf_l', 'foot_l', target, [0, 0, 1]);
    expect(distance(b.world().foot_l!.position, target)).toBeLessThan(1e-6);
  });
  it('curls the right hand toward its palm too', () => {
    for (const seed of SEEDS) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
      const w0 = b.world();
      const palmPoint = add(midpoint(w0.hand_r!.position, w0.middle_01_r!.position), scale(palmNormal(w0, 'r'), 3));
      const before = distance(w0.middle_03_r!.position, palmPoint);
      curlFingers(b, 'r', [60, 70, 50], [15, 25, 20]);
      expect(distance(b.world().middle_03_r!.position, palmPoint)).toBeLessThan(before - 2);
    }
  });
  it('curls the thumb toward the palm', () => {
    const b = new PoseBuilder(syntheticSkeleton(), 1);
    const w0 = b.world();
    const palmPoint = add(midpoint(w0.hand_l!.position, w0.middle_01_l!.position), scale(palmNormal(w0, 'l'), 3));
    const before = distance(w0.thumb_03_l!.position, palmPoint);
    curlFingers(b, 'l', [0, 0, 0], [15, 25, 20]);
    expect(distance(b.world().thumb_03_l!.position, palmPoint)).toBeLessThan(before);
  });
  it('curl reaches the last segment (its orientation changes by the summed angle)', () => {
    const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 11 }), 1);
    const r0 = b.world().middle_03_l!.rotation;
    curlFingers(b, 'l', [30, 40, 20], [0, 0, 0]);
    expect(angleBetweenQuatsDeg(r0, b.world().middle_03_l!.rotation)).toBeCloseTo(90, 0);
  });
  it('mirrors the right side to -X', () => {
    const w = restPose(syntheticSkeleton(), 1);
    expect(w.hand_r!.position[0]).toBeCloseTo(-w.hand_l!.position[0], 9);
    expect(w.hand_r!.position[0]).toBeLessThan(0);
  });
});
