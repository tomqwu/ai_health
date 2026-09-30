import { useEffect, useRef, useState } from 'preact/hooks';
import { arrowPaths } from '../../lib/figure/arrow';
import type { FigureMeta } from '../../lib/figure/figures';
import type { FigureScene } from '../../lib/figure/scene3d/figureScene';
import { stageHeightFor } from '../../lib/figure/scene3d/layout';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

/** The stature figures are drawn at when none is given (spec §7.1: a typical adult height). */
const TYPICAL_STATURE_CM = 175;

interface Props {
  lang: Locale;
  modelUrl: string;
  figure: FigureMeta;
  fallbackImages: string[];
  /** The viewer's stature (the profile's, M4); omitted = typical height. */
  statureCm?: number;
  /** Offer a height picker with these statures (the dev figure pages). */
  statureChoices?: readonly number[];
}

type Status = 'loading' | 'ready' | 'unavailable' | 'error';
type Arrow = ReturnType<FigureScene['arrow']>;

function hasWebgl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
  // Release the probe context immediately so it does not count against the browser's context limit.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return Boolean(gl);
}

const SEGMENT_MS = 1200;

/**
 * The interactive 3D figure (spec §8.4): any figure in the library, posed at a stature, animated between
 * its frames and orbitable. three.js, the solver and the figure data load only when the island mounts;
 * without WebGL, or if the model fails, it shows the pre-rendered frames.
 */
export default function FigureViewer({ lang, modelUrl, figure, fallbackImages, statureCm, statureChoices }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The frame whose arrow is on screen, or null when none is (orbiting, playing). Lets a resize re-project it.
  const arrowFrameRef = useRef<number | null>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>('loading');
  const [size, setSize] = useState<[number, number]>([600, 800]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [arrow, setArrow] = useState<Arrow>(null);
  const [stature, setStature] = useState(statureCm ?? TYPICAL_STATURE_CM);
  const [playOrder, setPlayOrder] = useState<readonly number[]>([0, 1, 2, 0]);

  const showArrow = (index: number | null) => {
    arrowFrameRef.current = index;
    const scene = sceneRef.current;
    setArrow(index === null || !scene ? null : scene.arrow(index));
  };

  useEffect(() => {
    let cancelled = false;
    let sceneDisposed = false;
    let scene: FigureScene | undefined;
    let controls: { dispose(): void } | undefined;
    let orbitFrame = 0; // pending requestAnimationFrame id for an orbit re-render, 0 if none
    let resizeFrame = 0; // pending requestAnimationFrame id for a resize, 0 if none
    let observer: ResizeObserver | undefined;
    setStatus('loading');
    // Disposal tracks the scene, not the effect: a no-op until mountFigure has produced a scene,
    // then idempotent, so the scene (and controls, if created) are released exactly once.
    const disposeScene = () => {
      if (!scene || sceneDisposed) return;
      sceneDisposed = true;
      cancelAnimationFrame(orbitFrame);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      controls?.dispose();
      scene.dispose();
    };
    (async () => {
      try {
        if (!hasWebgl()) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        const canvas = canvasRef.current!;
        const width = canvas.clientWidth || 600;
        const height = stageHeightFor(width);
        const [{ mountFigure }, { FIGURES }, { OrbitControls }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('../../lib/figure/fixtures'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        const model = FIGURES[figure.id];
        if (!model) throw new Error(`Unknown figure: ${figure.id}`);
        scene = await mountFigure(canvas, { width, height, modelUrl, figure: model, statureCm: stature, pixelRatio: Math.min(window.devicePixelRatio, 2) });
        if (cancelled) {
          disposeScene(); // unmounted (or the height changed) while mountFigure was loading
          return;
        }
        const mounted = scene;
        const orbit = new OrbitControls(mounted.stage.camera, canvas);
        controls = orbit;
        const [tx, ty, tz] = mounted.view.targetCm;
        orbit.target.set(tx / 100, ty / 100, tz / 100);
        orbit.enablePan = false;
        orbit.minDistance = 1.5;
        orbit.maxDistance = 9;
        orbit.update();
        orbit.saveState();
        // A drag fires 'change' on every pointermove; render at most once per animation frame so a slow
        // GPU (or software WebGL) never queues up a backlog of renders on the main thread.
        orbit.addEventListener('change', () => {
          showArrow(null);
          if (!orbitFrame) {
            orbitFrame = requestAnimationFrame(() => {
              orbitFrame = 0;
              mounted.render();
            });
          }
        });
        resetRef.current = () => {
          orbit.reset();
          cancelAnimationFrame(orbitFrame); // render now instead
          orbitFrame = 0;
          mounted.render();
        };
        sceneRef.current = mounted;
        setPlayOrder(model.playOrder);
        setSize([width, height]);
        setStatus('ready');
        // Follow the stage's width (the canvas is 4:3 via CSS): resize the renderer and camera, re-render,
        // resize the overlay's viewBox and re-project the arrow. Coalesced to one pass per animation frame.
        // Browser zoom changes the CSS width and devicePixelRatio together, so both are tracked.
        const pixelRatio = () => Math.min(window.devicePixelRatio, 2);
        let lastWidth = width;
        let lastRatio = pixelRatio();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(() => {
              resizeFrame = 0;
              try {
                const w = canvas.clientWidth;
                const ratio = pixelRatio();
                if (!w || (w === lastWidth && ratio === lastRatio)) return;
                lastWidth = w;
                lastRatio = ratio;
                const h = stageHeightFor(w);
                mounted.resize(w, h, ratio);
                cancelAnimationFrame(orbitFrame); // this render covers a pending orbit render
                orbitFrame = 0;
                mounted.render();
                setSize([w, h]);
                const shown = arrowFrameRef.current;
                if (shown !== null) setArrow(mounted.arrow(shown));
              } catch (err) {
                console.error('3D figure resize failed:', err);
              }
            });
          });
          observer.observe(stageRef.current!);
        }
      } catch (err) {
        console.error('3D figure failed to load:', err);
        sceneRef.current = null;
        disposeScene(); // no-op if mountFigure itself threw (it disposes its own stage)
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      sceneRef.current = null;
      disposeScene(); // no-op while still loading; the async path disposes once mountFigure resolves
    };
  }, [figure.id, stature]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (status !== 'ready' || !scene || playing) return;
    scene.showFrame(frame);
    scene.render();
    showArrow(frame);
  }, [status, frame, playing]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!playing || !scene) return;
    showArrow(null);
    let raf = 0;
    // Time from the first rAF timestamp, not performance.now(): rAF passes the frame's start time,
    // which can be earlier than "now" in this effect and would make `total` negative.
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const total = Math.max(0, (now - start) / SEGMENT_MS);
      const seg = Math.floor(total) % (playOrder.length - 1);
      const eased = 0.5 - Math.cos(Math.PI * (total - Math.floor(total))) / 2;
      scene.showBetween(playOrder[seg]!, playOrder[seg + 1]!, eased);
      scene.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playOrder]);

  const labels = figure.frames.map((f) => f.label[lang]);
  const canvasLabel = `${figure.name[lang]} — ${playing ? t(lang, 'figure.animating') : labels[frame]}`;
  const paths = arrow ? arrowPaths(arrow.from, arrow.to) : null;
  const heightNote = stature === TYPICAL_STATURE_CM ? t(lang, 'figure.typicalHeight') : t(lang, 'figure.shownAt').replace('{height}', String(stature));
  const bothSides = figure.unilateral && <p class="figure-badge">{t(lang, 'figure.bothSides')}</p>;

  if (status === 'unavailable' || status === 'error') {
    return (
      <div class="figure-viewer" data-figure-status={status}>
        <p role="status">{t(lang, status === 'error' ? 'figure.loadError' : 'figure.noWebgl')}</p>
        {bothSides}
        <div class="figure-fallback-grid">
          {fallbackImages.map((src, i) => (
            <figure>
              <img src={src} alt={`${figure.name[lang]} — ${labels[i]}`} width={900} height={1200} loading="lazy" />
              <figcaption>{labels[i]}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="figure-viewer" data-figure-status={status}>
      {bothSides}
      <div class="figure-stage" ref={stageRef}>
        <canvas ref={canvasRef} class="figure-canvas" role="img" aria-label={canvasLabel} />
        {paths && (
          <svg class="figure-overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            <path d={paths.line} class="figure-arrow__line" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d={paths.head} class="figure-arrow__head" />
          </svg>
        )}
      </div>
      <div class="figure-controls" role="group" aria-label={figure.name[lang]}>
        {labels.map((label, i) => (
          <button
            type="button"
            aria-pressed={!playing && frame === i}
            disabled={status !== 'ready'}
            onClick={() => {
              setPlaying(false);
              setFrame(i);
            }}
          >
            {`${i + 1}. ${label}`}
          </button>
        ))}
        <button type="button" disabled={status !== 'ready'} onClick={() => setPlaying((p) => !p)}>
          {playing ? t(lang, 'figure.pause') : t(lang, 'figure.play')}
        </button>
        <button
          type="button"
          disabled={status !== 'ready'}
          onClick={() => {
            resetRef.current(); // OrbitControls' change event clears the arrow
            if (sceneRef.current && !playing) showArrow(frame); // the camera is back where the arrow lines up
          }}
        >
          {t(lang, 'figure.resetView')}
        </button>
        {statureChoices && (
          <label class="figure-height">
            {t(lang, 'figure.height')}{' '}
            <select
              value={String(stature)}
              disabled={status === 'loading'}
              onChange={(e) => {
                setPlaying(false);
                setStature(Number((e.target as HTMLSelectElement).value));
              }}
            >
              {statureChoices.map((cm) => (
                <option value={String(cm)}>{`${cm} cm`}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {status === 'loading' && <p role="status">{t(lang, 'figure.loading')}</p>}
      <p class="figure-note">
        {t(lang, 'figure.dragHint')} · {t(lang, 'figure.illustrative')} · {heightNote}
      </p>
    </div>
  );
}
