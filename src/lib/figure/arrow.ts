export type Point2 = readonly [number, number];

/** SVG path data for an arrow from `from` to `to` (pixels): a shaft and a filled triangular head. */
export function arrowPaths(from: Point2, to: Point2, headLength = 18): { line: string; head: string } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('arrowPaths: zero-length arrow');
  const ux = dx / len;
  const uy = dy / len;
  const bx = to[0] - ux * headLength;
  const by = to[1] - uy * headLength;
  const w = headLength * 0.55;
  const f = (n: number) => n.toFixed(1);
  return {
    line: `M${f(from[0])} ${f(from[1])} L${f(bx)} ${f(by)}`,
    head: `M${f(to[0])} ${f(to[1])} L${f(bx - uy * w)} ${f(by + ux * w)} L${f(bx + uy * w)} ${f(by - ux * w)} Z`,
  };
}

/** Standalone SVG (used to composite arrows onto pre-rendered frames). */
export function arrowSvg(width: number, height: number, from: Point2, to: Point2, color = '#1f6feb'): string {
  const p = arrowPaths(from, to);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<path d="${p.line}" stroke="${color}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="${p.head}" fill="${color}"/></svg>`
  );
}
