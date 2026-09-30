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
  pad: { color: '#1f2023', roughness: 0.7 },
  rubber: { color: '#26272a', roughness: 0.9 },
  grip: { color: '#3a3b3f', roughness: 0.75, metalness: 0.2 },
  cable: { color: '#9ea2a8', roughness: 0.35, metalness: 0.8 },
  rope: { color: '#2d2f33', roughness: 0.95 },
  foam: { color: '#3f4a5a', roughness: 0.95 },
  band: { color: '#4f8a5b', roughness: 0.65 },
  ball: { color: '#7c8a99', roughness: 0.45 },
  dome: { color: '#5a7fa8', roughness: 0.55 },
  plastic: { color: '#3b3e44', roughness: 0.5, metalness: 0.1 },
  belt: { color: '#18191b', roughness: 0.95 },
};

/** Radial segments of every cylinder (rails, bars, plates) and of spheres. */
const CYLINDER_SEGMENTS = 32;

/** Parts that travel with the Smith bar; all are built centred at the bar height. */
const MOVING = /^(bar$|plate-|carriage-)/;

/**
 * Meshes are built from shared unit shapes (a 1 cm box, cylinder and sphere scaled per primitive), so a
 * moving part is updated by setting its transform — no geometry is rebuilt while the figure animates.
 */
export interface EquipmentMeshes {
  group: THREE.Group;
  update(prims: readonly Primitive[]): void;
  dispose(): void;
}

export function createEquipment(name: string): EquipmentMeshes {
  const group = new THREE.Group();
  group.name = name;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<SurfaceKind, THREE.Material>();
  const geometry = (key: string, make: () => THREE.BufferGeometry) => {
    let g = geometries.get(key);
    if (!g) geometries.set(key, (g = make()));
    return g;
  };
  const material = (k: SurfaceKind) => {
    let m = materials.get(k);
    if (!m) materials.set(k, (m = new THREE.MeshStandardMaterial(SURFACES[k])));
    return m;
  };
  const shapeKey = (p: Primitive) => (p.kind === 'sphere' && p.capBelowY !== undefined ? `sphere-cap-${((p.capBelowY - p.center[1]) / p.radius).toFixed(3)}` : p.kind);
  const make = (p: Primitive): THREE.BufferGeometry => {
    if (p.kind === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (p.kind === 'cylinder') return new THREE.CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS);
    if (p.capBelowY === undefined) return new THREE.SphereGeometry(1, CYLINDER_SEGMENTS, CYLINDER_SEGMENTS / 2);
    const cut = Math.acos(Math.min(1, Math.max(-1, (p.capBelowY - p.center[1]) / p.radius)));
    return new THREE.SphereGeometry(1, CYLINDER_SEGMENTS * 2, CYLINDER_SEGMENTS, 0, 2 * Math.PI, 0, cut);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.Mesh, p: Primitive) => {
    if (p.kind === 'box') {
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
      mesh.quaternion.set(...(p.rotation ?? ([0, 0, 0, 1] as const)));
      mesh.scale.set(p.size[0] * CM, p.size[1] * CM, p.size[2] * CM);
    } else if (p.kind === 'cylinder') {
      const a = new THREE.Vector3(...p.start).multiplyScalar(CM);
      const b = new THREE.Vector3(...p.end).multiplyScalar(CM);
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      mesh.scale.set(p.radius * CM, a.distanceTo(b), p.radius * CM);
    } else {
      mesh.position.set(p.center[0] * CM, p.center[1] * CM, p.center[2] * CM);
      mesh.quaternion.identity();
      mesh.scale.setScalar(p.radius * CM);
    }
  };
  const meshes = new Map<string, THREE.Mesh>();
  return {
    group,
    update(prims) {
      const seen = new Set<string>();
      for (const p of prims) {
        seen.add(p.id);
        let mesh = meshes.get(p.id);
        const key = shapeKey(p);
        if (!mesh || mesh.userData.shape !== key || mesh.material !== material(p.surface)) {
          if (mesh) group.remove(mesh);
          mesh = new THREE.Mesh(geometry(key, () => make(p)), material(p.surface));
          mesh.name = p.id;
          mesh.userData.shape = key;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          meshes.set(p.id, mesh);
          group.add(mesh);
        }
        place(mesh, p);
        mesh.visible = true;
      }
      for (const [id, mesh] of meshes) if (!seen.has(id)) mesh.visible = false;
    },
    dispose() {
      for (const g of geometries.values()) g.dispose();
      for (const m of materials.values()) m.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}

/** Build a static group of equipment (kept for callers that do not animate it). */
export function buildEquipment(prims: readonly Primitive[]): THREE.Group {
  const eq = createEquipment('equipment');
  eq.update(prims);
  return eq.group;
}

/** Move the bar, plates and carriages to a new bar height without rebuilding. */
export function setBarHeight(group: THREE.Group, barHeightCm: number): void {
  for (const child of group.children) if (MOVING.test(child.name)) child.position.y = barHeightCm * CM;
}
