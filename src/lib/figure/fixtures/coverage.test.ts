import { describe, expect, it } from 'vitest';
import { FIGURES } from '.';
import { CARDIO_PATTERNS, PATTERNS } from '../../content/vocab';

/**
 * M3 poses one representative figure per movement pattern (spec §5.4) except the two cardio patterns,
 * whose machine sessions may omit figures (§5.3). M5 adds the rest of the v1 exercises. Each figure
 * task adds its rows here.
 */
const BY_PATTERN = {
  'horizontal-push': 'smith-bench-press',
  'incline-push': 'db-incline-press',
  'vertical-push': 'db-shoulder-press',
  squat: 'smith-squat',
  'elbow-flexion': 'db-curl',
} as const;

describe('M3 figure coverage', () => {
  it('has a figure for every pattern posed so far, and no others', () => {
    expect(Object.keys(FIGURES).sort()).toEqual(Object.values(BY_PATTERN).sort());
  });
  it('uses only the non-cardio patterns of the content vocabulary', () => {
    const nonCardio = PATTERNS.filter((p) => !CARDIO_PATTERNS.includes(p));
    for (const p of Object.keys(BY_PATTERN)) expect(nonCardio, p).toContain(p);
  });
});
