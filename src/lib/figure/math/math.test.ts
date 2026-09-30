import { describe, expect, it } from 'vitest';
import { add, angleBetweenDeg, cross, distance, normalize, sub, X_AXIS, Y_AXIS, Z_AXIS } from './vec3';
import { angleBetweenQuatsDeg, conjugate, degToRad, fromAxisAngle, fromUnitVectors, IDENTITY, multiply, rotate, slerp } from './quat';

const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

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
