import { useEffect, useRef, useState } from 'preact/hooks';
import { arrowPaths } from '../../lib/figure/arrow';
import type { SmithSquatSpec } from '../../lib/figure/pose/smithSquat';
import type { FigureScene } from '../../lib/figure/scene3d/figureScene';
import { t } from '../../lib/i18n';
import type { Locale } from '../../lib/i18n/locales';
import './figure.css';

interface Props {
  lang: Locale;
  modelUrl: string;
  spec: SmithSquatSpec;
  fallbackImages: string[];
}

type Status = 'loading' | 'ready' | 'unavailable';
type Arrow = ReturnType<FigureScene['arrow']>;

const PLAY_ORDER = [0, 1, 2, 0];
const SEGMENT_MS = 1200;

export default function FigureViewer({ lang, modelUrl, spec, fallbackImages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FigureScene | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>('loading');
  const [size, setSize] = useState<[number, number]>([600, 800]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [arrow, setArrow] = useState<Arrow>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      try {
        const canvas = canvasRef.current!;
        const width = canvas.clientWidth || 600;
        const height = Math.round((width * 4) / 3);
        const [{ mountFigure }, { OrbitControls }] = await Promise.all([
          import('../../lib/figure/scene3d/figureScene'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        const scene = await mountFigure(canvas, { width, height, modelUrl, spec, pixelRatio: Math.min(window.devicePixelRatio, 2) });
        if (cancelled) {
          scene.dispose();
          return;
        }
        const controls = new OrbitControls(scene.stage.camera, canvas);
        const [tx, ty, tz] = scene.view.targetCm;
        controls.target.set(tx / 100, ty / 100, tz / 100);
        controls.enablePan = false;
        controls.minDistance = 1.5;
        controls.maxDistance = 9;
        controls.update();
        controls.saveState();
        controls.addEventListener('change', () => {
          scene.render();
          setArrow(null);
        });
        resetRef.current = () => {
          controls.reset();
          scene.render();
        };
        sceneRef.current = scene;
        cleanup = () => {
          controls.dispose();
          scene.dispose();
        };
        setSize([width, height]);
        setStatus('ready');
      } catch (err) {
        console.warn('3D figure unavailable:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (status !== 'ready' || !scene || playing) return;
    scene.showFrame(frame);
    scene.render();
    setArrow(scene.arrow(frame));
  }, [status, frame, playing]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!playing || !scene) return;
    setArrow(null);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const total = (now - start) / SEGMENT_MS;
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
  const paths = arrow ? arrowPaths(arrow.from, arrow.to) : null;

  if (status === 'unavailable') {
    return (
      <div class="figure-viewer" data-figure-status={status}>
        <p role="status">{t(lang, 'figure.noWebgl')}</p>
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
      <div class="figure-stage">
        <canvas ref={canvasRef} class="figure-canvas" aria-label={`${spec.name[lang]} — ${labels[frame]}`} />
        {paths && (
          <svg class="figure-overlay" viewBox={`0 0 ${size[0]} ${size[1]}`} aria-hidden="true">
            <path d={paths.line} stroke="#1f6feb" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d={paths.head} fill="#1f6feb" />
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
        <button type="button" disabled={status !== 'ready'} onClick={() => resetRef.current()}>
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
