import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl, cylAlong } from './built';

/**
 * Cardio machines (cm), built at the origin facing +z (the user faces +z). Drawing defaults only — NOT
 * anyone's machine (D12). v1 poses no figure on them (spec §5.3); they appear in equipment views.
 */

export const TREADMILL = { lengthCm: 185, widthCm: 80, deckTopCm: 22, beltWidthCm: 50, beltLengthCm: 150 } as const;

/** Anchors: `treadmill.belt` (top centre of the belt). */
export function buildTreadmill(): Built {
  const { lengthCm: L, widthCm: W, deckTopCm: top, beltWidthCm: bw, beltLengthCm: bl } = TREADMILL;
  const back = -L / 2;
  const hoodZ = L / 2 - 16;
  const tilt = fromAxisAngle([1, 0, 0], degToRad(-25));
  const prims = [
    box('treadmill-deck', [0, top / 2 - 1, -8], [W - 6, top - 2, L - 34], 'plastic'),
    box('treadmill-belt', [0, top + 0.5, -8], [bw, 1, bl], 'belt'),
    box('treadmill-hood', [0, top + 4, hoodZ], [W, 16, 32], 'plastic'),
    box('treadmill-console', [0, 132, hoodZ + 12], [W - 10, 8, 28], 'plastic', tilt),
  ];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'left' : 'right';
    prims.push(box(`treadmill-rail-${tag}`, [s * (bw / 2 + 7), top + 1, -8], [13, 2, bl], 'rubber'));
    prims.push(cyl(`treadmill-upright-${tag}`, [s * (W / 2 - 6), top + 6, hoodZ], [s * (W / 2 - 6), 128, hoodZ + 10], 3.2, 'frame'));
    prims.push(cyl(`treadmill-handrail-${tag}`, [s * (W / 2 - 6), 106, hoodZ + 6], [s * (W / 2 - 6), 104, hoodZ - 34], 1.8, 'grip'));
    prims.push(box(`treadmill-foot-${tag}`, [s * (W / 2 - 8), 2, back + 6], [8, 4, 8], 'rubber'));
  }
  return { prims, anchors: { 'treadmill.belt': [0, top + 1, -8] }, surfaces: { 'treadmill.belt': { kind: 'plane', point: [0, top + 1, -8], normal: [0, 1, 0], primitive: 'treadmill-belt' } } };
}

export const ROWER = { railTopCm: 38, fanRadiusCm: 30, fanZCm: 105, rearZCm: -135 } as const;

/** Air rower. Anchors: `rower.seat` (top of the seat at the catch), `rower.handle` (handle centre at rest), `rower.footplates`. */
export function buildRowingMachine(): Built {
  const { railTopCm: top, fanRadiusCm: fr, fanZCm: fz, rearZCm: rz } = ROWER;
  const fanY = fr + 14;
  const footTilt = fromAxisAngle([1, 0, 0], degToRad(-40));
  const prims = [
    box('rower-rail', [0, top - 4, (rz + fz - 30) / 2], [9, 8, fz - 30 - rz], 'chrome'),
    cylAlong('rower-fan', [0, fanY, fz], [1, 0, 0], 28, fr, 'plastic'),
    cylAlong('rower-fan-hub', [0, fanY, fz], [1, 0, 0], 32, 6, 'frame'),
    box('rower-front-frame', [0, (top + fanY) / 2, fz - 26], [12, fanY - top + 20, 10], 'frame'),
    cylAlong('rower-front-foot', [0, 3, fz + 10], [1, 0, 0], 60, 3, 'frame'),
    box('rower-rear-leg', [0, top / 2, rz + 4], [8, top, 8], 'frame'),
    cylAlong('rower-rear-foot', [0, 3, rz + 4], [1, 0, 0], 50, 3, 'frame'),
    box('rower-seat', [0, top + 3, -10], [30, 6, 28], 'pad'),
    cylAlong('rower-handle', [0, fanY + 4, fz - 38], [1, 0, 0], 52, 1.6, 'grip'),
    cyl('rower-chain', [0, fanY + 4, fz - 38], [0, fanY, fz - fr + 2], 0.5, 'cable'),
  ];
  for (const s of [1, -1]) prims.push(box(`rower-footplate-${s > 0 ? 'left' : 'right'}`, [s * 9, top + 6, fz - 60], [14, 3, 30], 'plastic', footTilt));
  return {
    prims,
    anchors: { 'rower.seat': [0, top + 6, -10], 'rower.handle': [0, fanY + 4, fz - 38], 'rower.footplates': [0, top + 6, fz - 60] },
    surfaces: { 'rower.seat': { kind: 'plane', point: [0, top + 6, -10], normal: [0, 1, 0], primitive: 'rower-seat' } },
  };
}

export const BIKE = { saddleTopCm: 100, flywheelRadiusCm: 23 } as const;

/** Indoor exercise bike. Anchors: `bike.saddle`, `bike.handlebars`, `bike.crank`. */
export function buildExerciseBike(): Built {
  const { saddleTopCm: saddle, flywheelRadiusCm: fw } = BIKE;
  const crank: [number, number, number] = [0, 32, 2];
  const prims = [
    cylAlong('bike-flywheel', [0, fw + 8, 42], [1, 0, 0], 5, fw, 'chrome'),
    box('bike-flywheel-guard', [0, fw + 18, 42], [9, 22, 30], 'plastic'),
    cylAlong('bike-front-foot', [0, 3, 55], [1, 0, 0], 52, 3, 'frame'),
    cylAlong('bike-rear-foot', [0, 3, -50], [1, 0, 0], 52, 3, 'frame'),
    cyl('bike-base', [0, 5, -50], [0, 5, 55], 3, 'frame'),
    cyl('bike-down-tube', [0, 5, 30], [0, 98, 30], 3.5, 'frame'),
    cyl('bike-seat-tube', [0, 5, -30], [0, saddle - 6, -24], 3.5, 'frame'),
    cyl('bike-top-tube', [0, 70, -26], [0, 80, 30], 3, 'frame'),
    box('bike-saddle', [0, saddle - 2.5, -22], [16, 5, 27], 'pad'),
    cylAlong('bike-handlebar', [0, 108, 36], [1, 0, 0], 46, 1.6, 'grip'),
    cyl('bike-stem', [0, 98, 30], [0, 108, 36], 2.5, 'frame'),
    cylAlong('bike-crank-axle', crank, [1, 0, 0], 16, 2, 'chrome'),
  ];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'left' : 'right';
    const pedal: [number, number, number] = [s * 11, crank[1] - s * 14, crank[2] + s * 5];
    prims.push(cyl(`bike-crank-${tag}`, [s * 8, crank[1], crank[2]], pedal, 1.2, 'chrome'));
    prims.push(box(`bike-pedal-${tag}`, [s * 14, pedal[1], pedal[2]], [9, 2.5, 11], 'rubber'));
  }
  return { prims, anchors: { 'bike.saddle': [0, saddle, -22], 'bike.handlebars': [0, 108, 36], 'bike.crank': crank }, surfaces: {} };
}
