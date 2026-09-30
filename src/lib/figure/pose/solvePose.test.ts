import { describe, expect, it } from 'vitest';
import { distance, midpoint, sub, type Vec3 } from '../math/vec3';
import { rotate } from '../math/quat';
import { buildScene } from '../geometry/scene';
import { footPoints, gripPoint } from './body';
import { palmNormal } from './hands';
import { bothArms, mirrorArm, mirrorLeg, mirrorPoint } from './poseSpec';
import { resolvePoint, solvePose, trunkRotation } from './solvePose';
import { syntheticSkeleton } from './synthetic';
import { STAND, stand } from './testing/frames';
import { jointAngles } from './validate';
import { wristBendDeg } from './body';

const scene = buildScene({});
const close = (a: Vec3, b: Vec3, cm = 0.01) => expect(distance(a, b)).toBeLessThan(cm);

describe('trunkRotation', () => {
  it('pitch leans forward, yaw turns left, roll tilts toward the left side', () => {
    close(rotate(trunkRotation(90), [0, 1, 0]), [0, 0, 1], 1e-9);
    close(rotate(trunkRotation(0, 90), [0, 0, 1]), [1, 0, 0], 1e-9);
    close(rotate(trunkRotation(0, 0, 90), [0, 1, 0]), [1, 0, 0], 1e-9);
    close(rotate(trunkRotation(-90), [0, 1, 0]), [0, 0, -1], 1e-9);
  });
});

describe('resolvePoint', () => {
  const anchors = { floor: [0, 0, 0], 'bench.seat': [0, 43, 20] } as const;
  it('adds fixed and stature-scaled offsets to an anchor', () => {
    expect(resolvePoint({ from: 'bench.seat', cm: [0, 1, 0], bodyCm: [0, 10, 0] }, anchors, 2)).toEqual([0, 64, 20]);
  });
  it('can measure height from the floor, also partly (in-between frames)', () => {
    expect(resolvePoint({ from: 'bench.seat', bodyCm: [0, 10, 0], yFromFloor: true }, anchors, 1)).toEqual([0, 10, 20]);
    expect(resolvePoint({ from: 'bench.seat', bodyCm: [0, 10, 0], yFromFloor: 0.5 }, anchors, 1)).toEqual([0, 31.5, 20]);
  });
  it('names the unknown anchor', () => {
    expect(() => resolvePoint({ from: 'bench.head' }, anchors, 1)).toThrow(/Unknown anchor "bench.head"/);
  });
});

describe('mirroring', () => {
  it('flips x and swaps left/right body anchors, but keeps scene anchors', () => {
    expect(mirrorPoint({ from: 'body.shoulder_l', bodyCm: [5, 1, 2], yFromFloor: true })).toEqual({ from: 'body.shoulder_r', bodyCm: [-5, 1, 2], yFromFloor: true });
    expect(mirrorPoint({ from: 'cable.left.high', cm: [3, 0, 0] })).toEqual({ from: 'cable.left.high', cm: [-3, 0, 0] });
    expect(mirrorArm({ to: { hold: 'barbell', alongCm: 20 }, elbow: [1, 0, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [1, 0, 1], seat: 'palm' } })).toEqual({
      to: { hold: 'barbell', alongCm: -20 },
      elbow: [-1, 0, 0],
      hand: { grip: 'bar', axis: [-1, 0, 0], palm: [-1, 0, 1], seat: 'palm' },
    });
    expect(mirrorLeg(STAND.legs.l).toes).toEqual([-0, 0, 1]);
  });
});

describe('solvePose (synthetic skeleton, 175 cm)', () => {
  const sk = syntheticSkeleton();
  const sol = solvePose(sk, STAND, { statureCm: 175, scene });
  const w = sol.world;

  it('puts the midpoint of the hip joints on its target', () => {
    close(midpoint(w.thigh_l!.position, w.thigh_r!.position), [0, 89.5, 0]);
  });
  it('reaches every limb goal and keeps bone lengths', () => {
    for (const side of ['l', 'r'] as const) {
      close(gripPoint(w, side, 'bar', 1), sol.handTargets[side]);
      close(footPoints(sk, w, side, 1, 1).ball, sol.footTargets[side]);
      expect(footPoints(sk, w, side, 1, 1).heel[1]).toBeCloseTo(0, 6);
    }
  });
  it('bends elbows and knees on their hinges (issue #47, option b): signed flexion is positive', () => {
    const a = jointAngles(sk, w, 'l');
    expect(a.elbowFlexDeg).toBeGreaterThan(0);
    expect(a.kneeFlexDeg).toBeGreaterThan(0);
  });
  it('keeps the wrist straight across the handle and turns the palm to the hinted side', () => {
    expect(palmNormal(w, 'l')[2]).toBeGreaterThan(0.5);
    expect(wristBendDeg(sk, w, 'l')).toBeLessThan(12);
    const under = solvePose(sk, stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] } }) }), { statureCm: 175, scene });
    expect(palmNormal(under.world, 'l')[2]).toBeLessThan(-0.5);
  });
  it('can leave the upper arm unrolled (issue #47, option a) and still reach the grip', () => {
    const plain = solvePose(sk, stand({ arms: bothArms({ ...STAND.arms.l, hinge: false }) }), { statureCm: 175, scene });
    close(gripPoint(plain.world, 'l', 'bar', 1), plain.handTargets.l);
    expect(plain.world.upperarm_l!.rotation).not.toEqual(w.upperarm_l!.rotation);
  });
  it('is the same pose, scaled, at another stature when only body offsets are used', () => {
    const tall = solvePose(sk, STAND, { statureCm: 200, scene });
    const k = 200 / 175;
    close(tall.world.head!.position, [w.head!.position[0] * k, w.head!.position[1] * k, w.head!.position[2] * k], 1e-6);
  });
  it('rotates the whole body and bends the spine', () => {
    const lean = solvePose(sk, stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, pitchDeg: 30, spine: { flexDeg: 20 } } }), { statureCm: 175, scene });
    const up = sub(lean.world.neck_01!.position, lean.world.pelvis!.position);
    expect(up[2]).toBeGreaterThan(0.6 * Math.hypot(...up));
  });
  it('holds a Smith bar on the rail at the frame height', () => {
    const trainer = buildScene({ trainer: {} });
    const grip = bothArms({ to: { hold: 'smith-bar', alongCm: 30 }, elbow: [1, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } });
    const s = solvePose(sk, stand({ arms: grip, props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 10, 0] } } }), { statureCm: 175, scene: trainer, railZCm: 7 });
    expect(s.smithBar![2]).toBe(7);
    close(s.handTargets.l, [30, s.smithBar![1], 7]);
    expect(() => solvePose(sk, stand({ arms: grip, props: { smithBar: {} } }), { statureCm: 175, scene: trainer })).toThrow(/no Smith machine/);
    expect(() => solvePose(sk, stand({ arms: grip }), { statureCm: 175, scene: trainer })).toThrow(/does not place/);
  });
});
