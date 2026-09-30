import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSmith, ILLUSTRATIVE_SMITH } from '../geometry/smith';
import type { Quat } from '../math/quat';
import { buildEquipment, setBarHeight } from './equipment';
import { applyPose, type HumanRig } from './human';

// Node-only: three's math/scene-graph classes need no WebGL or DOM.

function makeRig(): HumanRig {
  const root = new THREE.Group();
  const armature = new THREE.Object3D();
  armature.name = 'Armature';
  armature.rotation.x = -Math.PI / 2; // glTF/Blender Z-up armature under a Y-up scene
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  const pelvis = new THREE.Bone();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.9, 0);
  rootBone.add(pelvis);
  armature.add(rootBone);
  root.add(armature);
  root.updateMatrixWorld(true);
  return {
    root,
    bones: new Map([
      ['Root', rootBone],
      ['pelvis', pelvis],
    ]),
    rootBone,
  };
}

const norm = (q: Quat): Quat => {
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};

describe('applyPose', () => {
  const rootQ = norm([0.3, -0.5, 0.2, 0.8]);
  const pelvisQ = norm([0.1, 0.4, -0.2, 0.9]);
  const rootPosition: [number, number, number] = [12, 95, -30];
  const scale = 1.06;

  it('places the Root bone at the requested WORLD transform through a rotated parent', () => {
    const rig = makeRig();
    applyPose(rig, { local: { Root: rootQ, pelvis: pelvisQ }, rootPosition }, scale);

    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    rig.rootBone.matrixWorld.decompose(p, q, s);

    expect(p.x).toBeCloseTo(0.12, 9);
    expect(p.y).toBeCloseTo(0.95, 9);
    expect(p.z).toBeCloseTo(-0.3, 9);

    const dot = q.x * rootQ[0] + q.y * rootQ[1] + q.z * rootQ[2] + q.w * rootQ[3];
    expect(Math.abs(dot)).toBeCloseTo(1, 9);

    expect(s.x).toBeCloseTo(scale, 9);
    expect(s.y).toBeCloseTo(scale, 9);
    expect(s.z).toBeCloseTo(scale, 9);
  });

  it('sets non-root bones by local quaternion', () => {
    const rig = makeRig();
    applyPose(rig, { local: { Root: rootQ, pelvis: pelvisQ }, rootPosition }, scale);
    const q = rig.bones.get('pelvis')!.quaternion;
    expect([q.x, q.y, q.z, q.w]).toEqual(pelvisQ);
  });
});

describe('setBarHeight', () => {
  const build = () => buildEquipment(buildSmith(ILLUSTRATIVE_SMITH, { barHeightCm: 120, catchHeightCm: 60 }));
  const MOVES = /^(bar$|plate-|carriage-)/;
  const STAYS = /^(stop-|rail-|upright-|beam-)/;

  it('moves bar, plates and carriages to the new height and leaves the frame alone', () => {
    const g = build();
    const before = new Map(g.children.map((c) => [c.name, c.position.y]));
    setBarHeight(g, 85);

    const moved = g.children.filter((c) => MOVES.test(c.name));
    const fixed = g.children.filter((c) => STAYS.test(c.name));
    expect(moved.map((c) => c.name).sort()).toEqual(['bar', 'carriage-left', 'carriage-right', 'plate-left', 'plate-right']);
    expect(fixed.length).toBeGreaterThan(0);
    for (const c of moved) expect(c.position.y).toBeCloseTo(0.85, 9);
    for (const c of fixed) expect(c.position.y).toBe(before.get(c.name));
  });
});
