import { describe, expect, it } from 'vitest';
import { buildDumbbell } from '../geometry/implements';
import { buildScene, ILLUSTRATIVE_SCENE, type SceneSpec } from '../geometry/scene';
import { bodyCapsules, capsuleGap, contactGap } from './body';
import { lerp } from '../math/vec3';
import { sphere } from '../geometry/built';
import { bothArms, bothLegs, type PoseFrame } from './poseSpec';
import { frameProps } from './props';
import { solvePose } from './solvePose';
import { syntheticSkeleton } from './synthetic';
import { STAND, stand } from './testing/frames';
import { poseTop, validatePose } from './validatePose';

const sk = syntheticSkeleton();

function check(frame: PoseFrame, spec: SceneSpec = {}, ctx: { ceilingCm?: number; statureCm?: number } = {}) {
  const scene = buildScene(spec);
  const sol = solvePose(sk, frame, { statureCm: ctx.statureCm ?? 175, scene, railZCm: spec.trainer ? ILLUSTRATIVE_SCENE.trainer.railZCm : undefined });
  const props = frameProps(frame, sol, ILLUSTRATIVE_SCENE);
  return { findings: validatePose(sk, frame, sol, props, { scene, params: ILLUSTRATIVE_SCENE, ceilingCm: ctx.ceilingCm }), sol, props };
}
const checks = (frame: PoseFrame, spec?: SceneSpec, ctx?: { ceilingCm?: number }) => check(frame, spec, ctx).findings.filter((f) => f.severity === 'error').map((f) => f.check);

describe('validatePose: every validator passes a good pose and catches a bad one (spec §8.1, §14)', () => {
  it('passes the standing frame', () => {
    expect(check(STAND).findings).toEqual([]);
  });
  it('anchor: a hand that cannot reach its grip', () => {
    expect(checks(stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [0, -90, 0] }, contact: true }) }))).toContain('anchor');
  });
  it('anchor: a foot that cannot reach the floor', () => {
    expect(checks(stand({ trunk: { hips: { bodyCm: [0, 99, 0] } } }))).toContain('anchor');
  });
  it('feet-flat: a flat foot with its heel up', () => {
    expect(checks(stand({ legs: bothLegs({ ...STAND.legs.l, sole: [0, -0.8, -0.6], toes: [0, -0.6, 0.8] }) }))).toContain('feet-flat');
  });
  it('anchor: a declared body contact that does not touch', () => {
    expect(checks(stand({ contacts: [{ part: 'pelvis', on: 'floor' }] }))).toEqual(['anchor']);
  });
  it('rom: a wrist bent past its limit', () => {
    const bent = bothArms({ ...STAND.arms.l, hand: { grip: 'free', palm: [0, 0, 1], fingers: [0, 1, 0] } });
    expect(checks(stand({ arms: bent }))).toContain('rom');
  });
  it('floor: a body placed through the floor', () => {
    const low = stand({ trunk: { hips: { bodyCm: [0, 5, 0] }, pitchDeg: -90 }, legs: bothLegs({ ...STAND.legs.l, contact: 'none', to: { from: 'body.hips', bodyCm: [10, 0, 80] } }) });
    expect(checks(low)).toContain('floor');
  });
  it('hang-clearance: a hanging frame with the feet on the floor', () => {
    expect(checks(stand({ hanging: true }))).toEqual(['hang-clearance']);
  });
  describe('the Smith bar (standing behind the rail, bar at shoulder height)', () => {
    const grip = bothArms({ to: { hold: 'smith-bar', alongCm: 30 }, elbow: [0.3, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
    const press = stand({ trunk: { hips: { bodyCm: [0, 89.5, -20] } }, arms: grip, props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 10, 0] } } });
    it('passes a bar on its rails within the stops', () => {
      expect(checks(press, { trainer: {} })).toEqual([]);
    });
    it('bench-rack: a bench through an upright', () => {
      expect(checks(press, { trainer: {}, bench: { at: [58, 0, 40], angleDeg: 0 } })).toContain('bench-rack');
    });
    it('bar-travel: a bar above its highest stop', () => {
      const high = { ...ILLUSTRATIVE_SCENE.trainer, highestBarHeightCm: 140 };
      const scene = buildScene({ trainer: {} }, { ...ILLUSTRATIVE_SCENE, trainer: high });
      const sol = solvePose(sk, press, { statureCm: 175, scene, railZCm: 0 });
      expect(validatePose(sk, press, sol, [], { scene, params: { ...ILLUSTRATIVE_SCENE, trainer: high } }).map((x) => x.check)).toEqual(['bar-travel']);
    });
    it('bar-travel: a bar below the safety catches it is drawn with (spec §12: no bypassed stop)', () => {
      expect(checks(press, { trainer: { catchHeightCm: 100 } })).toEqual([]);
      expect(checks(press, { trainer: { catchHeightCm: 170 } })).toEqual(['bar-travel']);
    });
    it('rom: a pressing wrist bent back about 45° (elbows flared wide of a narrow grip)', () => {
      const flared = bothArms({ to: { hold: 'smith-bar', alongCm: 20 }, elbow: [1, -1, 0], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
      const { findings } = check({ ...press, arms: flared }, { trainer: {} });
      expect(findings.map((f) => f.message)).toEqual([expect.stringMatching(/^wrist_l bent 4\d° exceeds 25°/), expect.stringMatching(/^wrist_r bent 4\d° exceeds 25°/)]);
    });
  });
  it('rom: the authored spine and neck stay within their limits', () => {
    expect(checks(stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, spine: { flexDeg: 44, twistDeg: -29 }, head: { flexDeg: 44, turnDeg: 59 } } }))).toEqual([]);
    const bent = checks(stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, spine: { flexDeg: 50, sideDeg: 25 }, head: { flexDeg: -35, turnDeg: 70 } } }));
    expect(bent.filter((c) => c === 'rom')).toHaveLength(4);
  });
  it('implement: a held dumbbell inside the body is an error, touching it a warning, a declared touch neither', () => {
    const scene = buildScene({});
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    // A 5 cm dumbbell head beside the thigh (capsule radius 7.5 cm): `dx` from the thigh's axis.
    const thigh = lerp(sol.world.thigh_l!.position, sol.world.calf_l!.position, 0.4);
    const head = (dx: number) => [sphere('dumbbell-l-head-a', [thigh[0] + dx, thigh[1], thigh[2]], 5, 'rubber')];
    const run = (frame: PoseFrame, dx: number) => validatePose(sk, frame, sol, head(dx), { scene, params: ILLUSTRATIVE_SCENE }).map((f) => `${f.severity} ${f.check}`);
    expect(run(STAND, 6)).toEqual(['error implement']);
    expect(run(STAND, 9.5)).toEqual(['warn body-overlap']);
    expect(run(STAND, 14)).toEqual([]);
    expect(run(stand({ touches: [{ part: 'thigh_l', prop: 'dumbbell-l' }] }), 0)).toEqual([]);
  });
  it('a loose contact is not measured, only excused from the overlap warning', () => {
    expect(checks(stand({ contacts: [{ part: 'pelvis', on: 'floor', loose: true }] }))).toEqual([]);
  });
  it('implement: a dumbbell through the floor or the equipment', () => {
    const scene = buildScene({ bench: { at: [0, 0, 120], angleDeg: 0 } });
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const run = (props: ReturnType<typeof buildDumbbell>) => [...new Set(validatePose(sk, STAND, sol, props, { scene, params: ILLUSTRATIVE_SCENE }).map((f) => f.check))];
    expect(run(buildDumbbell('dumbbell-l', [0, 3, 60], [1, 0, 0]))).toEqual(['implement']);
    expect(run(buildDumbbell('dumbbell-l', [0, 40, 135], [1, 0, 0]))).toEqual(['implement']);
    expect(run(buildDumbbell('dumbbell-l', [0, 80, 60], [1, 0, 0]))).toEqual([]);
  });
  it('ceiling: only when a ceiling is given', () => {
    expect(checks(STAND, {}, { ceilingCm: 175 })).toEqual(['ceiling']);
    expect(checks(STAND, {}, { ceilingCm: 244 })).toEqual([]);
  });
  it('body-overlap (warn): standing inside a bench', () => {
    const { findings } = check(STAND, { bench: { at: [0, 0, -10], angleDeg: 0 } });
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.some((f) => f.check === 'body-overlap' && f.severity === 'warn')).toBe(true);
  });
});

describe('body proxies', () => {
  it('reports the highest point of body and implements', () => {
    const { sol, props } = check(stand({ props: { dumbbells: ['l'] } }));
    expect(poseTop(sk, sol, props)).toBeCloseTo(175 - 1.5, 0); // hips 1.5 cm below rest
  });
  it('measures a lying-along contact by its worse end', () => {
    const { sol } = check(STAND);
    const shank = bodyCapsules(sk, sol.world, 1, 1).find((c) => c.part === 'shank_l')!;
    const floor = buildScene({}).surfaces.floor!;
    expect(contactGap(shank, floor)).toBeCloseTo(capsuleGap(shank, floor));
    expect(contactGap(shank, floor, true)).toBeGreaterThan(30);
  });
});
