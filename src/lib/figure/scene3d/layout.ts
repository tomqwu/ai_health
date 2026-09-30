/** Canvas height for a given width: the viewer is 4:3 portrait. (No three.js here, so the island's first load stays small.) */
export function stageHeightFor(width: number): number {
  return Math.round((width * 4) / 3);
}
