import type { Catalog } from '../content/catalog';
import type { Exercise } from '../content/schemas';
import { type Pattern, RACK_STATIONS } from '../content/vocab';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { boolParam, numberParam } from './params';
import type { Reason } from './types';

/** Spec §7.1 (D12): an unknown stature poses at this typical adult stature. */
export const TYPICAL_STATURE_CM = 175;
/** Spec §7.1 (D12): an unknown ceiling is assumed to be this high; exceeding it adds a note, never a failure. */
export const ASSUMED_CEILING_CM = 240;

/**
 * Interim envelope for exercises without a pose probe, until M3 poses every figure. Conservative
 * anthropometric ratios of stature:
 * - overhead work: fingertip reach plus a held implement ≈ 1.33 × stature
 * - top of a pull-up: the head above the bar ≈ 0.13 × stature (chin over the bar)
 */
export const OVERHEAD_REACH_RATIO = 1.33;
export const HEAD_ABOVE_BAR_RATIO = 0.13;
const OVERHEAD_PATTERNS: readonly Pattern[] = ['vertical-push'];

export interface ProbeInput {
  statureCm: number;
}

/** What posing an exercise's frames at a stature reveals (spec §7.1 check 4). */
export interface ProbeResult {
  /** Highest point of the body and implements over all frames (cm above the floor). */
  topCm: number;
  /**
   * Height of the Smith bar's centre in each frame (cm above the floor), for exercises that move a Smith bar.
   * Same datum as the stop parameters and `SmithParams`: floor to the centre of the bar.
   */
  barCentersCm?: readonly number[];
  /** Range-of-motion findings in any frame (pose-layer diagnostics); empty when every joint is within its limits. */
  rom: readonly string[];
  /** Other pose-layer findings (hands or feet off target, bar off the rail, bone lengths); empty when posed cleanly. */
  posing: readonly string[];
}

/** Poses an exercise's frames; may throw when no valid pose exists. */
export type GeometryProbe = (input: ProbeInput) => ProbeResult;

/** Probes keyed by figure spec id (`exercise.figure.spec`). */
export type ProbeRegistry = Readonly<Record<string, GeometryProbe>>;

export interface GeometryOutcome {
  reasons: Reason[];
  /** Non-blocking: e.g. check overhead clearance under an assumed ceiling. */
  notes: Message[];
}

/** The bench sits between the uprights when the exercise uses a bench at a rack station. */
export const benchInRack = (ex: Exercise) => ex.setupState.benchAngleDeg !== undefined && RACK_STATIONS.includes(ex.setupState.station);

/** The stature every check uses: the profile's, else the typical one (D12). */
export const statureFor = (profile: Profile): number => profile.statureCm ?? TYPICAL_STATURE_CM;

/** Which typical values stand in for unknown inputs, as messages (spec §7.1: checks say "typical height"). */
export function assumptions(profile: Profile): Message[] {
  const out: Message[] = [];
  if (profile.statureCm === undefined) out.push({ key: 'engine.assumed.stature', params: { height: { lengthCm: TYPICAL_STATURE_CM } } });
  if (profile.room.ceilingHeightCm === undefined) out.push({ key: 'engine.assumed.ceiling', params: { ceiling: { lengthCm: ASSUMED_CEILING_CM } } });
  return out;
}

function envelopeTopCm(ex: Exercise, statureCm: number, profile: Profile, catalog: Catalog): number {
  if (ex.requires.capabilities.includes('pull-up-bar')) {
    const bar = numberParam(profile, catalog, 'pullUpBarHeightCm');
    return bar === undefined ? OVERHEAD_REACH_RATIO * statureCm : bar + HEAD_ABOVE_BAR_RATIO * statureCm;
  }
  if (OVERHEAD_PATTERNS.includes(ex.pattern)) return OVERHEAD_REACH_RATIO * statureCm;
  return statureCm;
}

/**
 * Spec §7.1 check 4: ceiling clearance, Smith bar travel, bench fit and joint range of motion. Unknown
 * inputs use typical values (D12): stature 175 cm, the equipment's illustrative defaults, and an assumed
 * 240 cm ceiling that adds a clearance note instead of failing.
 */
export function checkGeometry(ex: Exercise, profile: Profile, catalog: Catalog, probes: ProbeRegistry): GeometryOutcome {
  const reasons: Reason[] = [];
  const notes: Message[] = [];
  const statureCm = statureFor(profile);
  const poseFailed: GeometryOutcome = { reasons: [{ check: 'pose', message: { key: 'engine.reason.poseFailed' } }], notes };

  const movesSmithBar = ex.requires.capabilities.includes('smith-bar');
  const probe = ex.figure ? probes[ex.figure.spec] : undefined;
  let probed: ProbeResult | undefined;
  if (probe) {
    try {
      probed = probe({ statureCm });
    } catch {
      return poseFailed;
    }
    if (probed.posing.length > 0) return poseFailed;
  }
  if (movesSmithBar && !probed?.barCentersCm?.length) {
    return { reasons: [{ check: 'bar-travel', message: { key: 'engine.reason.noGeometryModel' } }], notes };
  }

  // Ceiling: head, hands and implements plus the margin.
  const margin = profile.room.clearanceMarginCm;
  const needCm = Math.ceil((probed ? probed.topCm : envelopeTopCm(ex, statureCm, profile, catalog)) + margin);
  const ceiling = profile.room.ceilingHeightCm;
  if (ceiling === undefined) {
    if (needCm > ASSUMED_CEILING_CM) {
      notes.push({ key: 'engine.note.checkClearance', params: { need: { lengthCm: needCm }, margin: { lengthCm: margin }, ceiling: { lengthCm: ASSUMED_CEILING_CM } } });
    }
  } else if (needCm > ceiling) {
    reasons.push({
      check: 'ceiling',
      message: { key: 'engine.reason.ceiling', params: { need: { lengthCm: needCm }, margin: { lengthCm: margin }, ceiling: { lengthCm: ceiling } } },
    });
  }

  // Smith bar travel versus the stops (measured, else typical); both are bar-centre heights.
  if (movesSmithBar && probed?.barCentersCm) {
    const low = Math.min(...probed.barCentersCm);
    const high = Math.max(...probed.barCentersCm);
    const lowestCm = numberParam(profile, catalog, 'smithLowestBarHeightCm');
    const highestCm = numberParam(profile, catalog, 'smithHighestBarHeightCm');
    if (lowestCm !== undefined && low < lowestCm) {
      reasons.push({
        check: 'bar-travel',
        message: { key: 'engine.reason.barBelowStop', params: { height: { lengthCm: Math.round(low) }, stop: { lengthCm: lowestCm } } },
      });
    }
    if (highestCm !== undefined && high > highestCm) {
      reasons.push({
        check: 'bar-travel',
        message: { key: 'engine.reason.barAboveStop', params: { height: { lengthCm: Math.round(high) }, stop: { lengthCm: highestCm } } },
      });
    }
  }

  // Bench between the uprights (the user's answer, else the typical one).
  if (benchInRack(ex) && boolParam(profile, catalog, 'benchFitsInsideRack') === false) {
    reasons.push({ check: 'bench-fit', message: { key: 'engine.reason.benchFit' } });
  }

  // Joint range of motion at this stature.
  if (probed && probed.rom.length > 0) reasons.push({ check: 'rom', message: { key: 'engine.reason.rom' } });

  return { reasons, notes };
}
