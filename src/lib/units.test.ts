import { describe, expect, it } from 'vitest';
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay } from './units';

describe('length', () => {
  it('shows whole centimetres or inches to one decimal', () => {
    expect(cmToDisplay(175.4, 'cm')).toBe(175);
    expect(cmToDisplay(175, 'in')).toBe(68.9);
    expect(cmToDisplay(254, 'in')).toBe(100);
  });
  it('converts typed values back to centimetres', () => {
    expect(displayToCm(68.9, 'in')).toBe(175);
    expect(displayToCm(180, 'cm')).toBe(180);
  });
  it('round-trips within a millimetre', () => {
    for (const cm of [150, 162.5, 175, 185, 230, 275]) {
      expect(Math.abs(displayToCm(cmToDisplay(cm, 'in'), 'in') - cm)).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('mass', () => {
  it('converts between kilograms and pounds', () => {
    expect(kgToDisplay(20, 'lb')).toBe(44.1);
    expect(kgToDisplay(20, 'kg')).toBe(20);
    expect(displayToKg(45, 'lb')).toBe(20.41);
    expect(displayToKg(12.5, 'kg')).toBe(12.5);
  });
});
