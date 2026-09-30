import type { Vec3 } from './math/vec3';
import type { SmithParams } from './geometry/smith';

export interface ArrowSpec {
  from: Vec3;
  to: Vec3;
}

/** Vertical arrow beside the left bar sleeve showing the bar's direction of travel (cm, world). */
export function barArrow(direction: 'up' | 'down' | undefined, barCenter: Vec3, smith: SmithParams): ArrowSpec | null {
  if (!direction) return null;
  const x = smith.railHalfSpacingCm + smith.sleeveLengthCm + 12;
  const [y0, y1] = direction === 'down' ? [barCenter[1] + 18, barCenter[1] - 18] : [barCenter[1] - 18, barCenter[1] + 18];
  return { from: [x, y0, barCenter[2]], to: [x, y1, barCenter[2]] };
}
