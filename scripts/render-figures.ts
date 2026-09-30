import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { arrowSvg } from '../src/lib/figure/arrow';
import { FIGURES } from '../src/lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../src/lib/figure/geometry/models';
import { REAL_SKELETON } from '../src/lib/figure/pose/realSkeleton';
import { removeStaleTempFiles, writeFileAtomic } from './lib/atomicWrite';
import { SOFTWARE_WEBGL_ARGS } from './lib/browser';
import { equipmentKey, figureKey, RENDER_SETTINGS, rendererFingerprint } from './lib/figureKeys';
import { distinctColors } from './lib/imageCheck';

/**
 * Pre-renders every figure frame and equipment still into public/figures/ (spec §8.4, D11). Each output
 * is cached in .cache/figures/<key>/ under a content hash of what it draws (scripts/lib/figureKeys.ts),
 * so only changed figures are rendered. Flags:
 *   --force            render everything, ignoring the cache
 *   --keys <file>      write the list of cache keys to <file> and exit (CI uses it as the cache key)
 */
type Arrow = { from: [number, number]; to: [number, number] } | null;
type Ready = { arrow: Arrow; width: number; height: number };
type Harness = {
  renderFigure(id: string, frame: number): Promise<Ready>;
  renderEquipment(id: string): Promise<Ready>;
};
type Win = { __figureHarness?: Harness; __figureError?: string };
interface Job {
  kind: 'figure' | 'equipment';
  id: string;
  frame: number;
  key: string;
  /** Path under public/figures/ and under the key's cache folder. */
  file: string;
}

const PORT = 4329;
const HARNESS = `http://127.0.0.1:${PORT}/ai_health/render/figure/`;
const OUT = 'public/figures';
const CACHE = '.cache/figures';
/** A blank or failed WebGL frame has a handful of colours; a figure has thousands, a lone piece of equipment hundreds. */
const MIN_COLORS = { figure: 200, equipment: 50 } as const;

const args = process.argv.slice(2);
const force = args.includes('--force');
const keysFlag = args.indexOf('--keys');
const keysFile = keysFlag >= 0 ? args[keysFlag + 1] : undefined;
if (keysFlag >= 0 && !keysFile) {
  console.error('--keys needs a file argument');
  process.exit(1);
}

const fingerprint = rendererFingerprint(process.cwd(), REAL_SKELETON);
const jobs: Job[] = [
  ...Object.values(FIGURES).flatMap((fig) => {
    const key = figureKey(fig, REAL_SKELETON, fingerprint);
    return fig.frames.map((_, frame) => ({ kind: 'figure' as const, id: fig.id, frame, key, file: `${fig.id}/frame-${frame}.webp` }));
  }),
  ...Object.values(EQUIPMENT_MODELS).map((m) => ({ kind: 'equipment' as const, id: m.id, frame: 0, key: equipmentKey(m, fingerprint), file: `equipment/${m.id}.webp` })),
];

if (keysFile) {
  await mkdir(dirname(keysFile), { recursive: true });
  await writeFile(keysFile, `${[...new Set(jobs.map((j) => `${j.file} ${j.key}`))].join('\n')}\n`);
  console.log(`Wrote ${jobs.length} cache keys to ${keysFile}`);
  process.exit(0);
}

const cached = (j: Job) => join(CACHE, j.key, j.file.replace(/\//g, '__'));
const pending: Job[] = [];
for (const j of jobs) {
  await mkdir(dirname(join(OUT, j.file)), { recursive: true });
  if (!force && existsSync(cached(j))) await copyFile(cached(j), join(OUT, j.file));
  else pending.push(j);
}
// Keep the cache to what the current figures use, without temp files from a killed run.
const live = new Set(jobs.map((j) => j.key));
if (existsSync(CACHE))
  for (const d of await readdir(CACHE)) {
    if (!live.has(d)) await rm(join(CACHE, d), { recursive: true, force: true });
    else await removeStaleTempFiles(join(CACHE, d));
  }
console.log(`${jobs.length - pending.length} of ${jobs.length} images from the cache; rendering ${pending.length}`);
if (pending.length === 0) process.exit(0);

/** The dev server exited (or could not start) before it became ready. */
class ServerExitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

/** True if something already accepts connections on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });
}

if (await portInUse(PORT)) {
  console.error(`Port ${PORT} is already in use, probably by a stale Astro dev server. Run "npx astro dev stop" (or stop whatever else is using the port) and try again.`);
  process.exit(1);
}

// --ignore-lock keeps Astro 7 in the foreground even when it detects an AI agent, so kill() really stops it.
const server = spawn('node_modules/.bin/astro', ['dev', '--port', String(PORT), '--ignore-lock', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
let serverFailure: ServerExitError | undefined;
const serverStopped = new Promise<void>((resolve) => {
  server.once('exit', (code, signal) => {
    serverFailure ??= new ServerExitError(`astro dev exited before it was ready (${signal ? `signal ${signal}` : `exit code ${code}`})`, code || 1); // a clean exit is still a failure: no frames were rendered
    resolve();
  });
  server.once('error', (err) => {
    serverFailure ??= new ServerExitError(`Could not start astro dev: ${err.message}`, 1);
    resolve();
  });
});

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (serverFailure) throw serverFailure;
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // server not up yet
    }
    await Promise.race([new Promise((r) => setTimeout(r, 500)), serverStopped]);
  }
  throw new Error(`Dev server did not start: ${url}`);
}

/** Page errors so far; any one fails the run, and no image rendered after it is cached. */
const errors: string[] = [];
const pageErrors = () => `Page errors while rendering:\n${errors.join('\n')}`;

async function render(page: Page, j: Job): Promise<void> {
  const ready = await page.evaluate(
    ([kind, id, frame]) => {
      const h = (window as unknown as Win).__figureHarness!;
      return kind === 'figure' ? h.renderFigure(id, frame) : h.renderEquipment(id);
    },
    [j.kind, j.id, j.frame] as const,
  );
  const png = await page.locator('canvas#figure-canvas').screenshot();
  // Before anything is written: a frame drawn while the page had thrown (e.g. a prop that failed to load) must never reach the cache.
  if (errors.length) throw new Error(pageErrors());
  const colors = await distinctColors(png);
  if (colors < MIN_COLORS[j.kind]) throw new Error(`${j.file} looks blank (${colors} colours)`);
  const layers = ready.arrow ? [{ input: Buffer.from(arrowSvg(ready.width, ready.height, ready.arrow.from, ready.arrow.to)) }] : [];
  const webp = await sharp(png).composite(layers).webp({ quality: RENDER_SETTINGS.webpQuality }).toBuffer();
  // Each file goes in whole (temp file, then rename), so an interrupted run leaves no truncated image that a later run would take as a hit.
  await writeFileAtomic(cached(j), webp);
  await writeFileAtomic(join(OUT, j.file), webp);
  console.log(`rendered ${j.file} (${colors} colours)`);
}

let browser: Browser | undefined;
try {
  await waitForServer(HARNESS);
  browser = await chromium.launch({ args: SOFTWARE_WEBGL_ARGS });
  const page = await browser.newPage({ viewport: { width: RENDER_SETTINGS.width, height: RENDER_SETTINGS.height } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HARNESS);
  const ready = await page.waitForFunction(() => (window as unknown as Win).__figureHarness ?? (window as unknown as Win).__figureError, null, { timeout: 120_000 });
  const state = await ready.jsonValue();
  if (typeof state === 'string') throw new Error(`Render harness failed: ${state}`);
  for (const j of pending) await render(page, j);
  if (errors.length) throw new Error(pageErrors());
} catch (err) {
  // Fail with Astro's own exit code; anything else keeps its stack trace.
  if (!(err instanceof ServerExitError)) throw err;
  console.error(err.message);
  process.exitCode = err.exitCode;
} finally {
  await browser?.close();
  server.kill();
}
