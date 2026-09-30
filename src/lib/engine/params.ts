import type { Catalog } from '../content/catalog';
import { type ParamValue, paramValueMatches } from '../content/params';
import type { GeometryParam } from '../content/vocab';
import type { Profile } from '../profile/schema';

/**
 * The value the geometry checks use for parameter `name` (D12): the user's own measurement when it is stored
 * with the right shape, otherwise the illustrative default of the owned equipment that defines the
 * parameter. Undefined only when no owned equipment defines it (buildCatalog guarantees a default for
 * every geometry parameter an equipment defines).
 */
export function paramValue(profile: Profile, catalog: Catalog, name: GeometryParam): ParamValue | undefined {
  for (const owned of profile.equipment) {
    const eq = catalog.equipment.get(owned.id);
    const def = eq?.parameters[name];
    if (!eq || !def) continue;
    const measured = owned.params[name];
    if (measured !== undefined && paramValueMatches(def, measured)) return measured;
    return eq.illustrativeDefaults[name];
  }
  return undefined;
}

export function numberParam(profile: Profile, catalog: Catalog, name: GeometryParam): number | undefined {
  const v = paramValue(profile, catalog, name);
  return typeof v === 'number' ? v : undefined;
}

export function boolParam(profile: Profile, catalog: Catalog, name: GeometryParam): boolean | undefined {
  const v = paramValue(profile, catalog, name);
  return typeof v === 'boolean' ? v : undefined;
}

/** Capabilities provided by the owned equipment that exists in the catalog. */
export function ownedCapabilities(profile: Profile, catalog: Catalog): Set<string> {
  return new Set(profile.equipment.flatMap((e) => catalog.equipment.get(e.id)?.capabilities ?? []));
}

/** Catalog equipment providing any of `capabilities`, sorted by id. */
export function providersOf(catalog: Catalog, capabilities: readonly string[]) {
  return [...catalog.equipment.values()].filter((e) => e.capabilities.some((c) => capabilities.includes(c))).sort((a, b) => a.id.localeCompare(b.id));
}
