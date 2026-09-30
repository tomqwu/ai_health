import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { AttachmentSchema, EquipmentSchema, ExerciseSchema, TemplateSchema } from './lib/content/schemas';

// Generic knowledge only (spec §4.1). Personal values never live here.
const yamlIn = (dir: string) => glob({ pattern: '*.yaml', base: `./src/content/${dir}` });

export const collections = {
  equipment: defineCollection({ loader: yamlIn('equipment'), schema: EquipmentSchema }),
  attachments: defineCollection({ loader: yamlIn('attachments'), schema: AttachmentSchema }),
  exercises: defineCollection({ loader: yamlIn('exercises'), schema: ExerciseSchema }),
  templates: defineCollection({ loader: yamlIn('templates'), schema: TemplateSchema }),
};
