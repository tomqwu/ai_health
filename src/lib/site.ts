/** The configured site base; "/" outside Vite (e.g. plain tsx scripts), where import.meta.env is undefined. */
export const SITE_BASE: string = import.meta.env?.BASE_URL ?? '/';

/** Join the site base (e.g. "/ai_health/") with a relative path, with exactly one slash between them. */
export function withBase(path: string, base: string = SITE_BASE): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}${path.replace(/^\/+/, '')}`;
}
