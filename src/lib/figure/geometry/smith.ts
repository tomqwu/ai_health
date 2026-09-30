import type { Primitive } from './primitives';

/**
 * Smith machine geometry (cm). Origin: floor under the rack centre; +Z = the lifter's facing
 * direction; +X to the lifter's left.
 */
export interface SmithParams {
  rackInnerWidthCm: number;
  rackInnerDepthCm: number;
  rackHeightCm: number;
  /** Square profile of the uprights and beams. The floor base is half as tall. */
  uprightSizeCm: number;
  /** Z of the Smith rails (the bar path). */
  railZCm: number;
  /** Distance of each rail from the centre line (X). */
  railHalfSpacingCm: number;
  railRadiusCm: number;
  /** Height of the rails' lower ends above the floor. */
  railBottomCm: number;
  barRadiusCm: number;
  /** How far each bar sleeve extends past its rail. */
  sleeveLengthCm: number;
  lowestBarHeightCm: number;
  highestBarHeightCm: number;
  plateDiameterCm: number;
  plateThicknessCm: number;
  /** Gap between a rail and the inner face of the plate outside it. */
  plateGapCm: number;
  /** The block that slides on each rail and carries the bar (square in plan). */
  carriageWidthCm: number;
  carriageHeightCm: number;
  /** Fixed stops under the carriages at the lowest bar height (square in plan). */
  stopBlockWidthCm: number;
  stopBlockHeightCm: number;
  /** Adjustable safety catches (square in plan). */
  catchBlockWidthCm: number;
  catchBlockHeightCm: number;
  /** How far below the lowest bar position of a set the catches are drawn (see `catchHeightFor`). */
  catchBelowBottomCm: number;
}

/**
 * Drawing defaults for generic pages — NOT measurements of anyone's machine. Pages label them
 * "illustrative"; profile feasibility checks never use them (the figure sweep does, deliberately).
 */
export const ILLUSTRATIVE_SMITH: SmithParams = {
  rackInnerWidthCm: 120,
  rackInnerDepthCm: 100,
  rackHeightCm: 215,
  uprightSizeCm: 7.5,
  railZCm: 0,
  railHalfSpacingCm: 52,
  railRadiusCm: 1.5,
  railBottomCm: 3,
  barRadiusCm: 1.6,
  sleeveLengthCm: 30,
  lowestBarHeightCm: 40,
  highestBarHeightCm: 180,
  plateDiameterCm: 45,
  plateThicknessCm: 6,
  plateGapCm: 8,
  carriageWidthCm: 6,
  carriageHeightCm: 16,
  stopBlockWidthCm: 7,
  stopBlockHeightCm: 4,
  catchBlockWidthCm: 9,
  catchBlockHeightCm: 3,
  catchBelowBottomCm: 8,
};

export interface SmithState {
  barHeightCm: number;
  /** Bar height at which the safety catches stop the bar; omit to draw no catches. */
  catchHeightCm?: number;
}

/** Height of the floor base rails: half the upright profile. */
const baseHeight = (p: SmithParams) => p.uprightSizeCm / 2;
/** Top of the rails: the underside of the top beams. */
const railTop = (p: SmithParams) => p.rackHeightCm - p.uprightSizeCm;

/**
 * Everything wrong with a machine description (and, if given, a bar/catch setting), as readable
 * sentences; empty when it can be drawn. Checks that sizes are positive, the bar travel is ordered, the
 * rails sit inside the rack, the plates fit the sleeves and clear the frame over the whole travel, the
 * stops sit on the rails, and the bar and catches are set within the travel.
 */
export function smithProblems(p: SmithParams, state?: SmithState): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(p) as Array<[keyof SmithParams, number]>) {
    if (!Number.isFinite(v)) out.push(`${k} must be a finite number (got ${v})`);
    else if (k !== 'railZCm' && v <= 0) out.push(`${k} must be positive (got ${v})`);
  }
  if (out.length) return out;

  const plateR = p.plateDiameterCm / 2;
  if (p.lowestBarHeightCm >= p.highestBarHeightCm) {
    out.push(`lowest bar height ${p.lowestBarHeightCm} cm must be below the highest ${p.highestBarHeightCm} cm`);
  }
  if (p.railHalfSpacingCm + p.railRadiusCm > p.rackInnerWidthCm / 2 || Math.abs(p.railZCm) + p.railRadiusCm > p.rackInnerDepthCm / 2) {
    out.push(`rails at ±${p.railHalfSpacingCm} cm, z ${p.railZCm} cm must sit inside the rack (${p.rackInnerWidthCm} × ${p.rackInnerDepthCm} cm inside)`);
  }
  if (p.railBottomCm >= railTop(p)) out.push(`rail bottom ${p.railBottomCm} cm must be below the rail top ${railTop(p)} cm`);
  if (p.plateGapCm + p.plateThicknessCm > p.sleeveLengthCm) {
    out.push(`plates (gap ${p.plateGapCm} + thickness ${p.plateThicknessCm} cm) must fit on the ${p.sleeveLengthCm} cm sleeve`);
  }
  if (Math.abs(p.railZCm) + plateR > p.rackInnerDepthCm / 2) {
    out.push(`plates (${p.plateDiameterCm} cm) must clear the front and back uprights: the rack depth is ${p.rackInnerDepthCm} cm`);
  }
  if (p.lowestBarHeightCm - plateR < baseHeight(p)) {
    out.push(`plates must clear the floor frame at the lowest bar height ${p.lowestBarHeightCm} cm (needs at least ${baseHeight(p) + plateR} cm)`);
  }
  if (p.highestBarHeightCm + Math.max(plateR, p.carriageHeightCm / 2) > railTop(p)) {
    out.push(`plates and carriages must clear the top frame at the highest bar height ${p.highestBarHeightCm} cm (at most ${railTop(p) - plateR} cm)`);
  }
  if (p.lowestBarHeightCm - p.carriageHeightCm / 2 - p.stopBlockHeightCm < p.railBottomCm) {
    out.push(`stop blocks under the lowest bar height ${p.lowestBarHeightCm} cm must sit on the rail (above ${p.railBottomCm} cm)`);
  }
  for (const k of ['carriageWidthCm', 'stopBlockWidthCm', 'catchBlockWidthCm'] as const) {
    if (p[k] <= 2 * p.railRadiusCm) out.push(`${k} ${p[k]} cm must be wider than the rail (${2 * p.railRadiusCm} cm)`);
  }

  if (state) {
    const range = `${p.lowestBarHeightCm}–${p.highestBarHeightCm} cm`;
    const y = state.barHeightCm;
    if (!Number.isFinite(y) || y < p.lowestBarHeightCm || y > p.highestBarHeightCm) out.push(`bar height ${y} cm is outside the travel ${range}`);
    const c = state.catchHeightCm;
    if (c !== undefined) {
      if (!Number.isFinite(c) || c < p.lowestBarHeightCm) out.push(`catch height ${c} cm is below the lowest bar height ${p.lowestBarHeightCm} cm`);
      else if (c > p.highestBarHeightCm) out.push(`catch height ${c} cm is above the highest bar height ${p.highestBarHeightCm} cm`);
    }
  }
  return out;
}

/** Catch height for a set whose lowest bar position is `lowestRepBarCm`: a little below it, within the travel. */
export function catchHeightFor(p: SmithParams, lowestRepBarCm: number): number {
  return Math.max(p.lowestBarHeightCm, lowestRepBarCm - p.catchBelowBottomCm);
}

/** Primitives for a Smith machine; throws if `smithProblems` finds anything wrong. */
export function buildSmith(p: SmithParams, state: SmithState): Primitive[] {
  const problems = smithProblems(p, state);
  if (problems.length) throw new Error(`buildSmith: ${problems.join('; ')}`);
  const halfW = p.rackInnerWidthCm / 2 + p.uprightSizeCm / 2;
  const halfD = p.rackInnerDepthCm / 2 + p.uprightSizeCm / 2;
  const u = p.uprightSizeCm;
  const h = p.rackHeightCm;
  const y = state.barHeightCm;
  const carriageHalf = p.carriageHeightCm / 2;
  const out: Primitive[] = [];

  for (const [sx, sz, tag] of [
    [1, 1, 'front-left'],
    [-1, 1, 'front-right'],
    [1, -1, 'back-left'],
    [-1, -1, 'back-right'],
  ] as const) {
    out.push({ kind: 'box', id: `upright-${tag}`, center: [sx * halfW, h / 2, sz * halfD], size: [u, h, u], surface: 'frame' });
  }
  for (const [sz, tag] of [
    [1, 'front'],
    [-1, 'back'],
  ] as const) {
    out.push({ kind: 'box', id: `beam-top-${tag}`, center: [0, h - u / 2, sz * halfD], size: [2 * halfW + u, u, u], surface: 'frame' });
  }
  for (const [sx, tag] of [
    [1, 'left'],
    [-1, 'right'],
  ] as const) {
    out.push({ kind: 'box', id: `beam-top-${tag}`, center: [sx * halfW, h - u / 2, 0], size: [u, u, 2 * halfD - u], surface: 'frame' });
    out.push({ kind: 'box', id: `base-${tag}`, center: [sx * halfW, baseHeight(p) / 2, 0], size: [u, baseHeight(p), 2 * halfD + u], surface: 'frame' });
    const rx = sx * p.railHalfSpacingCm;
    out.push({ kind: 'cylinder', id: `rail-${tag}`, start: [rx, p.railBottomCm, p.railZCm], end: [rx, railTop(p), p.railZCm], radius: p.railRadiusCm, surface: 'chrome' });
    const cw = p.carriageWidthCm;
    out.push({ kind: 'box', id: `carriage-${tag}`, center: [rx, y, p.railZCm], size: [cw, p.carriageHeightCm, cw], surface: 'carriage' });
    const [sw, sh] = [p.stopBlockWidthCm, p.stopBlockHeightCm];
    out.push({ kind: 'box', id: `stop-${tag}`, center: [rx, p.lowestBarHeightCm - carriageHalf - sh / 2, p.railZCm], size: [sw, sh, sw], surface: 'stop' });
    if (state.catchHeightCm !== undefined) {
      const [kw, kh] = [p.catchBlockWidthCm, p.catchBlockHeightCm];
      out.push({ kind: 'box', id: `catch-${tag}`, center: [rx, state.catchHeightCm - carriageHalf - kh / 2, p.railZCm], size: [kw, kh, kw], surface: 'catch' });
    }
    const plateX = sx * (p.railHalfSpacingCm + p.plateGapCm + p.plateThicknessCm / 2);
    out.push({
      kind: 'cylinder',
      id: `plate-${tag}`,
      start: [plateX - p.plateThicknessCm / 2, y, p.railZCm],
      end: [plateX + p.plateThicknessCm / 2, y, p.railZCm],
      radius: p.plateDiameterCm / 2,
      surface: 'plate',
    });
  }
  const barHalf = p.railHalfSpacingCm + p.sleeveLengthCm;
  out.push({ kind: 'cylinder', id: 'bar', start: [-barHalf, y, p.railZCm], end: [barHalf, y, p.railZCm], radius: p.barRadiusCm, surface: 'chrome' });
  return out;
}
