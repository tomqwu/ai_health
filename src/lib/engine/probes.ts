import { SMITH_SQUAT } from '../figure/fixtures/smith-squat';
import { ILLUSTRATIVE_SMITH } from '../figure/geometry/smith';
import { checkFigureFrame } from '../figure/pose/checkFigureFrame';
import { REAL_SKELETON } from '../figure/pose/realSkeleton';
import type { SkeletonDef } from '../figure/pose/skeleton';
import type { SmithSquatSpec } from '../figure/pose/smithSquat';
import { carriedBarCenter, type Finding, headTop } from '../figure/pose/validate';
import type { GeometryProbe, ProbeRegistry } from './geometry';

/**
 * Findings the engine checks itself, against the profile's or the typical values and with localized
 * messages. (The probe passes no ceiling, and the illustrative machine's stops are not the user's.)
 */
const ENGINE_CHECKED: ReadonlySet<Finding['check']> = new Set(['bar-travel', 'ceiling']);

/**
 * Poses every Smith-squat frame at the stature with `checkFigureFrame` on the typical machine (D12) and
 * reports the envelope (head or plates), the bar-centre heights (the datum of the stops and `SmithParams`),
 * the ROM findings (signed limits; this solver's elbows are checked by magnitude only, see
 * `validateSmithSquat`) and every other pose finding. Throws when a frame cannot be solved.
 */
export function smithSquatProbe(sk: SkeletonDef, spec: SmithSquatSpec): GeometryProbe {
  const smith = ILLUSTRATIVE_SMITH;
  return ({ statureCm }) => {
    let topCm = 0;
    const barCentersCm: number[] = [];
    const rom: string[] = [];
    const posing: string[] = [];
    for (const frame of spec.frames) {
      const { solution, findings } = checkFigureFrame(sk, spec, frame, { statureCm, smith });
      const barY = carriedBarCenter(sk, solution, spec.barRestOffsetCm)[1];
      barCentersCm.push(barY);
      topCm = Math.max(topCm, headTop(sk, solution.world, solution.scaleFactor)[1], barY + smith.plateDiameterCm / 2);
      for (const f of findings) {
        if (f.check === 'rom') rom.push(`${frame.id}: ${f.message}`);
        else if (!ENGINE_CHECKED.has(f.check)) posing.push(`${frame.id}: ${f.message}`);
      }
    }
    return { topCm, barCentersCm, rom, posing };
  };
}

/**
 * Probes the site uses, keyed by figure spec id, posed on the committed human skeleton. M3 replaces
 * this with the generalized pose library; exercises without a probe use the interim envelope.
 */
export const DEFAULT_PROBES: ProbeRegistry = {
  [SMITH_SQUAT.id]: smithSquatProbe(REAL_SKELETON, SMITH_SQUAT),
};
