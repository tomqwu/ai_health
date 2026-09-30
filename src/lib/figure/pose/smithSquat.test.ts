import { describe, expect, it } from 'vitest';
import { add, distance, scale, sub } from '../math/vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, multiply } from '../math/quat';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { syntheticSkeleton } from './synthetic';
import { forwardKinematics, restPose } from './skeleton';
import { solveSmithSquat } from './smithSquat';
import { carriedBarCenter, jointAngles, validateSmithSquat } from './validate';

const STATURES = [150, 165, 175, 190, 200];
const BAR = SMITH_SQUAT.barRestOffsetCm;

describe('solveSmithSquat', () => {
  it.each(STATURES)('produces valid frames at %i cm', (statureCm) => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(sk, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      const findings = validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: BAR });
      expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
    }
  });

  it('is independent of the rig rest-rotation convention', () => {
    const f = SMITH_SQUAT.frames[1]!;
    const a = solveSmithSquat(syntheticSkeleton(), SMITH_SQUAT, f, { statureCm: 190, railZCm: 0 });
    const b = solveSmithSquat(syntheticSkeleton({ randomRestSeed: 9 }), SMITH_SQUAT, f, { statureCm: 190, railZCm: 0 });
    for (const name of Object.keys(a.world)) expect(distance(a.world[name]!.position, b.world[name]!.position)).toBeLessThan(1e-6);
  });

  it('squats deeper and leans more at the bottom than at the top', () => {
    const sk = syntheticSkeleton();
    const [top, bottom] = [0, 1].map((i) => solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[i]!, { statureCm: 190, railZCm: 0 }));
    expect(bottom!.barCenter[1]).toBeLessThan(top!.barCenter[1] - 30);
    expect(bottom!.trunkDeg).toBeGreaterThan(top!.trunkDeg + 15);
    const a = jointAngles(bottom!.world, 'l');
    expect(a.kneeFlexDeg).toBeGreaterThan(90);
    expect(a.hipFlexDeg).toBeGreaterThan(90);
  });

  it('throws when no trunk angle can reach the rail', () => {
    const far = { ...SMITH_SQUAT, stance: { ...SMITH_SQUAT.stance, forwardOfRailCm: 150 } };
    expect(() => solveSmithSquat(syntheticSkeleton(), far, SMITH_SQUAT.frames[0]!, { statureCm: 175, railZCm: 0 })).toThrow(
      /no trunk angle/,
    );
  });
});

describe('validateSmithSquat catches problems', () => {
  const sk = syntheticSkeleton();
  it('flags a narrow grip that over-bends the elbows', () => {
    const narrow = { ...SMITH_SQUAT, grip: { ...SMITH_SQUAT.grip, halfWidthCm: 20 } };
    const sol = solveSmithSquat(sk, narrow, SMITH_SQUAT.frames[0]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: BAR }).map((f) => f.check)).toContain('rom');
  });
  it('flags a bottom position below the lower stop', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: { ...ILLUSTRATIVE_SMITH, lowestBarHeightCm: 150 }, barRestOffsetCm: BAR }).map((f) => f.check)).toContain('bar-travel');
  });
  it('flags a low ceiling and passes a normal one', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[0]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: BAR, ceilingCm: 195 }).map((f) => f.check)).toContain('ceiling');
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: BAR, ceilingCm: 244 })).toEqual([]);
  });

  describe('every validator can fire', () => {
    const solve = (i: number) => solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[i]!, { statureCm: 190, railZCm: ILLUSTRATIVE_SMITH.railZCm });
    const checks = (sol: ReturnType<typeof solve>, smith = ILLUSTRATIVE_SMITH) =>
      validateSmithSquat(sk, sol, { smith, barRestOffsetCm: BAR }).map((f) => f.check);

    it('carriedBarCenter reproduces the solved bar', () => {
      const sol = solve(1);
      expect(distance(carriedBarCenter(sk, sol, BAR), sol.barCenter)).toBeLessThan(1e-6);
    });
    it('flags a torso misplaced off the rail (bar-on-rail)', () => {
      const sol = solve(1);
      const shifted = add(sol.rootPosition, [0, 0, 3]);
      const world = forwardKinematics(sk, { local: sol.local, rootPosition: shifted }, sol.scaleFactor);
      expect(checks({ ...sol, rootPosition: shifted, world })).toContain('bar-on-rail');
    });
    it('flags a hand off its target (anchor)', () => {
      const sol = solve(1);
      const targets = { ...sol.targets, hand_l: add(sol.targets.hand_l, [0, 5, 0]) };
      expect(checks({ ...sol, targets })).toContain('anchor');
    });
    it('flags a lifted foot (feet-flat)', () => {
      const sol = solve(1);
      const ball = sol.world.ball_l!;
      const world = { ...sol.world, ball_l: { ...ball, position: add(ball.position, [0, 3, 0]) } };
      expect(checks({ ...sol, world })).toContain('feet-flat');
    });
    it('flags a stretched forearm (bone-length)', () => {
      const sol = solve(1);
      const lower = sol.world.lowerarm_l!;
      const hand = sol.world.hand_l!.position;
      const dir = sub(hand, lower.position);
      const along = scale(dir, 2 / Math.hypot(dir[0], dir[1], dir[2]));
      const world = { ...sol.world, lowerarm_l: { ...lower, position: add(lower.position, along) } };
      expect(checks({ ...sol, world })).toContain('bone-length');
    });
    it('flags a bar above the upper stop (bar-travel)', () => {
      const sol = solve(0);
      expect(checks(sol, { ...ILLUSTRATIVE_SMITH, highestBarHeightCm: 100 })).toContain('bar-travel');
    });
  });
});

describe('head pitch', () => {
  it('tilts the head by headFollow of the trunk lean at the bottom', () => {
    const sk = syntheticSkeleton();
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 190, railZCm: 0 });
    const rest = restPose(sk, sol.scaleFactor);
    // Rest-relative world rotation of the head: rotation from rest to posed.
    const delta = multiply(sol.world.head!.rotation, conjugate(rest.head!.rotation));
    const expected = fromAxisAngle([1, 0, 0], degToRad(SMITH_SQUAT.headFollow * sol.trunkDeg));
    expect(angleBetweenQuatsDeg(delta, expected)).toBeLessThan(1);
  });
});
