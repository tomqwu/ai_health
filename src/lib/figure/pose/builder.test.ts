import { describe, expect, it } from 'vitest';
import { type Vec3, add, cross, distance, dot, midpoint, normalize, scale, sub } from '../math/vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, rotate } from '../math/quat';
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

describe('aim roll control and the opposite direction', () => {
  /** World direction from `bone` to its child in the current pose. */
  const dirOf = (b: PoseBuilder, bone: string, child: string) => {
    const w = b.world();
    return normalize(sub(w[child]!.position, w[bone]!.position));
  };
  /** A unit vector perpendicular to `d`. */
  const perpTo = (d: Vec3): Vec3 => normalize(sub([0.3, 0.2, 0.9], scale(d, dot([0.3, 0.2, 0.9], d))));

  it('aims at the exact opposite of the rest direction with a finite, deterministic, rig-independent result', () => {
    const hands: Vec3[] = [];
    for (const seed of SEEDS) {
      const results = [0, 1].map(() => {
        const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1.1);
        const head = b.world().upperarm_l!.position;
        const target = sub(head, scale(dirOf(b, 'upperarm_l', 'lowerarm_l'), 40));
        b.aim('upperarm_l', 'lowerarm_l', target);
        const w = b.world();
        expect(w.upperarm_l!.rotation.every(Number.isFinite)).toBe(true);
        const got = normalize(sub(w.lowerarm_l!.position, head));
        expect(distance(got, normalize(sub(target, head)))).toBeLessThan(1e-9);
        return w;
      });
      expect(results[0]!.upperarm_l!.rotation).toEqual(results[1]!.upperarm_l!.rotation);
      hands.push(results[0]!.hand_l!.position);
    }
    // The flip is chosen from world geometry, not from the rig's local axes.
    for (const h of hands) expect(distance(h, hands[0]!)).toBeLessThan(1e-6);
  });

  it('gives the same result for targets a hair off the exact opposite, whichever side they fall', () => {
    const b0 = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 2 }), 1);
    const head = b0.world().upperarm_l!.position;
    const d0 = dirOf(b0, 'upperarm_l', 'lowerarm_l');
    const p = perpTo(d0);
    const q = cross(d0, p);
    const hands = [p, scale(p, -1), q, scale(q, -1)].map((off) => {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 2 }), 1);
      b.aim('upperarm_l', 'lowerarm_l', add(head, add(scale(d0, -40), scale(off, 40 * 1e-4))));
      return b.world().hand_l!.position;
    });
    for (const h of hands) expect(distance(h, hands[0]!)).toBeLessThan(0.05);
  });

  it('keeps the side that faced `up` at rest facing `up` after aiming', () => {
    for (const seed of SEEDS) {
      for (const target of [[20, 260, 30], [80, 140, 0], [-10, 150, 70]] as Vec3[]) {
        const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
        const up: Vec3 = [0, 0, 1];
        const r0 = b.world().upperarm_l!.rotation;
        const d0 = dirOf(b, 'upperarm_l', 'lowerarm_l');
        const sideLocal = rotate(conjugate(r0), normalize(sub(up, scale(d0, dot(up, d0)))));
        b.aim('upperarm_l', 'lowerarm_l', target, { up });
        const d1 = dirOf(b, 'upperarm_l', 'lowerarm_l');
        const want = normalize(sub(up, scale(d1, dot(up, d1))));
        expect(dot(rotate(b.world().upperarm_l!.rotation, sideLocal), want)).toBeGreaterThan(1 - 1e-9);
        expect(distance(d1, normalize(sub(target, b.world().upperarm_l!.position)))).toBeLessThan(1e-9);
      }
    }
  });

  it('turns the side that faced `restUp` toward `up` (the requested roll)', () => {
    for (const seed of SEEDS) {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), 1);
      const r0 = b.world().upperarm_l!.rotation;
      const d0 = dirOf(b, 'upperarm_l', 'lowerarm_l');
      const restUp: Vec3 = [0, 0, 1];
      const sideLocal = rotate(conjugate(r0), normalize(sub(restUp, scale(d0, dot(restUp, d0)))));
      const head = b.world().upperarm_l!.position;
      b.aim('upperarm_l', 'lowerarm_l', add(head, [0, 50, 0]), { up: [1, 0, 0], restUp });
      expect(dot(rotate(b.world().upperarm_l!.rotation, sideLocal), [1, 0, 0])).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('with an up hint, the roll is continuous through the exact opposite', () => {
    const b0 = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 11 }), 1);
    const head = b0.world().upperarm_l!.position;
    const d0 = dirOf(b0, 'upperarm_l', 'lowerarm_l');
    const p = perpTo(d0);
    const q = cross(d0, p);
    const rots = [[0, 0, 0], p, scale(p, -1), q, scale(q, -1)].map((off) => {
      const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: 11 }), 1);
      b.aim('upperarm_l', 'lowerarm_l', add(head, add(scale(d0, -40), scale(off as Vec3, 40 * 1e-4))), { up: [0, 0, 1] });
      return b.world().upperarm_l!.rotation;
    });
    for (const r of rots) expect(angleBetweenQuatsDeg(r, rots[0]!)).toBeLessThan(0.02);
  });

  it('rejects a target at the bone head and an up hint along the aim, naming the bones', () => {
    const b = new PoseBuilder(syntheticSkeleton(), 1);
    const head = b.world().upperarm_l!.position;
    expect(() => b.aim('upperarm_l', 'lowerarm_l', head)).toThrow(/aim\(upperarm_l → lowerarm_l\).*target/);
    expect(() => b.aim('upperarm_l', 'lowerarm_l', add(head, [0, 30, 0]), { up: [0, 1, 0] })).toThrow(
      /aim\(upperarm_l → lowerarm_l\).*up/,
    );
  });
});
