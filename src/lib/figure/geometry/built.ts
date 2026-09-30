import { type Vec3, add, scale, sub } from '../math/vec3';
import { degToRad, fromAxisAngle, multiply, type Quat, rotate } from '../math/quat';
import type { Primitive, SurfaceKind } from './primitives';

/**
 * A flat or spherical surface a body part can rest on (floor, bench pad, ball). `primitive` names the
 * primitive it belongs to, so a declared contact is not also reported as the body sinking into it.
 */
export type Surface =
  | { kind: 'plane'; point: Vec3; normal: Vec3; primitive?: string }
  | { kind: 'sphere'; center: Vec3; radius: number; primitive?: string };

/**
 * What an equipment builder returns: its primitives, named points poses can refer to (`anchors`,
 * e.g. `bench.seat`) and named surfaces contacts can refer to. Ids and names are prefixed by the model.
 */
export interface Built {
  prims: Primitive[];
  anchors: Record<string, Vec3>;
  surfaces: Record<string, Surface>;
}

/** Where a model stands: a floor point (cm) and a turn about +Y (deg, + toward the figure's left). */
export interface Placement {
  at: Vec3;
  yawDeg?: number;
}

export const emptyBuilt = (): Built => ({ prims: [], anchors: {}, surfaces: {} });

export const box = (id: string, center: Vec3, size: Vec3, surface: SurfaceKind, rotation?: Quat): Primitive =>
  rotation ? { kind: 'box', id, center, size, surface, rotation } : { kind: 'box', id, center, size, surface };
export const cyl = (id: string, start: Vec3, end: Vec3, radius: number, surface: SurfaceKind): Primitive => ({ kind: 'cylinder', id, start, end, radius, surface });
export const sphere = (id: string, center: Vec3, radius: number, surface: SurfaceKind, capBelowY?: number): Primitive =>
  capBelowY === undefined ? { kind: 'sphere', id, center, radius, surface } : { kind: 'sphere', id, center, radius, surface, capBelowY };

/** Move a model built at the origin to its placement (turn about +Y, then translate). */
export function placeBuilt(b: Built, placement: Placement): Built {
  const q = fromAxisAngle([0, 1, 0], degToRad(placement.yawDeg ?? 0));
  const P = (v: Vec3): Vec3 => add(rotate(q, v), placement.at);
  const D = (v: Vec3): Vec3 => rotate(q, v);
  const prims = b.prims.map((p): Primitive => {
    if (p.kind === 'box') return box(p.id, P(p.center), p.size, p.surface, placement.yawDeg ? multiply(q, p.rotation ?? [0, 0, 0, 1]) : p.rotation);
    if (p.kind === 'cylinder') return cyl(p.id, P(p.start), P(p.end), p.radius, p.surface);
    const c = P(p.center);
    return sphere(p.id, c, p.radius, p.surface, p.capBelowY === undefined ? undefined : p.capBelowY + (c[1] - p.center[1]));
  });
  const anchors = Object.fromEntries(Object.entries(b.anchors).map(([k, v]) => [k, P(v)]));
  const surfaces = Object.fromEntries(
    Object.entries(b.surfaces).map(([k, s]): [string, Surface] => [
      k,
      s.kind === 'plane' ? { ...s, point: P(s.point), normal: D(s.normal) } : { ...s, center: P(s.center) },
    ]),
  );
  return { prims, anchors, surfaces };
}

/** Combine models into one scene; throws on a duplicate primitive id, anchor or surface. */
export function mergeBuilt(...parts: Built[]): Built {
  const out = emptyBuilt();
  for (const part of parts) {
    for (const p of part.prims) {
      if (out.prims.some((q) => q.id === p.id)) throw new Error(`mergeBuilt: duplicate primitive "${p.id}"`);
      out.prims.push(p);
    }
    for (const [k, v] of Object.entries(part.anchors)) {
      if (k in out.anchors) throw new Error(`mergeBuilt: duplicate anchor "${k}"`);
      out.anchors[k] = v;
    }
    for (const [k, v] of Object.entries(part.surfaces)) {
      if (k in out.surfaces) throw new Error(`mergeBuilt: duplicate surface "${k}"`);
      out.surfaces[k] = v;
    }
  }
  return out;
}

/** A cylinder from `center - axis·len/2` to `center + axis·len/2` (`axis` must be a unit vector). */
export const cylAlong = (id: string, center: Vec3, axis: Vec3, len: number, radius: number, surface: SurfaceKind): Primitive =>
  cyl(id, sub(center, scale(axis, len / 2)), add(center, scale(axis, len / 2)), radius, surface);

/** The floor: y = 0, facing up. Every scene has it. */
export const FLOOR: Surface = { kind: 'plane', point: [0, 0, 0], normal: [0, 1, 0] };
