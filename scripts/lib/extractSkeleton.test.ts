import { Document, type Node } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { distance } from '../../src/lib/figure/math/vec3';
import { restPose } from '../../src/lib/figure/pose/skeleton';
import { syntheticSkeleton } from '../../src/lib/figure/pose/synthetic';
import { extractSkeleton, REQUIRED_BONES } from './extractSkeleton';

/** A glTF document (metres) built from the synthetic skeleton under an armature node. */
function syntheticDocument(opts: { dropBone?: string } = {}) {
  const sk = syntheticSkeleton({ randomRestSeed: 4 });
  const doc = new Document();
  const scene = doc.createScene('Scene').setExtras({ statureM: 1.75, headTopM: [0, 1.75, 0] });
  const armature = doc.createNode('Armature');
  scene.addChild(armature);
  const nodes = new Map<string, Node>();
  for (const b of sk.bones) {
    if (b.name === opts.dropBone) continue;
    const n = doc
      .createNode(b.name)
      .setTranslation([b.restLocalT[0] / 100, b.restLocalT[1] / 100, b.restLocalT[2] / 100])
      .setRotation([b.restLocalR[0], b.restLocalR[1], b.restLocalR[2], b.restLocalR[3]]);
    nodes.set(b.name, n);
    (b.parent ? nodes.get(b.parent) : armature)?.addChild(n);
  }
  const skin = doc.createSkin('Skin');
  for (const n of nodes.values()) skin.addJoint(n);
  return { doc, sk };
}

describe('extractSkeleton', () => {
  it('recovers the rest pose in centimetres', () => {
    const { doc, sk } = syntheticDocument();
    const out = extractSkeleton(doc, { file: 'x.glb', sha256: 'abc' });
    expect(out.statureCm).toBeCloseTo(175);
    expect(out.bones[0]!.name).toBe('Root');
    const a = restPose(sk, 1);
    const b = restPose(out, 1);
    for (const name of REQUIRED_BONES) expect(distance(a[name]!.position, b[name]!.position)).toBeLessThan(1e-6);
    expect(distance(out.headTopLocal, sk.headTopLocal)).toBeLessThan(1e-6);
  });
  it('fails loudly when a required bone is missing', () => {
    const { doc } = syntheticDocument({ dropBone: 'ball_r' });
    expect(() => extractSkeleton(doc, { file: 'x', sha256: 'y' })).toThrow(/missing bones: ball_r/);
  });
});
