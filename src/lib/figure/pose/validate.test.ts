import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, X_AXIS } from '../math/vec3';
import { degToRad } from '../math/quat';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { PoseBuilder } from './builder';
import { restPose } from './skeleton';
import { solveSmithSquat } from './smithSquat';
import { syntheticSkeleton } from './synthetic';
import { jointAngles, ROM_LIMITS, romFindings, validateSmithSquat } from './validate';

const SEEDS = [undefined, 2, 11];
const SCALE = 1.3;

/** A builder at rest, with `bone` turned about a world axis through its head. */
function turned(seed: number | undefined, bone: string, axis: Vec3, deg: number) {
  const b = new PoseBuilder(syntheticSkeleton({ randomRestSeed: seed }), SCALE);
  b.rotateWorld(bone, axis, degToRad(deg));
  return b;
}

describe('jointAngles', () => {
  it('reads a near-straight rest pose, and zero ankle dorsiflexion at rest by definition', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const a = jointAngles(sk, restPose(sk, SCALE), 'l');
      for (const k of ['elbowFlexDeg', 'kneeFlexDeg'] as const) {
        expect(a[k], k).toBeGreaterThan(0);
        expect(a[k], k).toBeLessThan(5);
      }
      // The synthetic trunk line (pelvis → spine_03) leans back 3.6°, so the hanging thigh sits 2.9° behind it.
      expect(a.hipFlexDeg).toBeCloseTo(-2.88, 2);
      expect(a.ankleDorsiflexDeg).toBeCloseTo(0, 9);
    }
  });

  it('signs the knee: heel toward the seat is flexion, foot swung forward past straight is hyperextension', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const rest = jointAngles(sk, restPose(sk, SCALE), 'l').kneeFlexDeg;
      // +X is the figure's left; turning about it by a positive angle swings a hanging segment backward.
      expect(jointAngles(sk, turned(seed, 'calf_l', X_AXIS, 30).world(), 'l').kneeFlexDeg).toBeCloseTo(rest + 30, 6);
      expect(jointAngles(sk, turned(seed, 'calf_l', X_AXIS, -20).world(), 'l').kneeFlexDeg).toBeCloseTo(rest - 20, 6);
      expect(jointAngles(sk, turned(seed, 'calf_r', X_AXIS, -20).world(), 'r').kneeFlexDeg).toBeCloseTo(rest - 20, 6);
    }
  });

  it('signs the elbow: forearm forward is flexion, backward past straight is hyperextension', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const rest = jointAngles(sk, restPose(sk, SCALE), 'l').elbowFlexDeg;
      expect(jointAngles(sk, turned(seed, 'lowerarm_l', X_AXIS, -40).world(), 'l').elbowFlexDeg).toBeGreaterThan(rest + 35);
      expect(jointAngles(sk, turned(seed, 'lowerarm_l', X_AXIS, 20).world(), 'l').elbowFlexDeg).toBeLessThan(-15);
      expect(jointAngles(sk, turned(seed, 'lowerarm_r', X_AXIS, 20).world(), 'r').elbowFlexDeg).toBeLessThan(-15);
    }
  });

  it('signs the hip: thigh forward is flexion, thigh behind the trunk is extension (negative)', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const rest = jointAngles(sk, restPose(sk, SCALE), 'l').hipFlexDeg;
      expect(jointAngles(sk, turned(seed, 'thigh_l', X_AXIS, -40).world(), 'l').hipFlexDeg).toBeCloseTo(rest + 40, 6);
      // The old unsigned metric read this extension as +33° of flexion.
      expect(jointAngles(sk, turned(seed, 'thigh_l', X_AXIS, 30).world(), 'l').hipFlexDeg).toBeCloseTo(rest - 30, 6);
    }
  });

  it('measures the ankle between shank and foot, not the shank against vertical', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      // Toes up 15°: dorsiflexion. Toes down 15°: plantarflexion (negative).
      expect(jointAngles(sk, turned(seed, 'foot_l', X_AXIS, -15).world(), 'l').ankleDorsiflexDeg).toBeCloseTo(15, 6);
      expect(jointAngles(sk, turned(seed, 'foot_l', X_AXIS, 15).world(), 'l').ankleDorsiflexDeg).toBeCloseTo(-15, 6);
      // Shank and foot tilted together: the ankle has not moved, though the shank is 25° off vertical.
      expect(jointAngles(sk, turned(seed, 'calf_l', X_AXIS, -25).world(), 'l').ankleDorsiflexDeg).toBeCloseTo(0, 6);
    }
  });
});

describe('twoBoneIK bendSide makes the elbow a true hinge', () => {
  it('reads the same bend as flexion once the humerus is rolled, and as the wrong way without the roll', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const solve = (bendSide?: Vec3) => {
        const b = new PoseBuilder(sk, 1);
        const wrist = add(b.world().upperarm_l!.position, [24, 0, -12]);
        b.twoBoneIK('upperarm_l', 'lowerarm_l', 'hand_l', wrist, [0.6, -1, -0.6], bendSide ? { bendSide } : {});
        return b.world();
      };
      const [plain, hinged] = [solve(), solve([0, 0, 1])];
      for (const bone of ['lowerarm_l', 'hand_l']) expect(distance(plain[bone]!.position, hinged[bone]!.position)).toBeLessThan(1e-9);
      const [a, b] = [jointAngles(sk, plain, 'l').elbowFlexDeg, jointAngles(sk, hinged, 'l').elbowFlexDeg];
      expect(a).toBeLessThan(-90);
      expect(b).toBeCloseTo(-a, 6);
    }
  });
});

describe('ROM checks', () => {
  it('has a lower bound for every joint (hyperextension, hip extension, plantarflexion)', () => {
    for (const [k, { min, max }] of Object.entries(ROM_LIMITS)) {
      expect(min, k).toBeLessThanOrEqual(0);
      expect(max, k).toBeGreaterThan(0);
    }
  });

  it('flags a hyperextended knee and elbow on a synthetic pose, and passes the rest pose', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      expect(romFindings(sk, restPose(sk, SCALE))).toEqual([]);
      const knee = romFindings(sk, turned(seed, 'calf_l', X_AXIS, -15).world());
      expect(knee.map((f) => f.check)).toEqual(['rom']);
      expect(knee[0]!.message).toMatch(/knee.*_l.*hyperextension/);
      const elbow = romFindings(sk, turned(seed, 'lowerarm_r', X_AXIS, 15).world());
      expect(elbow.map((f) => f.check)).toEqual(['rom']);
      expect(elbow[0]!.message).toMatch(/elbow.*_r.*hyperextension/);
    }
  });

  it('validateSmithSquat reports a knee bent the wrong way in a solved frame', () => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[0]!, { statureCm: 175, railZCm: ILLUSTRATIVE_SMITH.railZCm });
    const b = new PoseBuilder(sk, sol.scaleFactor);
    Object.assign(b.local, sol.local);
    b.rootPosition = sol.rootPosition;
    const knee = sol.world.calf_l!.position;
    // Swing the lower leg forward about the knee's own hinge (the thigh's left-right axis) well past straight.
    b.rotateWorld('calf_l', X_AXIS, degToRad(-25));
    expect(b.world().calf_l!.position).toEqual(knee);
    const rom = validateSmithSquat(sk, { ...sol, local: { ...b.local }, world: b.world() }, {
      smith: ILLUSTRATIVE_SMITH,
      barRestOffsetCm: SMITH_SQUAT.barRestOffsetCm,
    }).filter((f) => f.check === 'rom');
    expect(rom.map((f) => f.message)).toEqual([expect.stringMatching(/knee.*_l.*hyperextension/)]);
  });

  it('the Smith squat checks elbow magnitude only, because its solver leaves the humerus unrolled (known limitation)', () => {
    // If this starts failing, the solver now rolls the humerus: drop `signedElbow: false` in validateSmithSquat.
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(sk, SMITH_SQUAT, frame, { statureCm: 175, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      expect(jointAngles(sk, sol.world, 'l').elbowFlexDeg, frame.id).toBeLessThan(-90);
      expect(romFindings(sk, sol.world).map((f) => f.message)).toContain(`elbowFlex_l at ${jointAngles(sk, sol.world, 'l').elbowFlexDeg.toFixed(0)}° is past the -5° limit (hyperextension)`);
      expect(romFindings(sk, sol.world, { signedElbow: false })).toEqual([]);
    }
  });

  it('with signedElbow off, an over-bent elbow is still flagged', () => {
    for (const seed of SEEDS) {
      const sk = syntheticSkeleton({ randomRestSeed: seed });
      const w = turned(seed, 'lowerarm_l', X_AXIS, -160).world();
      expect(romFindings(sk, w, { signedElbow: false }).map((f) => f.message)).toEqual([expect.stringMatching(/elbowFlex_l at 1[56]\d° exceeds 145°/)]);
    }
  });
});
