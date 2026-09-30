import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fromAxisAngle, multiply, rotate, type Quat } from '../math/quat';
import type { Vec3 } from '../math/vec3';

// Pins the "three.js semantics" contract the pure pose layer relies on: the hand-rolled quaternion
// math must agree component-wise with three.js. (Math classes need no DOM, so this runs under Node.)
const quats: Quat[] = [
  fromAxisAngle([1, 0, 0], 0.7),
  fromAxisAngle([0, 1, 0], -1.9),
  fromAxisAngle([0.3, -0.5, 0.8], 2.6),
  fromAxisAngle([-1, 2, 0.4], 0.05),
  fromAxisAngle([0, 0, 1], Math.PI),
];
const vectors: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [3.5, -2.25, 7.1],
  [-40, 12.5, 0.75],
];
const tq = (q: Quat) => new THREE.Quaternion(q[0], q[1], q[2], q[3]);

describe('quat.ts parity with three.js', () => {
  it('multiply(a, b) matches THREE.Quaternion.multiply', () => {
    for (const a of quats) {
      for (const b of quats) {
        const expected = tq(a).multiply(tq(b));
        const got = multiply(a, b);
        expect(got[0]).toBeCloseTo(expected.x, 12);
        expect(got[1]).toBeCloseTo(expected.y, 12);
        expect(got[2]).toBeCloseTo(expected.z, 12);
        expect(got[3]).toBeCloseTo(expected.w, 12);
      }
    }
  });

  it('rotate(q, v) matches Vector3.applyQuaternion', () => {
    for (const q of quats) {
      for (const v of vectors) {
        const expected = new THREE.Vector3(...v).applyQuaternion(tq(q));
        const got = rotate(q, v);
        expect(got[0]).toBeCloseTo(expected.x, 10);
        expect(got[1]).toBeCloseTo(expected.y, 10);
        expect(got[2]).toBeCloseTo(expected.z, 10);
      }
    }
  });

  it('composition order: rotating by multiply(a, b) equals rotating by b then a', () => {
    const [a, b] = [quats[0]!, quats[2]!];
    const v: Vec3 = [3.5, -2.25, 7.1];
    const viaThree = new THREE.Vector3(...v).applyQuaternion(tq(b)).applyQuaternion(tq(a));
    const got = rotate(multiply(a, b), v);
    expect(got[0]).toBeCloseTo(viaThree.x, 10);
    expect(got[1]).toBeCloseTo(viaThree.y, 10);
    expect(got[2]).toBeCloseTo(viaThree.z, 10);
  });
});
