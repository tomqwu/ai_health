import type { SmithParams } from '../geometry/smith';
import type { SkeletonDef } from './skeleton';
import { solveSmithSquat, type SmithSquatFrame, type SmithSquatSolution, type SmithSquatSpec } from './smithSquat';
import { type Finding, validateSmithSquat } from './validate';

export interface FigureFrameContext {
  statureCm: number;
  /** The machine the figure is posed on; both the solver's rail and the validator's checks come from it. */
  smith: SmithParams;
  ceilingCm?: number;
  clearanceMarginCm?: number;
}

export interface FigureFrameCheck {
  solution: SmithSquatSolution;
  findings: Finding[];
}

/**
 * Solve one frame and validate it with the same inputs: the rail comes from `ctx.smith` and the bar
 * offset from `spec`, so the solver and the validator cannot be handed different values. Every place
 * that checks a frame (the spike page, the figure sweeps, the in-between Play poses) goes through here.
 */
export function checkFigureFrame(sk: SkeletonDef, spec: SmithSquatSpec, frame: SmithSquatFrame, ctx: FigureFrameContext): FigureFrameCheck {
  const solution = solveSmithSquat(sk, spec, frame, { statureCm: ctx.statureCm, railZCm: ctx.smith.railZCm });
  const findings = validateSmithSquat(sk, solution, {
    smith: ctx.smith,
    barRestOffsetCm: spec.barRestOffsetCm,
    ceilingCm: ctx.ceilingCm,
    clearanceMarginCm: ctx.clearanceMarginCm,
  });
  return { solution, findings };
}
