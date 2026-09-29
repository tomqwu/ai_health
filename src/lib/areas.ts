import type { MessageKey } from './i18n';

/** A top-level area of the site. New areas (nutrition, tracking…) are added here and nowhere else. */
export interface Area {
  id: string;
  /** URL segment under /<lang>/ */
  path: string;
  titleKey: MessageKey;
  summaryKey: MessageKey;
}

export const AREAS: readonly Area[] = [
  { id: 'fitness', path: 'fitness', titleKey: 'area.fitness.title', summaryKey: 'area.fitness.summary' },
];
