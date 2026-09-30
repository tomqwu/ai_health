import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Vec3 } from '../math/vec3';
import { CM } from './units';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
}

export interface OrbitView {
  /** Degrees from the figure's front (+Z) toward its left (+X). */
  azimuthDeg: number;
  elevationDeg: number;
  distanceCm: number;
  targetCm: Vec3;
}

export function createStage(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio = 1): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated since r186

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3f2ee');
  // Image-based lighting so metal (rails, bar) and skin read correctly.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9b4a8', 0.9));

  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1.8, 3.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 2.6, bottom: -0.2, near: 0.5, far: 8 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#dfe7ff', 0.8);
  rim.position.set(-2.5, 2.2, -2);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
  return { renderer, scene, camera, width, height };
}

export function setOrbitView(stage: Stage, v: OrbitView): void {
  const az = THREE.MathUtils.degToRad(v.azimuthDeg);
  const el = THREE.MathUtils.degToRad(v.elevationDeg);
  const d = v.distanceCm * CM;
  const t = new THREE.Vector3(v.targetCm[0] * CM, v.targetCm[1] * CM, v.targetCm[2] * CM);
  stage.camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
  stage.camera.lookAt(t);
  stage.camera.updateMatrixWorld();
}

export function renderStage(stage: Stage): void {
  stage.renderer.render(stage.scene, stage.camera);
}

/** Project a world point (cm) to canvas CSS pixels, origin top-left. */
export function projectCm(stage: Stage, p: Vec3): [number, number] {
  const v = new THREE.Vector3(p[0] * CM, p[1] * CM, p[2] * CM).project(stage.camera);
  return [((v.x + 1) / 2) * stage.width, ((1 - v.y) / 2) * stage.height];
}

/** Dispose a material together with every texture it references. */
export function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
  m.dispose();
}

/** Release every GPU resource the stage owns. The canvas stays reusable. */
export function disposeStage(stage: Stage): void {
  const { scene, renderer } = stage;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) disposeMaterial(m);
    }
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    if ('shadow' in o && o.shadow instanceof THREE.LightShadow) o.shadow.dispose();
  });
  scene.environment?.dispose(); // the PMREM render target's texture
  renderer.dispose(); // keep the WebGL context alive so the canvas can be reused
}
