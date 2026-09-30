import { describe, expect, it } from 'vitest';
import { buildDumbbell } from '../geometry/implements';
import { buildScene, ILLUSTRATIVE_SCENE, type SceneSpec } from '../geometry/scene';
import { bodyCapsules, capsuleGap, contactGap, footPoints, TOE_LENGTH_CM } from './body';
import { type Vec3, add, cross, distance, lerp, normalize, scale, sub } from '../math/vec3';
import { conjugate, degToRad, fromAxisAngle, rotate } from '../math/quat';
import { cyl, sphere } from '../geometry/built';
import { signedDistance } from '../geometry/primitives';
import { bothArms, bothLegs, type HandPose, type PoseFrame } from './poseSpec';
import { frameProps } from './props';
import { restPose } from './skeleton';
import { solvePose } from './solvePose';
import { syntheticSkeleton } from './synthetic';
import { STAND, stand } from './testing/frames';
import { HANG_CLEARANCE_CM, poseTop, validatePose } from './validatePose';

const sk = syntheticSkeleton();

function check(frame: PoseFrame, spec: SceneSpec = {}, ctx: { ceilingCm?: number; clearanceMarginCm?: number; statureCm?: number } = {}) {
  const scene = buildScene(spec);
  const sol = solvePose(sk, frame, { statureCm: ctx.statureCm ?? 175, scene, railZCm: spec.trainer ? ILLUSTRATIVE_SCENE.trainer.railZCm : undefined });
  const props = frameProps(frame, sol, ILLUSTRATIVE_SCENE);
  return { findings: validatePose(sk, frame, sol, props, { scene, params: ILLUSTRATIVE_SCENE, ceilingCm: ctx.ceilingCm, clearanceMarginCm: ctx.clearanceMarginCm }), sol, props };
}
const checks = (frame: PoseFrame, spec?: SceneSpec, ctx?: { ceilingCm?: number; clearanceMarginCm?: number }) => check(frame, spec, ctx).findings.filter((f) => f.severity === 'error').map((f) => f.check);

describe('validatePose: every validator passes a good pose and catches a bad one (spec §8.1, §14)', () => {
  it('passes the standing frame', () => {
    expect(check(STAND).findings).toEqual([]);
  });
  it('anchor: a hand that cannot reach its grip', () => {
    const { findings } = check(stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [0, -90, 0] }, contact: true }) }));
    expect(findings.filter((f) => f.check === 'anchor').map((f) => f.message)).toEqual([expect.stringMatching(/^hand_l is \d+\.\d cm from its grip$/), expect.stringMatching(/^hand_r is /)]);
  });
  it('anchor: a foot that cannot reach the floor', () => {
    const { findings } = check(stand({ trunk: { hips: { bodyCm: [0, 99, 0] } } }));
    expect(findings.filter((f) => f.check === 'anchor').map((f) => f.message)).toEqual([expect.stringMatching(/^foot_l is \d+\.\d cm from its target$/), expect.stringMatching(/^foot_r is /)]);
  });
  it('feet-flat: a flat foot with its heel up', () => {
    expect(checks(stand({ legs: bothLegs({ ...STAND.legs.l, sole: [0, -0.8, -0.6], toes: [0, -0.6, 0.8] }) }))).toContain('feet-flat');
  });
  it('feet-flat: the heel within 1 cm of its surface, like every contact', () => {
    // Heel raised by tilting the foot about the ball: the heel point is 19 cm behind it.
    const tilted = (deg: number) => {
      const a = degToRad(deg);
      return stand({ legs: bothLegs({ ...STAND.legs.l, sole: [0, -Math.cos(a), -Math.sin(a)], toes: [0, -Math.sin(a), Math.cos(a)] }) });
    };
    expect(check(tilted(2.4)).findings).toEqual([]);
    expect(check(tilted(3.6)).findings.map((f) => `${f.check} ${f.message}`)).toEqual(['feet-flat heel_l is 1.2 cm off its surface', 'feet-flat heel_r is 1.2 cm off its surface']);
  });
  it('anchor: a declared body contact that does not touch', () => {
    expect(checks(stand({ contacts: [{ part: 'pelvis', on: 'floor' }] }))).toEqual(['anchor']);
  });
  it('rom: a wrist bent past its limit', () => {
    const bent = bothArms({ ...STAND.arms.l, hand: { grip: 'free', palm: [0, 0, 1], fingers: [0, 1, 0] } });
    const { findings } = check(stand({ arms: bent }));
    expect(findings.filter((f) => f.message.startsWith('wrist_')).map((f) => f.message)).toEqual([
      expect.stringMatching(/^wrist_l bent \d+° exceeds 30°$/),
      expect.stringMatching(/^wrist_r bent \d+° exceeds 30°$/),
    ]);
  });
  it('floor: a body placed through the floor', () => {
    const low = stand({ trunk: { hips: { bodyCm: [0, 5, 0] }, pitchDeg: -90 }, legs: bothLegs({ ...STAND.legs.l, contact: 'none', to: { from: 'body.hips', bodyCm: [10, 0, 80] } }) });
    expect(checks(low)).toContain('floor');
  });
  it('bone-length: a bone stretched after solving', () => {
    const { sol, props } = check(STAND);
    const w = sol.world;
    const stretched = { ...sol, world: { ...w, ball_l: { ...w.ball_l!, position: add(w.ball_l!.position, [0, 0, 2]) } } };
    const findings = validatePose(sk, STAND, stretched, props, { scene: buildScene({}), params: ILLUSTRATIVE_SCENE });
    expect(findings.map((f) => `${f.check} ${f.message}`)).toEqual([expect.stringMatching(/^bone-length ball_l length changed by \d\.\d\d cm$/)]);
  });
  it('hang-clearance: a hanging frame with the feet on the floor', () => {
    expect(checks(stand({ hanging: true }))).toEqual(['hang-clearance']);
  });
  describe('the toes count for the floor and the hanging clearance (review I-2)', () => {
    // Feet pointed 35° down under a lifted body (within the ankle's range): the ball of the foot is about 14 cm
    // below the ankle, the toe tip about 4 cm below that.
    const down = degToRad(35);
    const pointed = (ankleCm: number, hanging = true) =>
      stand({
        hanging,
        trunk: { hips: { bodyCm: [0, ankleCm + 80, 0] } },
        legs: bothLegs({ to: { bodyCm: [10, ankleCm, 4] }, knee: [0, 0, 1], sole: [0, -Math.cos(down), -Math.sin(down)], toes: [0, -Math.sin(down), Math.cos(down)], contact: 'none' }),
      });
    it('passes a hanging body whose toes clear the floor', () => {
      expect(check(pointed(32)).findings).toEqual([]);
    });
    it('hang-clearance: pointed toes within 2 cm of the floor, though the ball of the foot clears it', () => {
      const { findings, sol } = check(pointed(19));
      for (const side of ['l', 'r'] as const) expect(footPoints(sk, sol.world, side, sol.scaleFactor, sol.k).ball[1]).toBeGreaterThan(HANG_CLEARANCE_CM + 2);
      expect(findings.map((f) => `${f.check} ${f.message}`)).toEqual([expect.stringMatching(/^hang-clearance hanging, foot_[lr] is only [01]\.\d cm above the floor$/)]);
    });
    it('floor: pointed toes through the floor, though the ball of the foot is above it', () => {
      const { findings, sol } = check(pointed(16.6, false));
      expect(footPoints(sk, sol.world, 'l', sol.scaleFactor, sol.k).ball[1]).toBeGreaterThan(2);
      expect(findings.map((f) => `${f.check} ${f.message}`)).toEqual([expect.stringMatching(/^floor foot_[lr] reaches \d\.\d cm below the floor$/)]);
    });
  });
  it('anchor: a measured body contact passes within 1 cm; one lying along its surface must touch at both ends', () => {
    expect(checks(stand({ contacts: [{ part: 'foot_l', on: 'floor', along: true }] }))).toEqual([]);
    // On the balls of the feet: the foot touches the floor at the ball only.
    const tiptoe = stand({ trunk: { hips: { bodyCm: [0, 95, 0] } }, legs: bothLegs({ ...STAND.legs.l, contact: 'ball', sole: [0, -0.8, -0.6], toes: [0, -0.6, 0.8] }) });
    expect(checks({ ...tiptoe, contacts: [{ part: 'foot_l', on: 'floor' }] })).toEqual([]);
    expect(checks({ ...tiptoe, contacts: [{ part: 'foot_l', on: 'floor', along: true }] })).toEqual(['anchor']);
  });
  describe('the wrist limit follows the grip: 30° held, 25° pressing, 85° flat (controller decision 5)', () => {
    const scene = buildScene({});
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const rest = restPose(sk, 1);
    /** `sol` with the left hand turned exactly `deg` from its rest direction, in the forearm's frame. */
    function bent(deg: number) {
      const w = sol.world;
      const restDir = rotate(conjugate(rest.lowerarm_l!.rotation), sub(rest.middle_01_l!.position, rest.hand_l!.position));
      const dir = normalize(rotate(w.lowerarm_l!.rotation, restDir));
      const turn = fromAxisAngle(normalize(cross(dir, [0, 0, 1])), degToRad(deg));
      const len = distance(w.middle_01_l!.position, w.hand_l!.position);
      return { ...sol, world: { ...w, middle_01_l: { ...w.middle_01_l!, position: add(w.hand_l!.position, scale(rotate(turn, dir), len)) } } };
    }
    const wrist = (hand: HandPose, deg: number) =>
      validatePose(sk, stand({ arms: { ...STAND.arms, l: { ...STAND.arms.l, hand } } }), bent(deg), [], { scene, params: ILLUSTRATIVE_SCENE })
        .map((f) => f.message)
        .filter((m) => m.startsWith('wrist_'));
    it('a hand holding a bar or nothing: 30° (a bend the pressing limit fails passes, one the flat limit passes fails)', () => {
      for (const hand of [STAND.arms.l.hand, { grip: 'free', palm: [0, 0, 1] } as const]) {
        expect(wrist(hand, 28)).toEqual([]);
        expect(wrist(hand, 32)).toEqual(['wrist_l bent 32° exceeds 30°']);
      }
    });
    it('a pressing hand: 25° (a bend the held limit passes fails)', () => {
      const press: HandPose = { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' };
      expect(wrist(press, 23)).toEqual([]);
      expect(wrist(press, 27)).toEqual(['wrist_l bent 27° exceeds 25°']);
    });
    it('a flat hand: 85° (a bend the held limit fails passes)', () => {
      const flat: HandPose = { grip: 'flat', palm: [0, -1, 0], fingers: [0, 0, 1] };
      expect(wrist(flat, 60)).toEqual([]);
      expect(wrist(flat, 87)).toEqual(['wrist_l bent 87° exceeds 85°']);
    });
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
    it('bench-rack: passes a bench between the uprights, under the bar', () => {
      expect(checks(press, { trainer: {}, bench: { at: [0, 0, 40], angleDeg: 0 } })).toEqual([]);
    });
    it('bar-on-rail: hands that hold the bar off centre', () => {
      const uneven = { l: grip.l, r: { ...grip.r, to: { hold: 'smith-bar' as const, alongCm: -26 } } };
      const { findings } = check({ ...press, arms: uneven }, { trainer: {} });
      expect(findings.map((f) => `${f.check} ${f.message}`)).toEqual([expect.stringMatching(/^bar-on-rail the hands hold the bar 0\.0 cm off the rail and 2\.0 cm off centre$/)]);
    });
    it('bar-on-rail: a bar solved on a rail 2 cm from the one the scene draws', () => {
      const scene = buildScene({ trainer: {} });
      const sol = solvePose(sk, press, { statureCm: 175, scene, railZCm: 2 });
      expect(validatePose(sk, press, sol, [], { scene, params: ILLUSTRATIVE_SCENE }).map((f) => f.check)).toEqual(['bar-on-rail']);
    });
    it('bar-travel: a bar below its lowest stop', () => {
      const low = { ...ILLUSTRATIVE_SCENE.trainer, lowestBarHeightCm: 170 };
      const scene = buildScene({ trainer: {} }, { ...ILLUSTRATIVE_SCENE, trainer: low });
      const sol = solvePose(sk, press, { statureCm: 175, scene, railZCm: 0 });
      expect(validatePose(sk, press, sol, [], { scene, params: { ...ILLUSTRATIVE_SCENE, trainer: low } }).map((x) => x.check)).toEqual(['bar-travel']);
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
    const other = check(stand({ trunk: { hips: { bodyCm: [0, 89.5, 0] }, spine: { flexDeg: -11, sideDeg: -21, twistDeg: 31 }, head: { turnDeg: -61 } } }));
    expect(other.findings.filter((f) => f.severity === 'error').map((f) => f.message)).toEqual([
      'spineFlex at -11° is outside -10…45°',
      'spineSide at -21° is outside -20…20°',
      'spineTwist at 31° is outside -30…30°',
      'headTurn at -61° is outside -60…60°',
    ]);
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
  it('implement: hands and forearms hold implements, so only the other parts are checked against them', () => {
    const scene = buildScene({});
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const w = sol.world;
    const between = (a: string, b: string) => [sphere('dumbbell-l-head-a', lerp(w[a]!.position, w[b]!.position, 0.5), 2.5, 'rubber')];
    const run = (props: ReturnType<typeof between>) => validatePose(sk, STAND, sol, props, { scene, params: ILLUSTRATIVE_SCENE }).map((f) => f.check);
    expect(run(between('hand_l', 'middle_01_l'))).toEqual([]);
    expect(run(between('lowerarm_l', 'hand_l'))).toEqual([]);
    expect(run(between('upperarm_l', 'lowerarm_l'))).toEqual(['implement']);
  });
  it('body-overlap: a thin handle across the thigh is measured where it crosses, not only at sparse samples', () => {
    const scene = buildScene({});
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const thigh = bodyCapsules(sk, sol.world, sol.scaleFactor, sol.k).find((c) => c.part === 'thigh_l')!;
    // A 1.4 cm handle across the thigh, its axis 6 cm in front of the thigh's (radius 7.5 cm): about 2.9 cm deep (the thigh leans a little).
    const at = add(lerp(thigh.a, thigh.b, 7 / 12), [0, 0, 6]);
    const handle = [cyl('dumbbell-l-handle', add(at, [-5, 0, 0]), add(at, [5, 0, 0]), 1.4, 'grip')];
    const findings = validatePose(sk, STAND, sol, handle, { scene, params: ILLUSTRATIVE_SCENE });
    expect(findings.map((f) => `${f.severity} ${f.message}`)).toEqual([expect.stringMatching(/^warn thigh_l sinks (2\.9|3\.0) cm into dumbbell-l-handle$/)]);
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
  it('implement: a Smith rail through a dumbbell, wherever it pierces it (review I-3)', () => {
    const scene = buildScene({ trainer: {} });
    const sol = solvePose(sk, STAND, { statureCm: 175, scene });
    const rail = scene.prims.find((p) => p.id === 'rail-left')!;
    const onRail: Vec3 = rail.kind === 'cylinder' ? [rail.start[0], 100, rail.start[2]] : [0, 0, 0];
    const missed: string[] = [];
    let pierced = 0;
    for (const axis of [[1, 0, 0], [0, 0, 1], [0.6, 0.8, 0]] as const) {
      for (let dx = -16; dx <= 16; dx += 0.5) {
        for (let dz = -16; dz <= 16; dz += 0.5) {
          const dumbbell = buildDumbbell('dumbbell-l', add(onRail, [dx, 0, dz]), axis);
          // Only placements where the rail's axis lies at least 2 cm inside the dumbbell.
          if (Math.min(...dumbbell.map((p) => signedDistance(p, onRail))) > -2) continue;
          pierced++;
          const findings = validatePose(sk, STAND, sol, dumbbell, { scene, params: ILLUSTRATIVE_SCENE });
          if (!findings.some((f) => f.check === 'implement' && f.message.endsWith('intersects rail-left'))) missed.push(`${axis.join(',')} ${dx},${dz}`);
        }
      }
    }
    expect(pierced).toBeGreaterThan(300);
    expect(missed).toEqual([]);
  });
  it('ceiling: only when a ceiling is given', () => {
    expect(checks(STAND, {}, { ceilingCm: 175 })).toEqual(['ceiling']);
    expect(checks(STAND, {}, { ceilingCm: 244 })).toEqual([]);
  });
  it('ceiling: keeps the clearance margin (10 cm unless given)', () => {
    const { sol, props } = check(STAND);
    const top = poseTop(sk, sol, props);
    expect(checks(STAND, {}, { ceilingCm: top + 9.9 })).toEqual(['ceiling']);
    expect(checks(STAND, {}, { ceilingCm: top + 10.1 })).toEqual([]);
    expect(checks(STAND, {}, { ceilingCm: top + 4.9, clearanceMarginCm: 5 })).toEqual(['ceiling']);
    expect(checks(STAND, {}, { ceilingCm: top + 5.1, clearanceMarginCm: 5 })).toEqual([]);
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
  it('puts the toe tip TOE_LENGTH_CM (stature-scaled) past the ball of the foot, along the toes', () => {
    for (const statureCm of [175, 200]) {
      const { sol } = check(STAND, {}, { statureCm });
      const { ball, toe } = footPoints(sk, sol.world, 'l', sol.scaleFactor, sol.k);
      expect(distance(ball, toe)).toBeCloseTo(TOE_LENGTH_CM * (statureCm / 175), 6);
      expect(toe[1]).toBeCloseTo(0, 6);
      expect(toe[2] - ball[2]).toBeGreaterThan(6);
    }
  });
  it('measures a lying-along contact by its worse end', () => {
    const { sol } = check(STAND);
    const shank = bodyCapsules(sk, sol.world, 1, 1).find((c) => c.part === 'shank_l')!;
    const floor = buildScene({}).surfaces.floor!;
    expect(contactGap(shank, floor)).toBeCloseTo(capsuleGap(shank, floor));
    expect(contactGap(shank, floor, true)).toBeGreaterThan(30);
  });
});
