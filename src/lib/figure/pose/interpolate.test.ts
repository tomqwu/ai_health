import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, length, type Vec3 } from '../math/vec3';
import { interpolatePoseFrame, slerpDir } from './interpolate';
import { bothArms, bothLegs } from './poseSpec';
import { STAND, stand } from './testing/frames';

describe('slerpDir', () => {
  it('turns along the shorter arc at a steady rate', () => {
    const mid = slerpDir([1, 0, 0], [0, 1, 0], 0.5);
    expect(mid[0]).toBeCloseTo(Math.SQRT1_2);
    expect(mid[1]).toBeCloseTo(Math.SQRT1_2);
    expect(angleBetweenDeg(slerpDir([1, 0, 0], [0, 0, 1], 0.25), [1, 0, 0])).toBeCloseTo(22.5);
  });
  it('picks a side for opposite directions instead of passing through zero', () => {
    expect(length(slerpDir([0, 0, 1], [0, 0, -1], 0.5))).toBeCloseTo(1);
  });
});

describe('interpolatePoseFrame', () => {
  const low = stand({ trunk: { hips: { bodyCm: [0, 80, 0] }, pitchDeg: 20 } });
  it('blends numbers and keeps names, labels and flags from the first frame', () => {
    const f = interpolatePoseFrame(STAND, low, 0.5);
    expect(f.trunk.hips.bodyCm).toEqual([0, 84.75, 0]);
    expect(f.trunk.pitchDeg).toBeCloseTo(10);
    expect(f.label).toBe(STAND.label);
    expect(f.id).toBe('stand>stand@0.5');
    expect(f.arrow).toBeUndefined();
  });
  it('swings a hand placed from a shoulder around it (length blends, direction turns)', () => {
    const up = stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [0, 55, 0] } }) });
    const down = stand({ arms: bothArms({ ...STAND.arms.l, to: { from: 'body.shoulder_l', bodyCm: [55, 0, 0] } }) });
    const mid = interpolatePoseFrame(up, down, 0.5).arms.l.to as { bodyCm: Vec3 };
    expect(length(mid.bodyCm)).toBeCloseTo(55);
  });
  it('turns directions (palms, poles) instead of blending them straight', () => {
    const a = stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }) });
    const b = stand({ arms: bothArms({ ...STAND.arms.l, hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, -1] } }) });
    const h = interpolatePoseFrame(a, b, 0.5).arms.l.hand;
    expect(h.grip === 'bar' && length(h.palm)).toBeCloseTo(1);
  });
  it('keeps only the contacts both frames declare, and a foot is flat only when flat in both', () => {
    const a = stand({ contacts: [{ part: 'pelvis', on: 'floor' }, { part: 'chest', on: 'floor' }] });
    const b = stand({ contacts: [{ part: 'chest', on: 'floor' }], legs: bothLegs({ ...STAND.legs.l, contact: 'ball' }), hanging: true });
    const f = interpolatePoseFrame(a, b, 0.5);
    expect(f.contacts).toEqual([{ part: 'chest', on: 'floor' }]);
    expect(f.legs.l.contact).toBe('ball');
    expect(f.hanging).toBe(false);
  });
  it('drops a hand contact unless the hand is flat on a surface in both frames', () => {
    const flat = bothArms({ to: { from: 'body.shoulder_l', yFromFloor: true, bodyCm: [5, 0, 30] }, elbow: [0, 0, -1], hand: { grip: 'flat', palm: [0, -1, 0], fingers: [0, 0, 1] } });
    expect(interpolatePoseFrame(stand({ arms: flat }), stand({ arms: flat }), 0.5).arms.l.contact).toBeUndefined();
    expect(interpolatePoseFrame(stand({ arms: flat }), STAND, 0.5).arms.l.contact).toBe(false);
  });
  it('refuses points measured from different anchors', () => {
    const other = stand({ trunk: { hips: { from: 'body.head', bodyCm: [0, 0, 0] } } });
    expect(() => interpolatePoseFrame(STAND, other, 0.5)).toThrow(/same anchor/);
  });
});
