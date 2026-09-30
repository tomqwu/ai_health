import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { projectCm, resizeStage, stageHeightFor, type Stage } from './stage';

// Node-only: a stub renderer stands in for WebGL; camera maths need no DOM.

function fakeStage(width: number, height: number): { stage: Stage; setSize: ReturnType<typeof vi.fn>; setPixelRatio: ReturnType<typeof vi.fn> } {
  const setSize = vi.fn();
  const setPixelRatio = vi.fn();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
  camera.position.set(0, 1, 5);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const stage = { renderer: { setSize, setPixelRatio }, scene: new THREE.Scene(), camera, width, height } as unknown as Stage;
  return { stage, setSize, setPixelRatio };
}

describe('stageHeightFor', () => {
  it('is 4:3 portrait, rounded to whole pixels', () => {
    expect(stageHeightFor(600)).toBe(800);
    expect(stageHeightFor(375)).toBe(500);
    expect(stageHeightFor(343)).toBe(457); // 457.33
  });
});

describe('resizeStage', () => {
  it('updates the renderer without touching the canvas style, plus width, height and camera aspect', () => {
    const { stage, setSize } = fakeStage(600, 800);
    resizeStage(stage, 300, 400);
    expect(setSize).toHaveBeenCalledWith(300, 400, false);
    expect([stage.width, stage.height]).toEqual([300, 400]);
    expect(stage.camera.aspect).toBeCloseTo(0.75, 12);
  });

  it('refreshes the projection matrix', () => {
    const { stage } = fakeStage(600, 800);
    resizeStage(stage, 800, 400); // aspect 2
    expect(stage.camera.projectionMatrix.elements[0]).toBeCloseTo(stage.camera.projectionMatrix.elements[5]! / 2, 10);
  });

  it('keeps projectCm aligned: the view target stays at the canvas centre at any size', () => {
    const { stage } = fakeStage(600, 800);
    for (const [w, h] of [[300, 400], [343, 457], [900, 1200]] as const) {
      resizeStage(stage, w, h);
      const [x, y] = projectCm(stage, [0, 100, 0]);
      expect(x).toBeCloseTo(w / 2, 6);
      expect(y).toBeCloseTo(h / 2, 6);
    }
  });

  it('scales projected offsets with the size (the overlay lines up after a resize)', () => {
    const { stage } = fakeStage(600, 800);
    const before = projectCm(stage, [20, 130, 0]);
    resizeStage(stage, 300, 400);
    const after = projectCm(stage, [20, 130, 0]);
    expect(after[0]).toBeCloseTo(before[0] / 2, 6);
    expect(after[1]).toBeCloseTo(before[1] / 2, 6);
  });

  it('projects an off-centre point exactly like a camera built at the new size (aspect change)', () => {
    const { stage } = fakeStage(600, 800);
    resizeStage(stage, 800, 400);
    const fresh = fakeStage(800, 400).stage;
    for (const p of [[35, 150, 10], [-40, 60, -20]] as const) {
      const [rx, ry] = projectCm(stage, [...p]);
      const [fx, fy] = projectCm(fresh, [...p]);
      expect(rx).toBeCloseTo(fx, 6);
      expect(ry).toBeCloseTo(fy, 6);
    }
    // and it differs from what the old aspect would give, so the aspect update is what is being tested
    const stale = fakeStage(600, 800).stage;
    stale.width = 800;
    stale.height = 400;
    expect(Math.abs(projectCm(stale, [35, 150, 10])[0] - projectCm(fresh, [35, 150, 10])[0])).toBeGreaterThan(1);
  });

  it('applies a new pixel ratio before sizing, and leaves it alone when none is given', () => {
    const { stage, setSize, setPixelRatio } = fakeStage(600, 800);
    resizeStage(stage, 300, 400);
    expect(setPixelRatio).not.toHaveBeenCalled();
    resizeStage(stage, 300, 400, 1.5);
    expect(setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(setPixelRatio.mock.invocationCallOrder[0]).toBeLessThan(setSize.mock.invocationCallOrder[1]!);
  });
});
