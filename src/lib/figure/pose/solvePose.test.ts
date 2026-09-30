import { describe, expect, it } from 'vitest';
import { add, distance, dot, midpoint, normalize, scale, sub, type Vec3 } from '../math/vec3';
import { degToRad, rotate } from '../math/quat';
import { buildScene, ILLUSTRATIVE_SCENE } from '../geometry/scene';
import { frameProps } from './props';
import { footPoints, gripPoint, handAcross } from './body';
import { palmNormal } from './hands';
import { bothArms, mirrorArm, mirrorLeg, mirrorPoint } from './poseSpec';
import { resolvePoint, solvePose, trunkRotation } from './solvePose';
import { REAL_SKELETON } from './realSkeleton';
import type { WorldPose } from './skeleton';
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
    const toes = mirrorLeg(STAND.legs.l).toes;
    expect(Math.abs(toes[0])).toBe(0);
    expect(toes.slice(1)).toEqual([0, 1]);
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
  it('refuses an ab-wheel hand that names no handle (alongCm 0 would put it on the axle centre)', () => {
    const wheel = (alongCm: number) =>
      stand({ arms: bothArms({ to: { hold: 'ab-wheel', alongCm }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }), props: { abWheel: { bodyCm: [0, 30, 40] } } });
    expect(() => solvePose(sk, wheel(0), { statureCm: 175, scene })).toThrow(/^frame "stand": an ab-wheel hand must say which handle/);
    expect(solvePose(sk, wheel(1), { statureCm: 175, scene }).handTargets.l[0]).toBeGreaterThan(0);
  });
  it('draws a two-hand single handle even when both grips meet at one point', () => {
    const trainer = buildScene({ trainer: {} });
    const arms = {
      l: { to: { from: 'body.chest', bodyCm: [0, 0, 40] }, elbow: [1, -0.3, -0.3], hand: { grip: 'bar', axis: [0, 1, 0], palm: [-1, 0, -1] } },
      r: { to: { from: 'body.chest', bodyCm: [0, 0, 40] }, elbow: [-1, -0.3, -0.3], hand: { grip: 'bar', axis: [0, 1, 0], palm: [1, 0, -1] } },
    } as const;
    const frame = stand({ arms, props: { cable: { column: 'left', pulley: 'chest', handle: 'single-handle', hand: 'both' } } });
    const sol = solvePose(sk, frame, { statureCm: 175, scene: trainer, railZCm: 7 });
    const prims = frameProps(frame, sol, ILLUSTRATIVE_SCENE);
    // The grips differ only by rounding here: the handle lies across the left palm, not along that noise.
    const handle = prims.find((q) => q.id === 'single-handle-grip');
    expect(handle?.kind).toBe('cylinder');
    const axis = handle?.kind === 'cylinder' ? normalize(sub(handle.end, handle.start)) : ([0, 0, 0] as Vec3);
    expect(Math.abs(dot(axis, handAcross(sol.world, 'l')))).toBeGreaterThan(0.999);
    expect(JSON.stringify(prims)).not.toMatch(/null/);
  });
});

describe.each([
  ['synthetic', syntheticSkeleton()],
  ['real', REAL_SKELETON],
] as const)('solvePose on the %s rig', (_name, sk) => {
  it('reads the same hip angle with 45° of spine flexion as without (the hips unchanged)', () => {
    for (const statureCm of [150, 175, 200]) {
      const upright = solvePose(sk, STAND, { statureCm, scene });
      const curled = solvePose(sk, stand({ trunk: { ...STAND.trunk, spine: { flexDeg: 45 } } }), { statureCm, scene });
      for (const side of ['l', 'r'] as const) {
        expect(Math.abs(jointAngles(sk, curled.world, side).hipFlexDeg - jointAngles(sk, upright.world, side).hipFlexDeg)).toBeLessThan(0.01);
      }
    }
  });

  // A hand in front of the shoulder, forearm rising forward: the palm faces up or down across a bar along X.
  const reach = (palm: Vec3) =>
    stand({ arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [5, -30, 30] }, elbow: [0, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm } }) });
  it('resolves a clear palm hint the same way on every rig and stature', () => {
    for (const statureCm of [150, 175, 200]) {
      expect(palmNormal(solvePose(sk, reach([0, 1, 0.3]), { statureCm, scene }).world, 'l')[1]).toBeGreaterThan(0.5);
      expect(palmNormal(solvePose(sk, reach([0, -1, 0.3]), { statureCm, scene }).world, 'r')[1]).toBeLessThan(-0.5);
      expect(palmNormal(solvePose(sk, STAND, { statureCm, scene }).world, 'l')[2]).toBeGreaterThan(0.5);
    }
  });
  const forearm = (w: WorldPose, side: 'l' | 'r') => normalize(sub(w[`hand_${side}`]!.position, w[`lowerarm_${side}`]!.position));
  it('refuses a bar-grip palm hint along the fingers (neither palm side), naming the hand and the frame', () => {
    // The fingers follow the forearm across the bar, and both palm sides are perpendicular to them, so a
    // hint along the forearm picks neither. It used to pick one silently, by the sign of a tiny dot product.
    const clear = solvePose(sk, reach([0, 1, 0.3]), { statureCm: 175, scene }).world;
    const [along, up] = [forearm(clear, 'l'), palmNormal(clear, 'l')];
    expect(() => solvePose(sk, reach(along), { statureCm: 175, scene })).toThrow(/^frame "stand": the left hand's palm hint .* overhand or underhand is ambiguous/);
    // Within 14.5° of perpendicular (|dot| < 0.25) is too close to call; 20° off is clear enough.
    const tilt = (deg: number) => normalize(add(scale(along, Math.cos(degToRad(deg))), scale(up, Math.sin(degToRad(deg)))));
    expect(() => solvePose(sk, reach(tilt(10)), { statureCm: 175, scene })).toThrow(/ambiguous/);
    expect(palmNormal(solvePose(sk, reach(tilt(20)), { statureCm: 175, scene }).world, 'l')[1]).toBeGreaterThan(0.5);
  });
  it('refuses a free-hand palm hint along the forearm, and turns a clear one across it', () => {
    const free = (palm: Vec3) => stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'free', palm } }) });
    const along = forearm(solvePose(sk, free([0, 0, 1]), { statureCm: 175, scene }).world, 'l');
    expect(() => solvePose(sk, free(along), { statureCm: 175, scene })).toThrow(/^frame "stand": the left hand's palm hint .* along the forearm/);
    const w = solvePose(sk, free([0, -0.5, 1]), { statureCm: 175, scene }).world;
    expect(palmNormal(w, 'l')[2]).toBeGreaterThan(0.7);
    expect(palmNormal(w, 'r')[2]).toBeGreaterThan(0.7);
  });
  it('lays a flat hand along its authored fingers and palm', () => {
    const flat = stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'flat', palm: [0, 0, 1], fingers: [0, -1, 0] } }) });
    const w = solvePose(sk, flat, { statureCm: 175, scene }).world;
    expect(palmNormal(w, 'l')[2]).toBeGreaterThan(0.99);
  });
  it('keeps the hips on target under pitch, yaw and roll', () => {
    const turned = stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, pitchDeg: 40, yawDeg: 20, rollDeg: 10 } });
    const w = solvePose(sk, turned, { statureCm: 175, scene }).world;
    close(midpoint(w.thigh_l!.position, w.thigh_r!.position), [0, 89.5, 0], 1e-6);
  });
});
