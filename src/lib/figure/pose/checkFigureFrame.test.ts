import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_SMITH } from '../geometry/smith';
import { SMITH_SQUAT } from '../fixtures/smith-squat';
import { checkFigureFrame } from './checkFigureFrame';
import { solveSmithSquat } from './smithSquat';
import { syntheticSkeleton } from './synthetic';
import { validateSmithSquat } from './validate';

const sk = syntheticSkeleton({ randomRestSeed: 5 });
const [top, bottom] = [SMITH_SQUAT.frames[0]!, SMITH_SQUAT.frames[1]!];

describe('checkFigureFrame', () => {
  it('solves and validates with the same inputs as calling both by hand', () => {
    const { solution, findings } = checkFigureFrame(sk, SMITH_SQUAT, bottom, { statureCm: 175, smith: ILLUSTRATIVE_SMITH });
    expect(solution).toEqual(solveSmithSquat(sk, SMITH_SQUAT, bottom, { statureCm: 175, railZCm: ILLUSTRATIVE_SMITH.railZCm }));
    expect(findings).toEqual(validateSmithSquat(sk, solution, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: SMITH_SQUAT.barRestOffsetCm }));
    expect(findings).toEqual([]);
  });

  it('takes the rail from the machine, so the solver and the validator cannot disagree about it', () => {
    const smith = { ...ILLUSTRATIVE_SMITH, railZCm: 10 };
    const { solution, findings } = checkFigureFrame(sk, SMITH_SQUAT, bottom, { statureCm: 175, smith });
    expect(solution.barCenter[2]).toBeCloseTo(10, 6);
    expect(findings).toEqual([]);
    // The drift the helper rules out: solving against one rail and validating against another.
    const drifted = solveSmithSquat(sk, SMITH_SQUAT, bottom, { statureCm: 175, railZCm: 0 });
    expect(validateSmithSquat(sk, drifted, { smith, barRestOffsetCm: SMITH_SQUAT.barRestOffsetCm }).map((f) => f.check)).toContain('bar-on-rail');
  });

  it('takes the bar offset from the spec', () => {
    const spec = { ...SMITH_SQUAT, barRestOffsetCm: [0, -2, -9] as const };
    expect(checkFigureFrame(sk, spec, top, { statureCm: 175, smith: ILLUSTRATIVE_SMITH }).findings).toEqual([]);
    const sol = solveSmithSquat(sk, spec, top, { statureCm: 175, railZCm: ILLUSTRATIVE_SMITH.railZCm });
    expect(validateSmithSquat(sk, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: SMITH_SQUAT.barRestOffsetCm }).map((f) => f.check)).toContain(
      'bar-on-rail',
    );
  });

  it('passes the ceiling and clearance margin to the validator', () => {
    const ctx = { statureCm: 190, smith: ILLUSTRATIVE_SMITH };
    expect(checkFigureFrame(sk, SMITH_SQUAT, top, { ...ctx, ceilingCm: 195 }).findings.map((f) => f.check)).toContain('ceiling');
    expect(checkFigureFrame(sk, SMITH_SQUAT, top, { ...ctx, ceilingCm: 244 }).findings).toEqual([]);
    expect(checkFigureFrame(sk, SMITH_SQUAT, top, { ...ctx, ceilingCm: 244, clearanceMarginCm: 60 }).findings.map((f) => f.check)).toContain('ceiling');
  });
});
