import { useEffect, useRef, useState } from 'preact/hooks';
import { arrowPaths } from '../../lib/figure/arrow';
import { PLAY_ORDER } from '../../lib/figure/pose/playOrder';
import type { SmithSquatSpec } from '../../lib/figure/pose/smithSquat';
import type { FigureScene } from '../../lib/figure/scene3d/figureScene';
import { stageHeightFor } from '../../lib/figure/scene3d/stage';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props {
  lang: Locale;
  modelUrl: string;
  spec: SmithSquatSpec;
  fallbackImages: string[];
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

export default function FigureViewer({ lang, modelUrl, spec, fallbackImages }: Props) {
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
        const [{ mountFigure }, { OrbitControls }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        scene = await mountFigure(canvas, { width, height, modelUrl, spec, pixelRatio: Math.min(window.devicePixelRatio, 2) });
        if (cancelled) {
          disposeScene(); // unmounted while mountFigure was loading
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
        setSize([width, height]);
        setStatus('ready');
        // Follow the stage's width (the canvas is 4:3 via CSS): resize the renderer and camera, re-render,
        // resize the overlay's viewBox and re-project the arrow. Coalesced to one pass per animation frame.
        let lastWidth = width;
        observer = new ResizeObserver(() => {
          if (resizeFrame) return;
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            const w = canvas.clientWidth;
            if (!w || w === lastWidth) return;
            lastWidth = w;
            const h = stageHeightFor(w);
            mounted.resize(w, h);
            mounted.render();
            setSize([w, h]);
            const shown = arrowFrameRef.current;
            if (shown !== null) setArrow(mounted.arrow(shown));
          });
        });
        observer.observe(stageRef.current!);
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
  }, []);

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
      const seg = Math.floor(total) % (PLAY_ORDER.length - 1);
      const eased = 0.5 - Math.cos(Math.PI * (total - Math.floor(total))) / 2;
      scene.showBetween(PLAY_ORDER[seg]!, PLAY_ORDER[seg + 1]!, eased);
      scene.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const labels = spec.frames.map((f) => f.label[lang]);
  const canvasLabel = `${spec.name[lang]} — ${playing ? t(lang, 'figure.animating') : labels[frame]}`;
  const paths = arrow ? arrowPaths(arrow.from, arrow.to) : null;

  if (status === 'unavailable' || status === 'error') {
    return (
      <div class="figure-viewer" data-figure-status={status}>
        <p role="status">{t(lang, status === 'error' ? 'figure.loadError' : 'figure.noWebgl')}</p>
        <div class="figure-fallback-grid">
          {fallbackImages.map((src, i) => (
            <figure>
              <img src={src} alt={`${spec.name[lang]} — ${labels[i]}`} width={900} height={1200} loading="lazy" />
              <figcaption>{labels[i]}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="figure-viewer" data-figure-status={status}>
      <div class="figure-stage" ref={stageRef}>
        <canvas ref={canvasRef} class="figure-canvas" role="img" aria-label={canvasLabel} />
        {paths && (
          <svg class="figure-overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            <path d={paths.line} class="figure-arrow__line" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d={paths.head} class="figure-arrow__head" />
          </svg>
        )}
      </div>
      <div class="figure-controls" role="group" aria-label={spec.name[lang]}>
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
      </div>
      {status === 'loading' && <p role="status">{t(lang, 'figure.loading')}</p>}
      <p class="figure-note">
        {t(lang, 'figure.dragHint')} · {t(lang, 'figure.illustrative')}
      </p>
    </div>
  );
}
