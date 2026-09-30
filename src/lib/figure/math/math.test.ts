import { describe, expect, it } from 'vitest';
import { add, angleBetweenDeg, cross, distance, dot, lerp, midpoint, normalize, scale, sub, X_AXIS, Y_AXIS, Z_AXIS, type Vec3 } from './vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, rotate, slerp, type Quat } from './quat';

const close = (a: readonly number[], b: readonly number[], digits = 9) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};

/** Component-wise comparison of two quaternions, treating q and -q as the same rotation. */
const closeQuat = (a: Quat, b: Quat, digits = 9) => {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  close(a, b.map((c) => c * sign), digits);
};

describe('vec3', () => {
  it('adds, subtracts and measures', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
  });
  it('cross follows the right-hand rule', () => {
    expect(cross(X_AXIS, Y_AXIS)).toEqual(Z_AXIS);
  });
  it('normalize rejects zero vectors', () => {
    expect(() => normalize([0, 0, 0])).toThrow(/zero-length/);
  });
  it('angleBetweenDeg', () => {
    expect(angleBetweenDeg(X_AXIS, Y_AXIS)).toBeCloseTo(90);
    expect(angleBetweenDeg([1, 1, 0], X_AXIS)).toBeCloseTo(45);
  });
});

describe('quat', () => {
  it('rotates +Y toward +Z for a positive rotation about +X', () => {
    close(rotate(fromAxisAngle(X_AXIS, degToRad(90)), Y_AXIS), [0, 0, 1]);
  });
  it('rotates +Z toward +X for a positive rotation about +Y', () => {
    close(rotate(fromAxisAngle(Y_AXIS, degToRad(90)), Z_AXIS), [1, 0, 0]);
  });
  it('multiply applies the right operand first', () => {
    const qx = fromAxisAngle(X_AXIS, degToRad(90));
    const qy = fromAxisAngle(Y_AXIS, degToRad(90));
    close(rotate(multiply(qy, qx), Y_AXIS), [1, 0, 0]);
  });
  it('conjugate inverts', () => {
    const q = fromAxisAngle([1, 2, 3], 0.7);
    close(multiply(q, conjugate(q)), IDENTITY);
  });
  it('fromUnitVectors maps from onto to, including opposite vectors', () => {
    close(rotate(fromUnitVectors([1, 0, 0], [0, 0, 5]), X_AXIS), [0, 0, 1]);
    close(rotate(fromUnitVectors(Y_AXIS, [0, -1, 0]), Y_AXIS), [0, -1, 0]);
  });
  it('slerp halfway is half the angle', () => {
    const b = fromAxisAngle(Z_AXIS, degToRad(80));
    expect(angleBetweenQuatsDeg(IDENTITY, slerp(IDENTITY, b, 0.5))).toBeCloseTo(40);
  });
});

describe('vec3 (extra)', () => {
  it('cross of generic vectors', () => {
    expect(cross([1, 2, 3], [4, 5, 6])).toEqual([-3, 6, -3]);
  });
  it('lerp and midpoint', () => {
    close(lerp([0, 0, 0], [10, 20, 30], 0.25), [2.5, 5, 7.5]);
    close(midpoint([2, -4, 6], [10, 8, -2]), [6, 2, 2]);
  });
  it('angleBetweenDeg of opposite vectors is 180', () => {
    expect(angleBetweenDeg([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180);
  });
});

describe('quat rotation composition', () => {
  const a = fromAxisAngle([1, 2, 3], 0.9);
  const b = fromAxisAngle([-2, 1, 0.5], 2.1);
  const c = fromAxisAngle([0.3, -1, 4], -1.3);
  const vs: Vec3[] = [
    [1, 2, 3],
    [-0.5, 4, 2.5],
    [3, -1, -2],
  ];

  it('rotate(multiply(a, b), v) equals rotate(a, rotate(b, v))', () => {
    for (const [p, q] of [
      [a, b],
      [b, a],
      [b, c],
      [c, a],
    ] as const) {
      for (const v of vs) close(rotate(multiply(p, q), v), rotate(p, rotate(q, v)));
    }
  });
  it('multiply is not commutative (order matters)', () => {
    const v: Vec3 = [1, 2, 3];
    const ab = rotate(multiply(a, b), v);
    const ba = rotate(multiply(b, a), v);
    expect(Math.abs(ab[0] - ba[0]) + Math.abs(ab[1] - ba[1]) + Math.abs(ab[2] - ba[2])).toBeGreaterThan(0.1);
  });
  it('rotate matches Rodrigues formula', () => {
    for (const [axis, theta] of [
      [[1, 2, 3], 0.9],
      [[-2, 1, 0.5], 2.1],
      [[0.3, -1, 4], -1.3],
      [[1, 1, 1], Math.PI],
    ] as const) {
      const k = normalize(axis);
      for (const v of vs) {
        const kxv = cross(k, v);
        const expected = add(
          add(scale(v, Math.cos(theta)), scale(kxv, Math.sin(theta))),
          scale(k, dot(k, v) * (1 - Math.cos(theta))),
        );
        close(rotate(fromAxisAngle(axis, theta), v), expected);
      }
    }
  });
});

describe('fromUnitVectors opposite vectors', () => {
  const cases: [string, Vec3, Vec3][] = [
    ['|x| > |z| arm', [1, 0.2, 0], [-1, -0.2, 0]],
    ['|x| <= |z| arm', [0, 0.2, 1], [0, -0.2, -1]],
    ['diagonal (pins the 1e-9 threshold)', [1, 1, 0], [-1, -1, 0]],
  ];
  for (const [name, from, to] of cases) {
    it(`maps from onto to: ${name}`, () => {
      const q = fromUnitVectors(from, to);
      close(rotate(q, normalize(from)), normalize(to));
      expect(angleBetweenQuatsDeg(IDENTITY, q)).toBeCloseTo(180);
    });
  }
});

describe('slerp (extra)', () => {
  const a = fromAxisAngle(Z_AXIS, degToRad(30));
  const b = fromAxisAngle(Z_AXIS, degToRad(110));
  const at = (deg: number) => fromAxisAngle(Z_AXIS, degToRad(deg));

  it('matches the expected quaternion at t = 0, 0.25 and 1', () => {
    closeQuat(slerp(a, b, 0), a);
    closeQuat(slerp(a, b, 0.25), at(50));
    closeQuat(slerp(a, b, 1), b);
  });
  it('takes the short path when b is negated', () => {
    const nb: Quat = [-b[0], -b[1], -b[2], -b[3]];
    closeQuat(slerp(a, nb, 0), a);
    closeQuat(slerp(a, nb, 0.25), at(50));
    closeQuat(slerp(a, nb, 1), b);
    expect(angleBetweenQuatsDeg(a, slerp(a, nb, 0.5))).toBeCloseTo(40);
  });
  it('near-identical rotations use the normalized lerp branch accurately', () => {
    const small = fromAxisAngle([1, 2, 3], degToRad(1));
    expect(angleBetweenQuatsDeg(IDENTITY, slerp(IDENTITY, small, 0.5))).toBeCloseTo(0.5, 6);
    const nSmall: Quat = [-small[0], -small[1], -small[2], -small[3]];
    expect(angleBetweenQuatsDeg(IDENTITY, slerp(IDENTITY, nSmall, 0.5))).toBeCloseTo(0.5, 6);
  });
  it('identical inputs return the same quaternion', () => {
    const q = fromAxisAngle([1, 2, 3], 0.7);
    closeQuat(slerp(q, q, 0), q);
    closeQuat(slerp(q, q, 0.3), q);
    closeQuat(slerp(q, q, 1), q);
  });
});

describe('angleBetweenQuatsDeg', () => {
  it('treats q and -q as the same rotation (double cover)', () => {
    expect(angleBetweenQuatsDeg(IDENTITY, [-0, -0, -0, -1])).toBeCloseTo(0);
  });
  it('measures a known rotation', () => {
    expect(angleBetweenQuatsDeg(IDENTITY, fromAxisAngle([1, 2, 3], degToRad(70)))).toBeCloseTo(70);
  });
});
