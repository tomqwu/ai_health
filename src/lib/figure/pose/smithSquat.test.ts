import { describe, expect, it } from 'vitest';
import { distance } from '../math/vec3';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { syntheticSkeleton } from './synthetic';
import { solveSmithSquat } from './smithSquat';
import { jointAngles, validateSmithSquat } from './validate';

const STATURES = [150, 165, 175, 190, 200];

describe('solveSmithSquat', () => {
  it.each(STATURES)('produces valid frames at %i cm', (statureCm) => {
    const sk = syntheticSkeleton({ randomRestSeed: 5 });
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(sk, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      const findings = validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH });
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
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH }).map((f) => f.check)).toContain('rom');
  });
  it('flags a bottom position below the lower stop', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: { ...ILLUSTRATIVE_SMITH, lowestBarHeightCm: 150 } }).map((f) => f.check)).toContain('bar-travel');
  });
  it('flags a low ceiling and passes a normal one', () => {
    const sol = solveSmithSquat(sk, SMITH_SQUAT, SMITH_SQUAT.frames[0]!, { statureCm: 190, railZCm: 0 });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, ceilingCm: 195 }).map((f) => f.check)).toContain('ceiling');
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, ceilingCm: 244 })).toEqual([]);
  });
});
