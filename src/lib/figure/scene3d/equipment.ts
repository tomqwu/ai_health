import * as THREE from 'three';
import type { Primitive, SurfaceKind } from '../geometry/primitives';
import { CM } from './units';

const SURFACES: Record<SurfaceKind, THREE.MeshStandardMaterialParameters> = {
  frame: { color: '#2b2d31', roughness: 0.55, metalness: 0.35 },
  chrome: { color: '#d7dade', roughness: 0.18, metalness: 0.9 },
  plate: { color: '#34363b', roughness: 0.8 },
  stop: { color: '#c0392b', roughness: 0.6 },
  catch: { color: '#e0a13a', roughness: 0.6 },
  carriage: { color: '#55585e', roughness: 0.5, metalness: 0.4 },
};

/** Parts that travel with the bar; all are built centred at the bar height. */
const MOVING = /^(bar$|plate-|carriage-)/;

export function buildEquipment(prims: readonly Primitive[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'equipment';
  const materials = new Map<SurfaceKind, THREE.Material>();
  const material = (k: SurfaceKind) => {
    let m = materials.get(k);
    if (!m) materials.set(k, (m = new THREE.MeshStandardMaterial(SURFACES[k])));
    return m;
  };
  for (const p of prims) {
    let mesh: THREE.Mesh;
    if (p.kind === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0] * CM, p.size[1] * CM, p.size[2] * CM), material(p.surface));
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
    } else {
      const a = new THREE.Vector3(...p.start).multiplyScalar(CM);
      const b = new THREE.Vector3(...p.end).multiplyScalar(CM);
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * CM, p.radius * CM, a.distanceTo(b), 32), material(p.surface));
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    mesh.name = p.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Move the bar, plates and carriages to a new bar height without rebuilding. */
export function setBarHeight(group: THREE.Group, barHeightCm: number): void {
  for (const child of group.children) if (MOVING.test(child.name)) child.position.y = barHeightCm * CM;
}
