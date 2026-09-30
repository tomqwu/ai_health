/**
 * The figure sweep (spec §14): every figure × keyframe × stature {150, 165, 175, 190, 200}, and the
 * in-between poses the viewer's Play shows, pass every validator on the committed human with illustrative
 * equipment — errors and warnings alike, so a body part sinking into equipment is caught too — unless the
 * figure declares that case an expected failure, which must then really fail with the checks it names.
 */
import { describe, expect, it } from 'vitest';
import { FIGURES } from '../../src/lib/figure/fixtures';
import type { FrameRef } from '../../src/lib/figure/figures';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';

export const SWEEP_STATURES = [150, 165, 175, 190, 200] as const;
const BETWEEN = [0.25, 0.5, 0.75];
/**
 * Play poses a figure on every animation frame, so its cost is budgeted in solver runs, which do not
 * depend on the machine: settling an in-between pose may take two solves plus two secant steps, then
 * the pose itself. A search that runs out of steps (1 + 1 + SETTLE_STEPS + 1 = 8) has not converged.
 * In the dry run the most any figure needed was 4. Each solve takes well under 1 ms on a laptop.
 */
const PLAY_MAX_SOLVES = 5;
/** A loose wall-clock sanity bound (ms per unvalidated in-between pose), far above any machine's cost. */
const PLAY_SANITY_MS = 100;

describe.each(Object.values(FIGURES).map((f) => [f.id, f] as const))('figure %s', (_id, fig) => {
  const refs: Array<{ name: string; ref: FrameRef }> = [
    ...fig.frames.map((f, i) => ({ name: f.id, ref: i })),
    ...fig.playOrder.slice(0, -1).flatMap((from, s) => BETWEEN.map((t) => ({ name: `${fig.frames[from]!.id}→${fig.frames[fig.playOrder[s + 1]!]!.id}@${t}`, ref: { from, to: fig.playOrder[s + 1]!, t } }))),
  ];
  it.each(SWEEP_STATURES)(
    'poses cleanly at %i cm',
    (statureCm) => {
      const expected = fig.expectedFailures.find((e) => e.statures.includes(statureCm));
      const found = refs.map(({ name, ref }) => ({ name, findings: fig.pose(REAL_SKELETON, ref, { statureCm }).findings }));
      if (!expected) {
        for (const e of found) expect(e.findings.map((f) => `${f.severity} ${f.check}: ${f.message}`), `${statureCm} cm / ${e.name}`).toEqual([]);
        return;
      }
      const failed = found.flatMap((e) => e.findings.map((f) => f.check));
      expect(failed.length, `expected failure "${expected.reason}" no longer fails`).toBeGreaterThan(0);
      expect([...new Set(failed)].every((c) => expected.checks.includes(c)), `unexpected checks: ${failed.join(', ')}`).toBe(true);
    },
    30_000,
  );
  it('poses in-between frames cheaply enough for Play', () => {
    const between = (i: number): FrameRef => ({ from: fig.playOrder[i % (fig.playOrder.length - 1)]!, to: fig.playOrder[(i % (fig.playOrder.length - 1)) + 1]!, t: ((i * 7) % 10) / 10 + 0.05 });
    const n = 20;
    const start = performance.now();
    for (const statureCm of SWEEP_STATURES) {
      for (let i = 0; i < n; i++) {
        const { solves } = fig.pose(REAL_SKELETON, between(i), { statureCm }, { validate: false });
        expect(solves, `${statureCm} cm, in-between pose ${i}`).toBeLessThanOrEqual(PLAY_MAX_SOLVES);
      }
    }
    expect((performance.now() - start) / (n * SWEEP_STATURES.length)).toBeLessThan(PLAY_SANITY_MS);
  });
});
