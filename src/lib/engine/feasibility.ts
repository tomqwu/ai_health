import type { Catalog } from '../content/catalog';
import type { Exercise } from '../content/schemas';
import type { Message } from '../i18n/format';
import type { Profile } from '../profile/schema';
import { checkGeometry, type ProbeRegistry } from './geometry';
import { ownedCapabilities, providersOf } from './params';
import { DEFAULT_PROBES } from './probes';
import type { Feasibility, Reason } from './types';

export interface EngineOptions {
  /** Pose probes by figure spec id; defaults to DEFAULT_PROBES. Tests pass synthetic ones. */
  probes?: ProbeRegistry;
}

/**
 * Spec §7.1. Checks run in order: capabilities, attachments, exclusions, then geometry. Geometry is
 * skipped when an earlier check fails (the exercise cannot be set up, so it cannot be posed). Unknown
 * inputs use typical values (D12), so the result is always feasible or infeasible. `limitations` never
 * affect feasibility.
 */
export function checkFeasibility(exercise: Exercise, profile: Profile, catalog: Catalog, opts: EngineOptions = {}): Feasibility {
  const reasons: Reason[] = [];
  const caps = ownedCapabilities(profile, catalog);

  // 1. Required capabilities are provided by owned equipment.
  for (const cap of exercise.requires.capabilities) {
    if (caps.has(cap)) continue;
    const providers = providersOf(catalog, [cap]);
    reasons.push({
      check: 'capabilities',
      message: { key: 'engine.reason.missingCapability', params: { equipment: providers.map((e) => e.name) } },
      unlock: { kind: 'equipment', equipmentIds: providers.map((e) => e.id) },
    });
  }

  // 2. Required attachments are owned and fit an owned capability.
  for (const id of exercise.requires.attachments) {
    const at = catalog.attachments.get(id);
    const name = at?.name ?? { en: id, zh: id };
    if (!profile.attachments.includes(id)) {
      reasons.push({ check: 'attachments', message: { key: 'engine.reason.missingAttachment', params: { attachment: name } }, unlock: { kind: 'attachment', attachmentId: id } });
    } else if (at && !at.fits.some((c) => caps.has(c))) {
      reasons.push({
        check: 'attachments',
        message: { key: 'engine.reason.attachmentNoFit', params: { attachment: name } },
        unlock: { kind: 'equipment', equipmentIds: providersOf(catalog, at.fits).map((e) => e.id) },
      });
    }
  }

  // 3. Not excluded by the user.
  if (profile.exclusions.includes(exercise.id)) {
    reasons.push({ check: 'exclusions', message: { key: 'engine.reason.excluded' }, unlock: { kind: 'exclusion', exerciseId: exercise.id } });
  }

  // 4. Geometry, at the profile's or the typical values.
  let notes: Message[] = [];
  if (reasons.length === 0) {
    const geo = checkGeometry(exercise, profile, catalog, opts.probes ?? DEFAULT_PROBES);
    reasons.push(...geo.reasons);
    notes = geo.notes;
  }

  return { status: reasons.length > 0 ? 'infeasible' : 'feasible', reasons, notes };
}
