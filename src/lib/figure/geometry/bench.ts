import { type Vec3, add, scale } from '../math/vec3';
import { degToRad, fromAxisAngle } from '../math/quat';
import { box, type Built, cyl } from './built';

/**
 * Adjustable bench (cm). Built at the origin: the hinge between seat and backrest is at z = 0, the seat
 * runs toward +z, and the backrest lies toward −z when flat and rises toward +y as `angleDeg` grows
 * (0 = flat, 90 = upright). Seat height is the content parameter `seatHeightCm`.
 */
export interface BenchParams {
  seatHeightCm: number;
  seatLengthCm: number;
  backrestLengthCm: number;
  padWidthCm: number;
  padThicknessCm: number;
}

/** Drawing defaults — NOT anyone's bench (D12); seat height and backrest length equal the content's illustrative defaults. */
export const ILLUSTRATIVE_BENCH: BenchParams = { seatHeightCm: 43, seatLengthCm: 38, backrestLengthCm: 80, padWidthCm: 27, padThicknessCm: 7 };

/** Backrest angles the bench locks at (content parameter `backrestAnglesDeg`). */
export const BENCH_ANGLES_DEG = [0, 15, 30, 45, 60, 75, 90] as const;

export function benchProblems(p: BenchParams, angleDeg: number): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) if (!(Number.isFinite(v) && v > 0)) out.push(`${k} must be positive (got ${v})`);
  if (!(BENCH_ANGLES_DEG as readonly number[]).includes(angleDeg)) out.push(`backrest angle ${angleDeg}° is not one the bench locks at (${BENCH_ANGLES_DEG.join(', ')})`);
  if (p.seatHeightCm - p.padThicknessCm < 25) out.push(`seat height ${p.seatHeightCm} cm leaves no room for the frame`);
  return out;
}

/**
 * Anchors: `bench.seat` (top centre of the seat pad), `bench.hinge` (top of the pads at the hinge),
 * `bench.back` (top centre of the backrest pad), `bench.head` (top of the backrest's far end).
 * Surfaces: `bench.seat`, `bench.back`.
 */
export function buildBench(p: BenchParams, angleDeg: number): Built {
  const problems = benchProblems(p, angleDeg);
  if (problems.length) throw new Error(`buildBench: ${problems.join('; ')}`);
  const top = p.seatHeightCm;
  const t = p.padThicknessCm;
  const a = degToRad(angleDeg);
  const dir: Vec3 = [0, Math.sin(a), -Math.cos(a)];
  const normal: Vec3 = [0, Math.cos(a), Math.sin(a)];
  const hinge: Vec3 = [0, top, 0];
  const L = p.backrestLengthCm;
  const beamY = 26;
  const rearZ = -0.62 * L;
  const frontZ = p.seatLengthCm + 6;
  const strutTop = add(hinge, add(scale(dir, 0.42 * L), scale(normal, -t)));
  const prims = [
    box('bench-seat', [0, top - t / 2, p.seatLengthCm / 2], [p.padWidthCm, t, p.seatLengthCm], 'pad'),
    box('bench-back', add(hinge, add(scale(dir, L / 2), scale(normal, -t / 2))), [p.padWidthCm - 1, t, L], 'pad', fromAxisAngle([1, 0, 0], a)),
    box('bench-beam', [0, beamY, (rearZ + frontZ) / 2], [7, 7, frontZ - rearZ], 'frame'),
    box('bench-seat-post', [0, (beamY + top - t) / 2, p.seatLengthCm / 2], [6, top - t - beamY, 6], 'frame'),
    box('bench-rear-leg', [0, beamY / 2, rearZ + 4], [6, beamY, 6], 'frame'),
    box('bench-front-leg', [0, beamY / 2, frontZ - 4], [6, beamY, 6], 'frame'),
    cyl('bench-rear-foot', [-26, 3, rearZ], [26, 3, rearZ], 3, 'frame'),
    cyl('bench-front-foot', [-17, 3, frontZ], [17, 3, frontZ], 3, 'frame'),
    cyl('bench-strut', [0, beamY, rearZ + 18], strutTop, 1.8, 'chrome'),
  ];
  for (const s of [1, -1]) {
    prims.push(cyl(`bench-wheel-${s > 0 ? 'left' : 'right'}`, [s * 24.5, 4, rearZ - 3], [s * 27.5, 4, rearZ - 3], 4, 'rubber'));
    prims.push(box(`bench-foot-cap-${s > 0 ? 'left' : 'right'}`, [s * 16, 1.5, frontZ], [5, 3, 7], 'rubber'));
  }
  return {
    prims,
    anchors: {
      'bench.seat': [0, top, p.seatLengthCm / 2],
      'bench.hinge': hinge,
      'bench.back': add(hinge, scale(dir, L / 2)),
      'bench.head': add(hinge, scale(dir, L)),
    },
    surfaces: {
      'bench.seat': { kind: 'plane', point: hinge, normal: [0, 1, 0], primitive: 'bench-seat' },
      'bench.back': { kind: 'plane', point: hinge, normal, primitive: 'bench-back' },
    },
  };
}
