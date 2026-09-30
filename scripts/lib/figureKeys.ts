import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FigureModel } from '../../src/lib/figure/figures';
import type { EquipmentModel } from '../../src/lib/figure/geometry/models';
import type { SkeletonDef } from '../../src/lib/figure/pose/skeleton';

/** Pre-render size and WebP quality; part of every cache key. */
export const RENDER_SETTINGS = { width: 900, height: 1200, webpQuality: 88, statureCm: 175 } as const;

/** Files whose content changes how a frame is drawn (the renderer and the harness around it). */
export const RENDERER_FILES = [
  'src/lib/figure/scene3d',
  'src/lib/figure/arrow.ts',
  'src/pages/render/[figure].astro',
  'scripts/render-figures.ts',
  'scripts/lib/browser.ts',
  'scripts/lib/figureKeys.ts',
];

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function filesUnder(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? filesUnder(join(path, e.name)) : [join(path, e.name)]))
      .filter((f) => /\.(ts|astro)$/.test(f) && !/\.test\.ts$/.test(f)) // source only: editor swap files and .DS_Store must not change a key
      .sort();
  } catch {
    return [path];
  }
}

/** Version of an installed package (`missing` if it is not installed). */
function versionOf(root: string, pkg: string): string {
  try {
    return (JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'missing';
  }
}

/** Chromium's build, from Playwright's browser list: the software WebGL (SwiftShader) draws with it. */
function chromiumRevision(root: string): string {
  try {
    const list = JSON.parse(readFileSync(join(root, 'node_modules/playwright-core/browsers.json'), 'utf8')) as { browsers: Array<{ name: string; revision: string; browserVersion?: string }> };
    const c = list.browsers.find((b) => b.name === 'chromium');
    return c ? `${c.revision}/${c.browserVersion ?? ''}` : 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * Hash of the renderer: its source files, the versions of three.js, Playwright, its Chromium build and
 * sharp (which encodes the WebP), the human model (by the sha256 that skeleton.json records) and the
 * render settings. Any change re-renders every figure.
 */
export function rendererFingerprint(root: string, skeleton: SkeletonDef): string {
  const h = createHash('sha256');
  for (const f of RENDERER_FILES.flatMap((p) => filesUnder(join(root, p)))) h.update(f.slice(root.length)).update(readFileSync(f));
  for (const pkg of ['three', '@playwright/test', 'sharp']) h.update(`${pkg}@${versionOf(root, pkg)}`);
  h.update(`chromium:${chromiumRevision(root)}`).update(`model:${skeleton.source.sha256}`).update(JSON.stringify(RENDER_SETTINGS));
  return h.digest('hex');
}

/** JSON with numbers rounded to 1e-6, so float noise never changes a key. */
const stable = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x));

/**
 * Cache key of a figure's pre-rendered frames: the renderer fingerprint plus everything the renderer is
 * given — camera, fixed equipment, and each frame's bone rotations, root, props and arrow at the default
 * stature with illustrative equipment. A change that moves nothing on screen keeps the key.
 */
export function figureKey(fig: FigureModel, sk: SkeletonDef, fingerprint: string): string {
  const ctx = { statureCm: RENDER_SETTINGS.statureCm };
  const frames = fig.frames.map((_, i) => {
    const p = fig.pose(sk, i, ctx);
    return { local: p.local, root: p.rootPosition, scale: p.scaleFactor, props: p.props, arrow: p.arrow };
  });
  return sha256(stable({ fingerprint, id: fig.id, camera: fig.camera(ctx), scene: fig.scene(sk, ctx).prims, frames }));
}

/** Cache key of an equipment still. */
export function equipmentKey(model: EquipmentModel, fingerprint: string): string {
  return sha256(stable({ fingerprint, id: model.id, view: model.view, prims: model.build().prims }));
}
