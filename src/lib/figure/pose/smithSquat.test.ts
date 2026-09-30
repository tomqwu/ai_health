import { describe, expect, it } from 'vitest';
import { type Vec3, add, distance, scale, sub } from '../math/vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, multiply } from '../math/quat';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { syntheticSkeleton } from './synthetic';
import { forwardKinematics, restPose } from './skeleton';
import { PLAY_ORDER } from './playOrder';
import { checkFigureFrame } from './checkFigureFrame';
import { interpolateFrame, solveSmithSquat } from './smithSquat';
import { carriedBarCenter, jointAngles, validateSmithSquat } from './validate';

const STATURES = [150, 165, 175, 190, 200];
const BAR = SMITH_SQUAT.barRestOffsetCm;
const IN_BETWEEN_T = [0.25, 0.5, 0.75];

describe('interpolateFrame', () => {
  const [top, bottom] = [SMITH_SQUAT.frames[0]!, SMITH_SQUAT.frames[1]!];
  it('lerps the leg angles and keeps the first frame\'s other fields', () => {
    const mid = interpolateFrame(top, bottom, 0.25);
    expect(mid.shankDeg).toBeCloseTo(top.shankDeg + (bottom.shankDeg - top.shankDeg) * 0.25, 10);
    expect(mid.thighDeg).toBeCloseTo(top.thighDeg + (bottom.thighDeg - top.thighDeg) * 0.25, 10);
    expect(mid.label).toBe(top.label);
    expect(mid.cue).toBe(top.cue);
    expect(mid.arrow).toBe(top.arrow);
    expect(mid.id).toBe(`${top.id}>${bottom.id}@0.25`);
  });
  it('returns the end frames\' angles at t = 0 and t = 1', () => {
    expect(interpolateFrame(top, bottom, 0)).toMatchObject({ shankDeg: top.shankDeg, thighDeg: top.thighDeg });
    expect(interpolateFrame(top, bottom, 1)).toMatchObject({ shankDeg: bottom.shankDeg, thighDeg: bottom.thighDeg });
  });
  it('loops Play through every keyframe and back to the start', () => {
    expect(PLAY_ORDER[0]).toBe(0);
    expect(PLAY_ORDER.at(-1)).toBe(0);
    expect(new Set(PLAY_ORDER)).toEqual(new Set(SMITH_SQUAT.frames.map((_, i) => i)));
  });
});

describe('solveSmithSquat', () => {
  it.each(STATURES)('produces valid frames at %i cm', (statureCm) => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (const frame of SMITH_SQUAT.frames) {
      const { findings } = checkFigureFrame(sk, SMITH_SQUAT, frame, { statureCm, smith: ILLUSTRATIVE_SMITH });
      expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
    }
  });

  it.each(STATURES)('produces valid in-between poses for every Play segment at %i cm', (statureCm) => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (let seg = 0; seg < PLAY_ORDER.length - 1; seg++) {
      const [a, b] = [SMITH_SQUAT.frames[PLAY_ORDER[seg]!]!, SMITH_SQUAT.frames[PLAY_ORDER[seg + 1]!]!];
      for (const t of IN_BETWEEN_T) {
        const frame = interpolateFrame(a, b, t);
        const { findings } = checkFigureFrame(sk, SMITH_SQUAT, frame, { statureCm, smith: ILLUSTRATIVE_SMITH });
        expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
      }
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
    const a = jointAngles(sk, bottom!.world, 'l');
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
    const { findings } = checkFigureFrame(sk, narrow, SMITH_SQUAT.frames[0]!, { statureCm: 190, smith: ILLUSTRATIVE_SMITH });
    expect(findings.map((f) => f.check)).toContain('rom');
  });
  it('flags a bottom position below the lower stop', () => {
    const smith = { ...ILLUSTRATIVE_SMITH, lowestBarHeightCm: 150 };
    const { findings } = checkFigureFrame(sk, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 190, smith });
    expect(findings.map((f) => f.check)).toContain('bar-travel');
  });
  it('flags a low ceiling and passes a normal one', () => {
    const check = (ceilingCm: number) => checkFigureFrame(sk, SMITH_SQUAT, SMITH_SQUAT.frames[0]!, { statureCm: 190, smith: ILLUSTRATIVE_SMITH, ceilingCm });
    expect(check(195).findings.map((f) => f.check)).toContain('ceiling');
    expect(check(244).findings).toEqual([]);
  });

  describe('every validator can fire', () => {
    const solve = (i: number) => checkFigureFrame(sk, SMITH_SQUAT, SMITH_SQUAT.frames[i]!, { statureCm: 190, smith: ILLUSTRATIVE_SMITH }).solution;
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

describe('solver regression', () => {
  // World positions recorded before the #40 pose-robustness changes (aim roll control, atomic twoBoneIK).
  // The squat must not move: any change here is a behaviour change, not a refactor.
  const RECORDED: Record<string, Vec3> = {
    calf_l: [17.815417269558075, 47.062876002986926, 23.344871329062382],
    foot_r: [-16.000000000000007, 6.799999999999983, 8.000000000000039],
    lowerarm_l: [35.70313340269873, 76.66247333720503, -8.56607433267957],
    hand_r: [-41.99999999999998, 101.12919433214495, -4],
    middle_03_l: [46.24677742935014, 112.61688115508574, -4.034206447695061],
    thumb_03_r: [-48.89859007309662, 108.48965307359757, 1.274878556389086],
    head: [0, 112.3040456874949, 14.661553763092678],
  };
  it('keeps the bottom frame where it was (175 cm, seed 5)', () => {
    const sol = solveSmithSquat(syntheticSkeleton({ randomRestSeed: 5 }), SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 175, railZCm: 0 });
    for (const [bone, want] of Object.entries(RECORDED)) {
      expect(distance(sol.world[bone]!.position, want), bone).toBeLessThan(1e-6);
    }
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
