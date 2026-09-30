import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Quat } from '../math/quat';
import type { Vec3 } from '../math/vec3';
import { disposeMaterial } from './stage';

/** Neutral skin tone applied at render time; the model ships without skin textures. */
export const SKIN_TONE = '#c8957a';

export interface HumanRig {
  root: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
  rootBone: THREE.Bone;
}

/** A pose-layer result: full local rotations plus the root bone's world position (cm). */
export interface RigPose {
  local: Readonly<Record<string, Quat>>;
  rootPosition: Vec3;
}

export async function loadHuman(url: string): Promise<HumanRig> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const bones = new Map<string, THREE.Bone>();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONE, roughness: 0.6 });
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name, o);
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds do not follow the pose
      if (o.name.startsWith('Body')) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) disposeMaterial(m);
        o.material = skin;
      }
    }
  });
  const rootBone = bones.get('Root');
  if (!rootBone) throw new Error('Human model has no "Root" bone');
  return { root: gltf.scene, bones, rootBone };
}

/** Apply a pose (cm at the target stature). `scaleFactor` = target stature / native stature. */
export function applyPose(rig: HumanRig, pose: RigPose, scaleFactor: number): void {
  rig.root.scale.setScalar(scaleFactor);
  for (const [name, q] of Object.entries(pose.local)) {
    const bone = rig.bones.get(name);
    if (bone && bone !== rig.rootBone) bone.quaternion.set(q[0], q[1], q[2], q[3]);
  }
  // The pose layer gives the root's WORLD transform; convert it through the real parent chain.
  const q = pose.local[rig.rootBone.name] ?? [0, 0, 0, 1];
  const desired = new THREE.Matrix4().compose(
    new THREE.Vector3(pose.rootPosition[0] / 100, pose.rootPosition[1] / 100, pose.rootPosition[2] / 100),
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
  );
  const parent = rig.rootBone.parent;
  if (!parent) throw new Error('Root bone has no parent');
  parent.updateWorldMatrix(true, false);
  new THREE.Matrix4()
    .copy(parent.matrixWorld)
    .invert()
    .multiply(desired)
    .decompose(rig.rootBone.position, rig.rootBone.quaternion, rig.rootBone.scale);
  rig.root.updateMatrixWorld(true);
}
