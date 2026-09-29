import { type Vec3, cross, dot, normalize } from './vec3';

/** Unit quaternion [x, y, z, w] — same component order as three.js. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export function fromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angleRad / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angleRad / 2)];
}

/** a * b: the result rotates by b first, then by a. */
export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inverse of a unit quaternion. */
export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l === 0) throw new Error('normalizeQuat: zero quaternion');
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate vector v by unit quaternion q (same math as three.js Vector3.applyQuaternion). */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

/** Shortest rotation taking direction `from` onto direction `to` (three.js setFromUnitVectors). */
export function fromUnitVectors(from: Vec3, to: Vec3): Quat {
  const f = normalize(from);
  const t = normalize(to);
  const r = dot(f, t) + 1;
  if (r < 1e-9) {
    // Opposite directions: 180° about any axis orthogonal to `from`.
    return normalizeQuat(Math.abs(f[0]) > Math.abs(f[2]) ? [-f[1], f[0], 0, 0] : [0, -f[2], f[1], 0]);
  }
  const c = cross(f, t);
  return normalizeQuat([c[0], c[1], c[2], r]);
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    cos = -cos;
  }
  if (cos > 0.9995) {
    return normalizeQuat([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** Angle of the rotation taking a to b, in degrees (0..180). */
export function angleBetweenQuatsDeg(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return radToDeg(2 * Math.acos(Math.min(1, d)));
}
