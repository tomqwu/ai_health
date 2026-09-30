import { type Document, MathUtils, type mat4, type Node, type vec3, type vec4 } from '@gltf-transform/core';
import { type Vec3, sub } from '../../src/lib/figure/math/vec3';
import { type Quat, conjugate, rotate } from '../../src/lib/figure/math/quat';
import type { BoneDef, SkeletonDef } from '../../src/lib/figure/pose/skeleton';

/** Bones the pose layer relies on (MPFB "game_engine" rig). */
export const REQUIRED_BONES = [
  'Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  ...['l', 'r'].flatMap((s) => [
    `clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`,
    ...['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].map((i) => `${f}_0${i}_${s}`)),
    `thigh_${s}`, `calf_${s}`, `foot_${s}`, `ball_${s}`,
  ]),
];

const M_TO_CM = 100;

function worldTRS(node: Node): { t: Vec3; r: Quat; s: Vec3 } {
  const t = [0, 0, 0] as vec3;
  const r = [0, 0, 0, 1] as vec4;
  const s = [1, 1, 1] as vec3;
  MathUtils.decompose(node.getWorldMatrix() as mat4, t, r, s);
  return { t: [t[0], t[1], t[2]], r: [r[0], r[1], r[2], r[3]], s: [s[0], s[1], s[2]] };
}

function assertUnitScale(s: readonly number[], what: string): void {
  if (s.some((v) => Math.abs(v - 1) > 1e-4)) throw new Error(`${what} has non-unit scale ${s.join(',')}`);
}

/** Read the rig's rest pose (cm) plus stature and head-top from the scene extras written by build-human. */
export function extractSkeleton(doc: Document, source: { file: string; sha256: string }): SkeletonDef {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error('No skin found in the model');
  const joints = new Set(skin.listJoints());
  const parentJoint = (n: Node): Node | null => {
    const p = n.getParentNode();
    return p && joints.has(p) ? p : null;
  };
  const roots = [...joints].filter((j) => parentJoint(j) === null);
  if (roots.length !== 1) throw new Error(`Expected one root joint, found ${roots.length}`);

  const ordered: Node[] = [];
  const visit = (n: Node) => {
    ordered.push(n);
    for (const c of n.listChildren()) if (joints.has(c)) visit(c);
  };
  visit(roots[0]!);

  const bones: BoneDef[] = ordered.map((n) => {
    const parent = parentJoint(n);
    if (parent === null) {
      // Bake every non-joint ancestor (armature node, scene) into the root.
      const w = worldTRS(n);
      assertUnitScale(w.s, `Root joint "${n.getName()}" (world)`);
      return { name: n.getName(), parent: null, restLocalT: [w.t[0] * M_TO_CM, w.t[1] * M_TO_CM, w.t[2] * M_TO_CM], restLocalR: w.r };
    }
    assertUnitScale(n.getScale(), `Joint "${n.getName()}"`);
    const t = n.getTranslation();
    const r = n.getRotation();
    return {
      name: n.getName(),
      parent: parent.getName(),
      restLocalT: [t[0] * M_TO_CM, t[1] * M_TO_CM, t[2] * M_TO_CM],
      restLocalR: [r[0], r[1], r[2], r[3]],
    };
  });

  const names = new Set(bones.map((b) => b.name));
  const missing = REQUIRED_BONES.filter((b) => !names.has(b));
  if (missing.length) throw new Error(`Model is missing bones: ${missing.join(', ')}`);

  const extras = doc.getRoot().listScenes()[0]?.getExtras() as { statureM?: number; headTopM?: [number, number, number] } | undefined;
  if (!extras?.statureM || !extras.headTopM) throw new Error('Scene extras must include statureM and headTopM');

  const head = worldTRS(ordered.find((n) => n.getName() === 'head')!);
  const local = rotate(conjugate(head.r), sub(extras.headTopM, head.t));
  return {
    source,
    statureCm: extras.statureM * M_TO_CM,
    bones,
    headTopLocal: [local[0] * M_TO_CM, local[1] * M_TO_CM, local[2] * M_TO_CM],
  };
}
