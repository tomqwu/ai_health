import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { connect } from 'node:net';
import { chromium, type Browser } from '@playwright/test';
import sharp from 'sharp';
import { arrowSvg } from '../src/lib/figure/arrow';
import { SOFTWARE_WEBGL_ARGS } from './lib/browser';
import { distinctColors } from './lib/imageCheck';

type Arrow = { from: [number, number]; to: [number, number] } | null;
type Ready = { arrow: Arrow; width: number; height: number };
type Win = { __figureList?: Array<{ id: string; frames: number }>; __figureReady?: Ready; __figureError?: string };

const PORT = 4329;
const HARNESS = `http://127.0.0.1:${PORT}/ai_health/render/figure/`;
const OUT = 'public/figures';
const MIN_COLORS = 200;

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

let browser: Browser | undefined;
try {
  await waitForServer(`${HARNESS}?list=1`);
  browser = await chromium.launch({ args: SOFTWARE_WEBGL_ARGS });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors: string[] = [];
  // Rejects on the first page error so a broken harness fails fast instead of waiting out each timeout.
  const firstPageError = new Promise<never>((_, reject) => page.once('pageerror', (e) => reject(e)));
  firstPageError.catch(() => {});
  page.on('pageerror', (e) => errors.push(e.message));
  const orPageError = <T>(label: string, wait: Promise<T>): Promise<T> =>
    Promise.race([
      wait,
      firstPageError.catch((e: Error): never => {
        throw new Error(`${label}: page error: ${e.message}`);
      }),
    ]);

  await page.goto(`${HARNESS}?list=1`);
  const listHandle = await orPageError('figure list', page.waitForFunction(() => (window as unknown as Win).__figureList));
  const list = (await listHandle.jsonValue())!;

  let rendered = 0;
  for (const fig of list) {
    await mkdir(`${OUT}/${fig.id}`, { recursive: true });
    for (let frame = 0; frame < fig.frames; frame++) {
      await page.goto(`${HARNESS}?figure=${fig.id}&frame=${frame}`);
      const handle = await orPageError(
        `${fig.id} frame ${frame}`,
        page.waitForFunction(() => (window as unknown as Win).__figureReady ?? (window as unknown as Win).__figureError, null, {
          timeout: 120_000,
        }),
      );
      const ready = (await handle.jsonValue()) as Ready | string;
      if (typeof ready === 'string') throw new Error(`${fig.id} frame ${frame}: ${ready}`);
      const png = await page.locator('canvas#figure-canvas').screenshot();
      const colors = await distinctColors(png);
      if (colors < MIN_COLORS) throw new Error(`${fig.id} frame ${frame} looks blank (${colors} colours)`);
      const layers = ready.arrow ? [{ input: Buffer.from(arrowSvg(ready.width, ready.height, ready.arrow.from, ready.arrow.to)) }] : [];
      await sharp(png).composite(layers).webp({ quality: 88 }).toFile(`${OUT}/${fig.id}/frame-${frame}.webp`);
      rendered++;
      console.log(`rendered ${fig.id} frame ${frame} (${colors} colours)`);
    }
  }
  if (rendered === 0) throw new Error('No figure frames were rendered (empty figure list)');
  if (errors.length) throw new Error(`Page errors while rendering:\n${errors.join('\n')}`);
} catch (err) {
  // Fail with Astro's own exit code; anything else keeps its stack trace.
  if (!(err instanceof ServerExitError)) throw err;
  console.error(err.message);
  process.exitCode = err.exitCode;
} finally {
  await browser?.close();
  server.kill();
}
