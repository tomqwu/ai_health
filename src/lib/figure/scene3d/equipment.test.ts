import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../math/vec3';
import type { Primitive, SurfaceKind } from '../geometry/primitives';
import { createEquipment } from './equipment';

// Node-only: three's scene graph needs no WebGL.

const box = (id: string, center: Vec3, size: Vec3, surface: SurfaceKind): Primitive => ({ kind: 'box', id, center, size, surface });
const cyl = (id: string, start: Vec3, end: Vec3, radius: number, surface: SurfaceKind): Primitive => ({ kind: 'cylinder', id, start, end, radius, surface });
const sphere = (id: string, center: Vec3, radius: number, surface: SurfaceKind, capBelowY?: number): Primitive => ({ kind: 'sphere', id, center, radius, surface, ...(capBelowY !== undefined && { capBelowY }) });

describe('createEquipment', () => {
  it('builds one mesh per primitive, sized from shared unit shapes (metres)', () => {
    const eq = createEquipment('props');
    eq.update([box('a', [0, 50, 0], [10, 20, 30], 'pad'), cyl('b', [0, 0, 0], [0, 100, 0], 2, 'chrome'), sphere('c', [0, 30, 0], 30, 'ball'), sphere('d', [0, 0, 0], 30, 'dome', 5)]);
    const [a, b, c, d] = eq.group.children as Array<import('three').Mesh>;
    expect(a!.scale.toArray()).toEqual([0.1, 0.2, 0.3]);
    expect(b!.position.y).toBeCloseTo(0.5);
    expect(b!.scale.y).toBeCloseTo(1);
    expect(c!.scale.x).toBeCloseTo(0.3);
    expect(d!.geometry).not.toBe(c!.geometry); // a capped sphere has its own shape
    eq.update([box('e', [0, 0, 0], [1, 1, 1], 'pad')]);
    expect((eq.group.children[4] as import('three').Mesh).geometry).toBe(a!.geometry);
  });
  it('moves existing meshes by id and hides the ones no longer listed', () => {
    const eq = createEquipment('props');
    eq.update([cyl('bar', [-10, 100, 0], [10, 100, 0], 1.5, 'chrome'), box('plate', [20, 100, 0], [2, 40, 40], 'plate')]);
    const bar = eq.group.getObjectByName('bar')!;
    eq.update([cyl('bar', [-10, 60, 0], [10, 60, 0], 1.5, 'chrome')]);
    expect(eq.group.getObjectByName('bar')).toBe(bar);
    expect(bar.position.y).toBeCloseTo(0.6);
    expect(eq.group.getObjectByName('plate')!.visible).toBe(false);
    eq.dispose();
  });
});
