import type { Primitive } from './primitives';

/**
 * Smith machine geometry (cm). Origin: floor under the rack centre; +Z = the lifter's facing
 * direction; +X to the lifter's left.
 */
export interface SmithParams {
  rackInnerWidthCm: number;
  rackInnerDepthCm: number;
  rackHeightCm: number;
  uprightSizeCm: number;
  /** Z of the Smith rails (the bar path). */
  railZCm: number;
  /** Distance of each rail from the centre line (X). */
  railHalfSpacingCm: number;
  railRadiusCm: number;
  barRadiusCm: number;
  /** How far each bar sleeve extends past its rail. */
  sleeveLengthCm: number;
  lowestBarHeightCm: number;
  highestBarHeightCm: number;
  plateDiameterCm: number;
  plateThicknessCm: number;
}

/**
 * Drawing defaults for generic pages — NOT measurements of anyone's machine. Pages label them
 * "illustrative" and feasibility checks never use them.
 */
export const ILLUSTRATIVE_SMITH: SmithParams = {
  rackInnerWidthCm: 120,
  rackInnerDepthCm: 100,
  rackHeightCm: 215,
  uprightSizeCm: 7.5,
  railZCm: 0,
  railHalfSpacingCm: 52,
  railRadiusCm: 1.5,
  barRadiusCm: 1.6,
  sleeveLengthCm: 30,
  lowestBarHeightCm: 40,
  highestBarHeightCm: 180,
  plateDiameterCm: 45,
  plateThicknessCm: 6,
};

export interface SmithState {
  barHeightCm: number;
  /** Bar height at which the safety catches stop the bar; omit to draw no catches. */
  catchHeightCm?: number;
}

/** Half the height of the carriage block on each rail; it rests on stops and catches. */
export const CARRIAGE_HALF_HEIGHT_CM = 8;

export function buildSmith(p: SmithParams, state: SmithState): Primitive[] {
  const halfW = p.rackInnerWidthCm / 2 + p.uprightSizeCm / 2;
  const halfD = p.rackInnerDepthCm / 2 + p.uprightSizeCm / 2;
  const u = p.uprightSizeCm;
  const h = p.rackHeightCm;
  const y = state.barHeightCm;
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
    out.push({ kind: 'box', id: `base-${tag}`, center: [sx * halfW, u / 4, 0], size: [u, u / 2, 2 * halfD + u], surface: 'frame' });
    const rx = sx * p.railHalfSpacingCm;
    out.push({ kind: 'cylinder', id: `rail-${tag}`, start: [rx, 3, p.railZCm], end: [rx, h - u, p.railZCm], radius: p.railRadiusCm, surface: 'chrome' });
    out.push({ kind: 'box', id: `carriage-${tag}`, center: [rx, y, p.railZCm], size: [6, 2 * CARRIAGE_HALF_HEIGHT_CM, 6], surface: 'carriage' });
    out.push({ kind: 'box', id: `stop-${tag}`, center: [rx, p.lowestBarHeightCm - CARRIAGE_HALF_HEIGHT_CM - 2, p.railZCm], size: [7, 4, 7], surface: 'stop' });
    if (state.catchHeightCm !== undefined) {
      out.push({ kind: 'box', id: `catch-${tag}`, center: [rx, state.catchHeightCm - CARRIAGE_HALF_HEIGHT_CM - 1.5, p.railZCm], size: [9, 3, 9], surface: 'catch' });
    }
    const plateX = sx * (p.railHalfSpacingCm + 8 + p.plateThicknessCm / 2);
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
