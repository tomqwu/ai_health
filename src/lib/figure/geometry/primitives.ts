import { type Vec3, add, cross, dot, length, normalize, scale, sub } from '../math/vec3';
import { conjugate, type Quat, rotate } from '../math/quat';

/** Surface kinds; the 3D layer maps each to a material. */
export type SurfaceKind =
  | 'frame'
  | 'chrome'
  | 'plate'
  | 'stop'
  | 'catch'
  | 'carriage'
  /** Upholstered pads (bench, hold-down, rower seat). */
  | 'pad'
  /** Black rubber: bumper plates, dumbbell heads, feet, wheels. */
  | 'rubber'
  /** Knurled or foam handle grips. */
  | 'grip'
  /** Steel cable. */
  | 'cable'
  /** Braided rope (the rope attachment). */
  | 'rope'
  | 'foam'
  | 'band'
  | 'ball'
  | 'dome'
  /** Housings and consoles of cardio machines. */
  | 'plastic'
  | 'belt';

export type Primitive =
  /** `rotation` turns the box about its centre (default: axis-aligned). */
  | { kind: 'box'; id: string; center: Vec3; size: Vec3; surface: SurfaceKind; rotation?: Quat }
  | { kind: 'cylinder'; id: string; start: Vec3; end: Vec3; radius: number; surface: SurfaceKind }
  /** `capBelowY`: the part below this height is cut off, leaving a dome with a flat base. */
  | { kind: 'sphere'; id: string; center: Vec3; radius: number; surface: SurfaceKind; capBelowY?: number };

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

function boxCorners(p: Extract<Primitive, { kind: 'box' }>): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        const local: Vec3 = [sx * p.size[0], sy * p.size[1], sz * p.size[2]];
        out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
      }
    }
  }
  return out;
}

export function aabbOf(p: Primitive): Aabb {
  if (p.kind === 'box') {
    if (!p.rotation) {
      const h: Vec3 = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
      return {
        min: [p.center[0] - h[0], p.center[1] - h[1], p.center[2] - h[2]],
        max: [p.center[0] + h[0], p.center[1] + h[1], p.center[2] + h[2]],
      };
    }
    const c = boxCorners(p);
    return {
      min: [0, 1, 2].map((i) => Math.min(...c.map((v) => v[i]!))) as unknown as Vec3,
      max: [0, 1, 2].map((i) => Math.max(...c.map((v) => v[i]!))) as unknown as Vec3,
    };
  }
  if (p.kind === 'sphere') {
    const r = p.radius;
    const floor = Math.max(p.center[1] - r, p.capBelowY ?? -Infinity);
    return { min: [p.center[0] - r, floor, p.center[2] - r], max: [p.center[0] + r, p.center[1] + r, p.center[2] + r] };
  }
  // Exact box of a capped cylinder: along each world axis the caps add r * sqrt(1 - d_i^2).
  const d = normalize(sub(p.end, p.start));
  const e = d.map((c) => p.radius * Math.sqrt(Math.max(0, 1 - c * c))) as unknown as Vec3;
  return {
    min: [Math.min(p.start[0], p.end[0]) - e[0], Math.min(p.start[1], p.end[1]) - e[1], Math.min(p.start[2], p.end[2]) - e[2]],
    max: [Math.max(p.start[0], p.end[0]) + e[0], Math.max(p.start[1], p.end[1]) + e[1], Math.max(p.start[2], p.end[2]) + e[2]],
  };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return [0, 1, 2].every((i) => a.min[i]! < b.max[i]! && b.min[i]! < a.max[i]!);
}

/**
 * Signed distance from a point to a primitive's surface (cm): negative inside, positive outside. Exact
 * for boxes, capped cylinders and spheres; a capped sphere is the sphere cut by the plane at `capBelowY`.
 */
export function signedDistance(p: Primitive, point: Vec3): number {
  if (p.kind === 'box') {
    const local = sub(point, p.center);
    const q = p.rotation ? rotate(conjugate(p.rotation), local) : local;
    const d = [0, 1, 2].map((i) => Math.abs(q[i]!) - p.size[i]! / 2);
    const outside = Math.hypot(...d.map((v) => Math.max(v, 0)));
    return outside + Math.min(Math.max(d[0]!, d[1]!, d[2]!), 0);
  }
  if (p.kind === 'sphere') {
    const ball = length(sub(point, p.center)) - p.radius;
    return p.capBelowY === undefined ? ball : Math.max(ball, p.capBelowY - point[1]);
  }
  const axis = sub(p.end, p.start);
  const h = length(axis);
  const u = scale(axis, 1 / h);
  const rel = sub(point, p.start);
  const along = dot(rel, u);
  const radial = length(sub(rel, scale(u, along)));
  const dr = radial - p.radius;
  const dh = Math.abs(along - h / 2) - h / 2;
  return Math.min(Math.max(dr, dh), 0) + Math.hypot(Math.max(dr, 0), Math.max(dh, 0));
}

/**
 * Points on a primitive's surface (its corners, rims and caps), for overlap checks that must be tighter
 * than bounding boxes: a primitive overlaps another when one of its samples is inside it.
 */
export function surfaceSamples(p: Primitive): Vec3[] {
  if (p.kind === 'box') {
    const out = boxCorners(p);
    for (const [i, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as const) {
      const local: Vec3 = [0, 0, 0].map((_, k) => (k === i ? (s * p.size[k]!) / 2 : 0)) as unknown as Vec3;
      out.push(add(p.center, p.rotation ? rotate(p.rotation, local) : local));
    }
    return out;
  }
  if (p.kind === 'sphere') {
    const out: Vec3[] = [add(p.center, [0, p.radius, 0]), add(p.center, [0, -p.radius, 0])];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      for (const el of [-Math.PI / 4, 0, Math.PI / 4]) {
        out.push(add(p.center, scale([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], p.radius)));
      }
    }
    return p.capBelowY === undefined ? out : out.filter((v) => v[1] >= p.capBelowY!);
  }
  const axis = normalize(sub(p.end, p.start));
  const ref: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, ref));
  const v = cross(axis, u);
  const out: Vec3[] = [];
  for (const t of [0, 0.5, 1]) {
    const c = add(p.start, scale(sub(p.end, p.start), t));
    out.push(c);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      out.push(add(c, add(scale(u, Math.cos(a) * p.radius), scale(v, Math.sin(a) * p.radius))));
    }
  }
  return out;
}

/** How deep `a` reaches into `b` (cm, ≥ 0), from `a`'s surface samples. */
export function penetrationDepth(a: Primitive, b: Primitive): number {
  return Math.max(0, ...surfaceSamples(a).map((s) => -signedDistance(b, s)));
}
