import { type Vec3, add, length, scale } from '../math/vec3';
import { rotate } from '../math/quat';
import { type Primitive, signedDistance } from './primitives';

/** Points filling a primitive (its volume and surface), for touch checks that bounding boxes cannot make. */
export function cloud(p: Primitive): Vec3[] {
  const out: Vec3[] = [];
  if (p.kind === 'box') {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        for (let k = 0; k <= n; k++) {
          const local: Vec3 = [((i / n - 0.5) * p.size[0]), ((j / n - 0.5) * p.size[1]), ((k / n - 0.5) * p.size[2])];
          out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
        }
      }
    }
    return out;
  }
  if (p.kind === 'sphere') {
    for (const f of [0, 0.5, 1]) for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) out.push(add(p.center, scale(dir, f * p.radius)));
    return p.capBelowY === undefined ? out : out.filter((v) => v[1] >= p.capBelowY!);
  }
  const axis = add(p.end, scale(p.start, -1));
  const h = length(axis);
  const u = scale(axis, 1 / h);
  const ref: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]] as const;
  const sn = scale(s, 1 / length(s));
  const t2: Vec3 = [u[1] * sn[2] - u[2] * sn[1], u[2] * sn[0] - u[0] * sn[2], u[0] * sn[1] - u[1] * sn[0]];
  for (let i = 0; i <= 12; i++) {
    const c = add(p.start, scale(axis, i / 12));
    out.push(c);
    for (const f of [0.5, 1]) for (let a = 0; a < 8; a++) out.push(add(c, add(scale(sn, Math.cos((a * Math.PI) / 4) * f * p.radius), scale(t2, Math.sin((a * Math.PI) / 4) * f * p.radius))));
  }
  return out;
}

/** Smallest distance between two primitives' surfaces (negative once they overlap), from their point clouds. */
export const gap = (a: Primitive, b: Primitive): number => Math.min(...cloud(a).map((v) => signedDistance(b, v)), ...cloud(b).map((v) => signedDistance(a, v)));

const TOUCH_CM = 0.3;

/** Ids of the primitives not joined to the first one through a chain of touching parts (a part hanging in the air, or a sub-assembly not mounted on the rest). */
export function detached(prims: readonly Primitive[]): string[] {
  const done = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const a = queue.pop()!;
    prims.forEach((p, i) => {
      if (!done.has(i) && gap(prims[a]!, p) <= TOUCH_CM) {
        done.add(i);
        queue.push(i);
      }
    });
  }
  return prims.filter((_, i) => !done.has(i)).map((p) => p.id);
}
