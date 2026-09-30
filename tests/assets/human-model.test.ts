import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { extractSkeleton } from '../../scripts/lib/extractSkeleton';
import { rotate } from '../../src/lib/figure/math/quat';
import { REAL_SKELETON } from '../../src/lib/figure/pose/realSkeleton';
import { restPose } from '../../src/lib/figure/pose/skeleton';
import { PLAY_ORDER } from '../../src/lib/figure/pose/playOrder';
import { interpolateFrame, solveSmithSquat } from '../../src/lib/figure/pose/smithSquat';
import { checkFigureFrame } from '../../src/lib/figure/pose/checkFigureFrame';
import { ILLUSTRATIVE_SMITH } from '../../src/lib/figure/geometry/smith';
import { SMITH_SQUAT } from '../../src/lib/figure/fixtures/smith-squat';

const MODEL = 'public/models/human.glb';
const skeleton = REAL_SKELETON;

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
      const { findings } = checkFigureFrame(skeleton, SMITH_SQUAT, frame, { statureCm, smith: ILLUSTRATIVE_SMITH });
      expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
    }
  });
  it.each([150, 165, 175, 190, 200])('Smith squat in-between poses are valid on the real rig at %i cm', (statureCm) => {
    for (let seg = 0; seg < PLAY_ORDER.length - 1; seg++) {
      const [a, b] = [SMITH_SQUAT.frames[PLAY_ORDER[seg]!]!, SMITH_SQUAT.frames[PLAY_ORDER[seg + 1]!]!];
      for (const t of [0.25, 0.5, 0.75]) {
        const frame = interpolateFrame(a, b, t);
        const { findings } = checkFigureFrame(skeleton, SMITH_SQUAT, frame, { statureCm, smith: ILLUSTRATIVE_SMITH });
        expect(findings, `${statureCm} cm / ${frame.id}`).toEqual([]);
      }
    }
  });
  it('keeps the real-rig bottom frame where it was before #40 (175 cm)', () => {
    // Recorded before the pose-robustness changes. The rig's rotations are unit only to ~1e-8, so a
    // reordered computation can drift ~1e-5 cm and shift rendered pixels; this pins the exact result.
    const recorded: Record<string, [number, number, number]> = {
      lowerarm_l: [33.53210802447757, 79.01047122565174, -7.926390652420366],
      hand_r: [-42.00000264045758, 103.46294990691753, -3.9999987224264424],
      middle_03_l: [46.29438112059032, 111.1690134745823, 2.48426779087539],
      calf_r: [-19.725202297913064, 48.19763469716158, 23.675250086279704],
      head: [0, 113.41596514546777, 14.517814947292685],
    };
    const sol = solveSmithSquat(skeleton, SMITH_SQUAT, SMITH_SQUAT.frames[1]!, { statureCm: 175, railZCm: ILLUSTRATIVE_SMITH.railZCm });
    for (const [bone, want] of Object.entries(recorded)) {
      const got = sol.world[bone]!.position;
      expect(Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]), bone).toBeLessThan(1e-9);
    }
  });
});
