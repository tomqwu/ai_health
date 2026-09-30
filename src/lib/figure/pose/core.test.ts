import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, dot, midpoint, normalize, scale, sub } from '../math/vec3';
import { PoseBuilder } from './builder';
import { curlFingers, palmNormal } from './hands';
import { forwardKinematics, restPose } from './skeleton';
import { syntheticSkeleton } from './synthetic';

describe('forward kinematics', () => {
  it('reproduces rest positions regardless of rest-rotation convention', () => {
    const a = restPose(syntheticSkeleton(), 1);
    const b = restPose(syntheticSkeleton({ randomRestSeed: 7 }), 1);
    for (const name of Object.keys(a)) expect(distance(a[name]!.position, b[name]!.position)).toBeLessThan(1e-9);
  });
  it('uses glTF axes: left = +X, facing +Z, up +Y', () => {
    const w = restPose(syntheticSkeleton(), 1);
    expect(w.hand_l!.position[0]).toBeGreaterThan(0);
    expect(w.ball_l!.position[2]).toBeGreaterThan(w.foot_l!.position[2]);
    expect(w.head!.position[1]).toBeGreaterThan(w.pelvis!.position[1]);
  });
  it('scales positions uniformly', () => {
    expect(forwardKinematics(syntheticSkeleton(), { local: {} }, 2).head!.position[1]).toBeCloseTo(314);
  });
});

describe('PoseBuilder', () => {
  it('two-bone IK reaches a reachable target and bends toward the pole', () => {
    const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 3 }), 1);
    const target: Vec3 = [9, 30, 25];
    b.twoBoneIK('thigh_l', 'calf_l', 'foot_l', target, [0, 0, 1]);
    const w = b.world();
    expect(distance(w.foot_l!.position, target)).toBeLessThan(1e-6);
    const axis = normalize(sub(target, w.thigh_l!.position));
    const knee = sub(w.calf_l!.position, w.thigh_l!.position);
    const offAxis = sub(knee, scale(axis, dot(knee, axis)));
    expect(dot(offAxis, [0, 0, 1])).toBeGreaterThan(0);
  });
  it('keeps bone lengths when aiming', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 2 });
    const b = new PoseBuilder(sk, 1);
    b.aim('upperarm_l', 'lowerarm_l', [60, 150, 40]);
    const w = b.world();
    const rest = restPose(sk, 1);
    expect(distance(w.upperarm_l!.position, w.lowerarm_l!.position)).toBeCloseTo(
      distance(rest.upperarm_l!.position, rest.lowerarm_l!.position),
      9,
    );
  });
  it('aim rejects a non-child', () => {
    const b = new PoseBuilder(syntheticSkeleton(), 1);
    expect(() => b.aim('upperarm_l', 'hand_l', [0, 0, 0])).toThrow(/not a child/);
  });
});

describe('hands', () => {
  it('curling fingers moves fingertips toward the palm', () => {
    for (const seed of [undefined, 11]) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
      const w0 = b.world();
      const palmPoint = add(midpoint(w0.hand_l!.position, w0.middle_01_l!.position), scale(palmNormal(w0, 'l'), 3));
      const before = distance(w0.middle_03_l!.position, palmPoint);
      curlFingers(b, 'l', [60, 70, 50], [15, 25, 20]);
      expect(distance(b.world().middle_03_l!.position, palmPoint)).toBeLessThan(before - 2);
    }
  });
  it('palm normals of a hanging hand point toward the body', () => {
    const w = restPose(syntheticSkeleton(), 1);
    expect(palmNormal(w, 'l')[0]).toBeLessThan(0);
    expect(palmNormal(w, 'r')[0]).toBeGreaterThan(0);
  });
});
