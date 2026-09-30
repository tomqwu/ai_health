/**
 * Deterministic id order for tie-breaks. Compares UTF-16 code units, never the runtime locale, so the
 * build and every browser pick the same exercise from the same inputs (localeCompare differs by locale).
 */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
