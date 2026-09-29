import { type Vec3, sub } from '../math/vec3';
import { type Quat, conjugate, fromAxisAngle, IDENTITY, multiply, rotate } from '../math/quat';
import type { BoneDef, SkeletonDef } from './skeleton';

/**
 * 175 cm synthetic skeleton with the same bone names and hierarchy as the MPFB "game_engine" rig,
 * so solvers can be tested without the real model. Rest pose: standing, arms hanging slightly
 * abducted, palms facing the thighs, facing +Z, left = +X.
 */
const LEFT: Record<string, [string, Vec3]> = {
  clavicle_l: ['spine_03', [3, 143, 2]],
  upperarm_l: ['clavicle_l', [18, 142, -2]],
  lowerarm_l: ['upperarm_l', [22.5, 109.7, -2]],
  hand_l: ['lowerarm_l', [26.1, 84.3, -1]],
  thumb_01_l: ['hand_l', [26, 82, 3.5]],
  thumb_02_l: ['thumb_01_l', [27, 78.5, 5.5]],
  thumb_03_l: ['thumb_02_l', [27.5, 75.5, 6.5]],
  index_01_l: ['hand_l', [27.5, 75, 2]],
  index_02_l: ['index_01_l', [27.8, 71, 2.3]],
  index_03_l: ['index_02_l', [28, 68.5, 2.4]],
  middle_01_l: ['hand_l', [27.8, 74.5, 0]],
  middle_02_l: ['middle_01_l', [28.1, 70, 0.2]],
  middle_03_l: ['middle_02_l', [28.3, 67.2, 0.3]],
  ring_01_l: ['hand_l', [27.8, 75, -2]],
  ring_02_l: ['ring_01_l', [28, 71, -2.1]],
  ring_03_l: ['ring_02_l', [28.2, 68.4, -2.2]],
  pinky_01_l: ['hand_l', [27.3, 76, -3.8]],
  pinky_02_l: ['pinky_01_l', [27.5, 73, -4]],
  pinky_03_l: ['pinky_02_l', [27.6, 71, -4.1]],
  thigh_l: ['pelvis', [9, 91, 0]],
  calf_l: ['thigh_l', [9, 49.9, 0.5]],
  foot_l: ['calf_l', [9, 6.8, -1]],
  ball_l: ['foot_l', [9, 2, 14]],
};

const CENTER: Record<string, [string | null, Vec3]> = {
  Root: [null, [0, 0, 0]],
  pelvis: ['Root', [0, 94, 0]],
  spine_01: ['pelvis', [0, 100, -1]],
  spine_02: ['spine_01', [0, 112, -2]],
  spine_03: ['spine_02', [0, 126, -2]],
  neck_01: ['spine_03', [0, 146, -2]],
  head: ['neck_01', [0, 157, 0]],
};

const STATURE = 175;

function worldTable(): Array<[string, string | null, Vec3]> {
  const rows: Array<[string, string | null, Vec3]> = Object.entries(CENTER).map(([n, [p, v]]) => [n, p, v]);
  for (const [n, [p, v]] of Object.entries(LEFT)) {
    rows.push([n, p, v]);
    rows.push([n.replace(/_l$/, '_r'), p.replace(/_l$/, '_r'), [-v[0], v[1], v[2]]]);
  }
  const ordered: typeof rows = [];
  const placed = new Set<string>();
  while (ordered.length < rows.length) {
    for (const r of rows) {
      if (!placed.has(r[0]) && (r[1] === null || placed.has(r[1]))) {
        ordered.push(r);
        placed.add(r[0]);
      }
    }
  }
  return ordered;
}

/** Deterministic pseudo-random rotation, for testing that solvers ignore rig axis conventions. */
function seededRotation(seed: number, i: number): Quat {
  const r = (k: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + k * 233280) * 43758.5453;
    return x - Math.floor(x);
  };
  return fromAxisAngle([r(1) - 0.5, r(2) - 0.5, r(3) - 0.5 + 1e-3], (r(4) - 0.5) * 2 * Math.PI);
}

export function syntheticSkeleton(opts: { randomRestSeed?: number } = {}): SkeletonDef {
  const rows = worldTable();
  const pos = new Map(rows.map(([n, , v]) => [n, v]));
  const worldRot = new Map<string, Quat>(
    rows.map(([n], i) => [n, opts.randomRestSeed === undefined ? IDENTITY : seededRotation(opts.randomRestSeed, i)]),
  );
  const bones: BoneDef[] = rows.map(([name, parent, p]) => {
    if (parent === null) return { name, parent, restLocalT: p, restLocalR: worldRot.get(name)! };
    const invParent = conjugate(worldRot.get(parent)!);
    return {
      name,
      parent,
      restLocalT: rotate(invParent, sub(p, pos.get(parent)!)),
      restLocalR: multiply(invParent, worldRot.get(name)!),
    };
  });
  const head = pos.get('head')!;
  return {
    source: { file: 'synthetic', sha256: 'synthetic' },
    statureCm: STATURE,
    bones,
    headTopLocal: rotate(conjugate(worldRot.get('head')!), [0, STATURE - head[1], 0]),
  };
}
