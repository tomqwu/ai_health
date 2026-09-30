import { FIGURES } from '../figure/fixtures';
import { paramValueMatches } from './params';
import { type Attachment, type Equipment, type Exercise, type Template, slotPatterns } from './schemas';
import { GEOMETRY_PARAMS } from './vocab';

/** All generic content, validated and cross-checked. The engine only ever sees this. */
export interface Catalog {
  equipment: ReadonlyMap<string, Equipment>;
  attachments: ReadonlyMap<string, Attachment>;
  exercises: ReadonlyMap<string, Exercise>;
  templates: ReadonlyMap<string, Template>;
}

export interface CatalogInput {
  equipment: readonly Equipment[];
  attachments: readonly Attachment[];
  exercises: readonly Exercise[];
  templates: readonly Template[];
}

export interface CatalogOptions {
  /** Figure spec ids that exist; defaults to the ids in lib/figure/fixtures. */
  figureIds?: ReadonlySet<string>;
}

export class CatalogError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Content catalog has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'CatalogError';
  }
}

function byId<T extends { id: string }>(kind: string, items: readonly T[], problems: string[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) problems.push(`${kind} "${item.id}" is defined twice`);
    map.set(item.id, item);
  }
  return map;
}

/**
 * Index the content and check every cross-reference (spec §5, §14). Throws a CatalogError listing
 * every problem at once, so one build run shows them all.
 */
export function buildCatalog(input: CatalogInput, opts: CatalogOptions = {}): Catalog {
  const problems: string[] = [];
  const figureIds = opts.figureIds ?? new Set(Object.keys(FIGURES));
  const equipment = byId('equipment', input.equipment, problems);
  const attachments = byId('attachment', input.attachments, problems);
  const exercises = byId('exercise', input.exercises, problems);
  const templates = byId('template', input.templates, problems);
  const provided = new Set([...equipment.values()].flatMap((e) => e.capabilities));

  for (const eq of equipment.values()) {
    for (const [name, value] of Object.entries(eq.illustrativeDefaults)) {
      const def = eq.parameters[name];
      if (!def) problems.push(`equipment "${eq.id}": illustrative default "${name}" is not a parameter`);
      else if (!paramValueMatches(def, value)) problems.push(`equipment "${eq.id}": illustrative default "${name}" is not a valid ${def.type}`);
    }
    // D12: the engine uses the typical value whenever the user has not measured, so it must exist.
    for (const name of GEOMETRY_PARAMS) {
      if (eq.parameters[name] && eq.illustrativeDefaults[name] === undefined) {
        problems.push(`equipment "${eq.id}": parameter "${name}" is read by the geometry checks and needs an illustrative default`);
      }
    }
  }

  for (const at of attachments.values()) {
    for (const cap of at.fits) {
      if (!provided.has(cap)) problems.push(`attachment "${at.id}": no equipment provides "${cap}"`);
    }
    const useIds = (at.uses ?? []).map((u) => u.id);
    if (new Set(useIds).size !== useIds.length) problems.push(`attachment "${at.id}": use ids must be unique`);
  }

  for (const ex of exercises.values()) {
    const where = `exercise "${ex.id}"`;
    for (const cap of ex.requires.capabilities) {
      if (!provided.has(cap)) problems.push(`${where}: no equipment provides "${cap}"`);
    }
    for (const id of ex.requires.attachments) {
      const at = attachments.get(id);
      if (!at) {
        problems.push(`${where}: unknown attachment "${id}"`);
        continue;
      }
      const use = ex.requires.attachmentUses[id];
      if (at.uses && use === undefined) problems.push(`${where}: must declare how it uses "${id}"`);
      if (use !== undefined && !at.uses?.some((u) => u.id === use)) problems.push(`${where}: "${id}" has no use "${use}"`);
    }
    for (const id of Object.keys(ex.requires.attachmentUses)) {
      if (!ex.requires.attachments.includes(id)) problems.push(`${where}: declares a use for "${id}" but does not require it`);
    }
    for (const alt of ex.alternatives) {
      if (!exercises.has(alt)) problems.push(`${where}: unknown alternative "${alt}"`);
    }
    if (ex.figure && !figureIds.has(ex.figure.spec)) problems.push(`${where}: unknown figure spec "${ex.figure.spec}"`);
  }

  for (const tpl of templates.values()) {
    for (const day of tpl.days) {
      day.slots.forEach((slot, i) => {
        const patterns = slotPatterns(slot);
        if (![...exercises.values()].some((e) => patterns.includes(e.pattern))) {
          problems.push(`template "${tpl.id}" ${day.weekday}/${i}: no exercise for ${patterns.join(' | ')}`);
        }
      });
    }
  }

  if (problems.length > 0) throw new CatalogError(problems);
  return { equipment, attachments, exercises, templates };
}
