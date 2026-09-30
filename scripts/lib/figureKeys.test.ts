import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bothArms } from '../../src/lib/figure/pose/poseSpec';
import { poseFigure } from '../../src/lib/figure/figures';
import { FIGURES, POSE_SPECS } from '../../src/lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../../src/lib/figure/geometry/models';
import { DEFAULT_STATURE_CM } from '../../src/lib/figure/scene3d/figureScene';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';
import { equipmentKey, figureKey, RENDER_SETTINGS, RENDERER_FILES, rendererFingerprint } from './figureKeys';

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** A project root holding every renderer file. */
function fakeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'figure-keys-'));
  roots.push(root);
  for (const f of RENDERER_FILES) {
    mkdirSync(join(root, f.includes('.') ? f.replace(/\/[^/]*$/, '') : f), { recursive: true });
    if (f.includes('.')) writeFileSync(join(root, f), 'a');
  }
  writeFileSync(join(root, 'src/lib/figure/scene3d/stage.ts'), 'a');
  return root;
}

describe('render cache keys', () => {
  const fp = rendererFingerprint(process.cwd(), REAL_SKELETON);
  const curl = FIGURES['db-curl']!;

  it('are stable for the same inputs and differ between figures', () => {
    expect(figureKey(curl, REAL_SKELETON, fp)).toBe(figureKey(curl, REAL_SKELETON, fp));
    expect(figureKey(curl, REAL_SKELETON, fp)).not.toBe(figureKey(FIGURES['smith-squat']!, REAL_SKELETON, fp));
    expect(equipmentKey(EQUIPMENT_MODELS.barbell!, fp)).not.toBe(equipmentKey(EQUIPMENT_MODELS['ab-wheel']!, fp));
  });
  it('change when a pose changes what is drawn, and when the renderer changes', () => {
    const spec = POSE_SPECS.find((s) => s.id === 'db-curl')!;
    const moved = poseFigure({ ...spec, frames: [{ ...spec.frames[0], trunk: { hips: { bodyCm: [0, 94, 0] } } }, spec.frames[1], spec.frames[2]] });
    expect(figureKey(moved, REAL_SKELETON, fp)).not.toBe(figureKey(curl, REAL_SKELETON, fp));
    expect(figureKey(curl, REAL_SKELETON, `${fp}x`)).not.toBe(figureKey(curl, REAL_SKELETON, fp));
  });
  it('change when only a joint rotation changes (the hand stays where it is, the elbow swings out)', () => {
    const spec = POSE_SPECS.find((s) => s.id === 'db-curl')!;
    const top = spec.frames[1];
    const swung = poseFigure({ ...spec, frames: [spec.frames[0], { ...top, arms: bothArms({ ...top.arms.l, elbow: [0.6, -1, -0.3] }) }, spec.frames[2]] });
    expect(figureKey(swung, REAL_SKELETON, fp)).not.toBe(figureKey(curl, REAL_SKELETON, fp));
  });
  it('describe the size and stature that are actually drawn', () => {
    expect(RENDER_SETTINGS.statureCm).toBe(DEFAULT_STATURE_CM);
    const harness = readFileSync('src/pages/render/[figure].astro', 'utf8');
    expect(harness).toContain(`const W = ${RENDER_SETTINGS.width};`);
    expect(harness).toContain(`const H = ${RENDER_SETTINGS.height};`);
  });
  it('ignore files that are not source (.DS_Store, editor swap files)', () => {
    const root = fakeRoot();
    const before = rendererFingerprint(root, REAL_SKELETON);
    writeFileSync(join(root, 'src/lib/figure/scene3d/.DS_Store'), 'junk');
    writeFileSync(join(root, 'src/lib/figure/scene3d/.stage.ts.swp'), 'junk');
    expect(rendererFingerprint(root, REAL_SKELETON)).toBe(before);
  });
  it('fingerprint the renderer from its files, its tool versions (three.js, sharp, Chromium) and the model', () => {
    const root = fakeRoot();
    mkdirSync(join(root, 'node_modules/three'), { recursive: true });
    writeFileSync(join(root, 'node_modules/three/package.json'), '{"version":"1"}');
    mkdirSync(join(root, 'node_modules/sharp'), { recursive: true });
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"1"}');
    const before = rendererFingerprint(root, REAL_SKELETON);
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"2"}');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'node_modules/sharp/package.json'), '{"version":"1"}');
    mkdirSync(join(root, 'node_modules/playwright-core'), { recursive: true });
    writeFileSync(join(root, 'node_modules/playwright-core/browsers.json'), '{"browsers":[{"name":"chromium","revision":"2"}]}');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'node_modules/playwright-core/browsers.json'), '{"browsers":[]}');
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.ts'), 'b');
    expect(rendererFingerprint(root, REAL_SKELETON)).not.toBe(before);
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.test.ts'), 'tests do not count');
    const withTest = rendererFingerprint(root, REAL_SKELETON);
    writeFileSync(join(root, 'src/lib/figure/scene3d/stage.test.ts'), 'still do not count');
    expect(rendererFingerprint(root, REAL_SKELETON)).toBe(withTest);
    expect(rendererFingerprint(root, { ...REAL_SKELETON, source: { ...REAL_SKELETON.source, sha256: 'other' } })).not.toBe(withTest);
  });
});
