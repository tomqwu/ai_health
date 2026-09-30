import { describe, expect, it } from 'vitest';
import type { Profile } from '../profile/schema';
import { checkFeasibility } from './feasibility';
import type { GeometryProbe } from './geometry';
import { dumbbellsOnly, fullHomeGym, lowCeiling, nothingMeasured, syntheticCatalog } from './testing/fixtures';

const catalog = syntheticCatalog();
const ex = (id: string) => catalog.exercises.get(id)!;
const probe: GeometryProbe = () => ({ topCm: 180, barCentersCm: [90, 150], rom: [], posing: [] });
const opts = { probes: { 'smith-squat': probe, 'smith-bench-press': probe } };
const check = (id: string, p: Profile) => checkFeasibility(ex(id), p, catalog, opts);

describe('checkFeasibility', () => {
  it('is feasible when every check passes', () => {
    expect(check('smith-squat', fullHomeGym())).toEqual({ status: 'feasible', reasons: [], notes: [] });
    expect(check('plank', dumbbellsOnly())).toEqual({ status: 'feasible', reasons: [], notes: [] });
  });

  describe('1. capabilities', () => {
    it('is infeasible without equipment that provides a required capability, and says which would', () => {
      const r = check('smith-squat', dumbbellsOnly());
      expect(r.status).toBe('infeasible');
      expect(r.reasons).toEqual([
        {
          check: 'capabilities',
          message: { key: 'engine.reason.missingCapability', params: { equipment: [catalog.equipment.get('smith-functional-trainer')!.name] } },
          unlock: { kind: 'equipment', equipmentIds: ['smith-functional-trainer'] },
        },
      ]);
    });
    it('ignores profile equipment that is not in the catalog', () => {
      const p: Profile = { ...dumbbellsOnly(), equipment: [...dumbbellsOnly().equipment, { id: 'mystery-machine', params: {} }] };
      expect(check('smith-squat', p).status).toBe('infeasible');
    });
  });

  describe('2. attachments', () => {
    it('is infeasible when a required attachment is not owned', () => {
      const p: Profile = { ...fullHomeGym(), attachments: ['lat-bar'] };
      expect(check('rope-pushdown', p).reasons).toEqual([
        { check: 'attachments', message: { key: 'engine.reason.missingAttachment', params: { attachment: catalog.attachments.get('rope')!.name } }, unlock: { kind: 'attachment', attachmentId: 'rope' } },
      ]);
    });
    it('is infeasible when an owned attachment fits nothing the user owns', () => {
      const p: Profile = { ...fullHomeGym(), equipment: fullHomeGym().equipment.filter((e) => e.id !== 'smith-functional-trainer') };
      const r = checkFeasibility({ ...ex('rope-pushdown'), requires: { ...ex('rope-pushdown').requires, capabilities: [] } }, p, catalog, opts);
      expect(r.reasons.map((x) => x.message.key)).toEqual(['engine.reason.attachmentNoFit']);
      expect(r.reasons[0]!.unlock).toEqual({ kind: 'equipment', equipmentIds: ['smith-functional-trainer'] });
    });
  });

  describe('3. exclusions', () => {
    it('is infeasible when the user excluded the exercise', () => {
      const p: Profile = { ...fullHomeGym(), exclusions: ['smith-squat'] };
      expect(check('smith-squat', p).reasons).toEqual([
        { check: 'exclusions', message: { key: 'engine.reason.excluded' }, unlock: { kind: 'exclusion', exerciseId: 'smith-squat' } },
      ]);
    });
  });

  describe('4. geometry', () => {
    it('is feasible at typical values when nothing is entered (D12)', () => {
      expect(check('smith-squat', nothingMeasured())).toEqual({ status: 'feasible', reasons: [], notes: [] });
      expect(check('db-shoulder-press', nothingMeasured())).toEqual({
        status: 'feasible',
        reasons: [],
        notes: [{ key: 'engine.note.checkClearance', params: { need: { lengthCm: 243 }, margin: { lengthCm: 10 }, ceiling: { lengthCm: 240 } } }],
      });
    });
    it('is infeasible under a low entered ceiling', () => {
      const r = check('db-shoulder-press', lowCeiling());
      expect(r.status).toBe('infeasible');
      expect(r.reasons.map((x) => x.check)).toEqual(['ceiling']);
    });
    it('checks the measured stops', () => {
      const p: Profile = { ...fullHomeGym(), equipment: fullHomeGym().equipment.map((e) => (e.id === 'smith-functional-trainer' ? { ...e, params: { smithHighestBarHeightCm: 120 } } : e)) };
      const r = check('smith-squat', p);
      expect(r.status).toBe('infeasible');
      expect(r.reasons.map((x) => x.message.key)).toEqual(['engine.reason.barAboveStop']);
    });
    it('skips geometry, and its notes, when the exercise cannot be set up', () => {
      expect(check('db-shoulder-press', { ...nothingMeasured(), equipment: [] })).toMatchObject({ status: 'infeasible', notes: [] });
    });
  });

  it('ignores limitations', () => {
    const p: Profile = { ...fullHomeGym(), limitations: ['knee-sensitive', 'shoulder-sensitive', 'low-back-sensitive', 'wrist-sensitive'] };
    expect(check('split-squat', p).status).toBe('feasible');
  });

  it('uses the default probes when none are given', () => {
    expect(checkFeasibility(ex('smith-squat'), fullHomeGym(), catalog).status).toBe('feasible');
  });
});
