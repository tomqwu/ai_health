import { type Vec3, normalize, sub } from '../math/vec3';

/** Surface kinds; the 3D layer maps each to a material. */
export type SurfaceKind = 'frame' | 'chrome' | 'plate' | 'stop' | 'catch' | 'carriage';

export type Primitive =
  | { kind: 'box'; id: string; center: Vec3; size: Vec3; surface: SurfaceKind }
  | { kind: 'cylinder'; id: string; start: Vec3; end: Vec3; radius: number; surface: SurfaceKind };

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export function aabbOf(p: Primitive): Aabb {
  if (p.kind === 'box') {
    const h: Vec3 = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    return {
      min: [p.center[0] - h[0], p.center[1] - h[1], p.center[2] - h[2]],
      max: [p.center[0] + h[0], p.center[1] + h[1], p.center[2] + h[2]],
    };
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
