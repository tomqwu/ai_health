import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { poseFigure } from '../../src/lib/figure/figures';
import { FIGURES, POSE_SPECS } from '../../src/lib/figure/fixtures';
import { EQUIPMENT_MODELS } from '../../src/lib/figure/geometry/models';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';
import { equipmentKey, figureKey, RENDERER_FILES, rendererFingerprint } from './figureKeys';

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
  it('fingerprint the renderer from its files, its tool versions (three.js, sharp, Chromium) and the model', () => {
    const root = mkdtempSync(join(tmpdir(), 'figure-keys-'));
    for (const f of RENDERER_FILES) {
      mkdirSync(join(root, f.includes('.') ? f.replace(/\/[^/]*$/, '') : f), { recursive: true });
      if (f.includes('.')) writeFileSync(join(root, f), 'a');
    }
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
