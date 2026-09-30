import { getCollection } from 'astro:content';
import { buildCatalog, CatalogError, type Catalog } from './lib/content/catalog';

let cached: Promise<Catalog> | undefined;

/**
 * The validated content catalog, for page frontmatter (build time). This is the only module that reads
 * content collections for the engine; it throws — failing the build — on any broken cross-reference.
 */
export function loadCatalog(): Promise<Catalog> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Catalog> {
  const [equipment, attachments, exercises, templates] = await Promise.all([
    getCollection('equipment'),
    getCollection('attachments'),
    getCollection('exercises'),
    getCollection('templates'),
  ]);
  const misnamed = [...equipment, ...attachments, ...exercises, ...templates]
    .filter((e) => e.id !== e.data.id)
    .map((e) => `${e.collection}: file "${e.id}.yaml" must be named after its id "${e.data.id}"`);
  if (misnamed.length > 0) throw new CatalogError(misnamed);
  return buildCatalog({
    equipment: equipment.map((e) => e.data),
    attachments: attachments.map((e) => e.data),
    exercises: exercises.map((e) => e.data),
    templates: templates.map((e) => e.data),
  });
}
