import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { extractSkeleton } from '../../scripts/lib/extractSkeleton';
import skeletonJson from '../../src/lib/figure/pose/skeleton.json';
import { rotate } from '../../src/lib/figure/math/quat';
import { restPose, type SkeletonDef } from '../../src/lib/figure/pose/skeleton';
import { solveSmithSquat } from '../../src/lib/figure/pose/smithSquat';
import { validateSmithSquat } from '../../src/lib/figure/pose/validate';
import { ILLUSTRATIVE_SMITH } from '../../src/lib/figure/geometry/smith';
import { SMITH_SQUAT } from '../../src/lib/figure/fixtures/smith-squat';

const MODEL = 'public/models/human.glb';
const skeleton = skeletonJson as unknown as SkeletonDef;

describe('committed human model', () => {
  it('fits the 8 MB budget', () => {
    expect(statSync(MODEL).size).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
  it('matches skeleton.json', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const sha256 = createHash('sha256').update(readFileSync(MODEL)).digest('hex');
    expect(skeleton.source.sha256).toBe(sha256);
    // JSON round-trip matches how build-human writes skeleton.json (e.g. -0 becomes 0).
    const extracted = JSON.parse(JSON.stringify(extractSkeleton(await io.read(MODEL), { file: MODEL, sha256 })));
    expect(extracted).toEqual(skeleton);
  });
  it('uses glTF axes: left = +X, facing +Z, up +Y', () => {
    const w = restPose(skeleton, 1);
    expect(w.thigh_l!.position[0]).toBeGreaterThan(0);
    expect(w.ball_l!.position[2]).toBeGreaterThan(w.foot_l!.position[2]);
    expect(w.head!.position[1]).toBeGreaterThan(w.pelvis!.position[1]);
  });
  it('has an adult stature', () => {
    expect(skeleton.statureCm).toBeGreaterThan(160);
    expect(skeleton.statureCm).toBeLessThan(195);
  });
  it('places the skull top at the stature, not behind the head', () => {
    const head = restPose(skeleton, 1).head!;
    const off = rotate(head.rotation, skeleton.headTopLocal);
    const top = [head.position[0] + off[0], head.position[1] + off[1], head.position[2] + off[2]];
    expect(Math.abs(top[1]! - skeleton.statureCm)).toBeLessThan(0.5);
    expect(top[2]!).toBeGreaterThanOrEqual(-5);
  });
  it.each([150, 165, 175, 190, 200])('Smith squat frames are valid on the real rig at %i cm', (statureCm) => {
    for (const frame of SMITH_SQUAT.frames) {
      const sol = solveSmithSquat(skeleton, SMITH_SQUAT, frame, { statureCm, railZCm: ILLUSTRATIVE_SMITH.railZCm });
      expect(
        validateSmithSquat(skeleton, sol, { smith: ILLUSTRATIVE_SMITH, barRestOffsetCm: SMITH_SQUAT.barRestOffsetCm }),
        `${statureCm} cm / ${frame.id}`,
      ).toEqual([]);
    }
  });
});
