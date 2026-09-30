/**
 * Unit conversion for display (spec §10). Profiles and content are stored in metric; these helpers
 * convert only at the edges (display and input). Cable stacks and owned loads keep their printed unit
 * and are never converted (spec §5.1).
 */
export type LengthUnit = 'cm' | 'in';
export type MassUnit = 'kg' | 'lb';

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Centimetres as shown to the user: whole cm, or inches to one decimal. */
export function cmToDisplay(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? Math.round(cm) : round1(cm / CM_PER_INCH);
}

/** A length the user typed, back to centimetres (one decimal). */
export function displayToCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? round1(value) : round1(value * CM_PER_INCH);
}

/** Kilograms as shown to the user, to one decimal. */
export function kgToDisplay(kg: number, unit: MassUnit): number {
  return unit === 'kg' ? round1(kg) : round1(kg / KG_PER_LB);
}

/** A mass the user typed, back to kilograms (two decimals). */
export function displayToKg(value: number, unit: MassUnit): number {
  const kg = unit === 'kg' ? value : value * KG_PER_LB;
  return Math.round(kg * 100) / 100;
}
