/** Join the site base (e.g. "/ai_health/") with a relative path, with exactly one slash between them. */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}${path.replace(/^\/+/, '')}`;
}
