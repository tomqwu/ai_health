import sharp from 'sharp';

/** Distinct RGB colours on a sparse grid; a blank or failed WebGL render has only a handful. */
export async function distinctColors(png: Buffer, step = 7): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const seen = new Set<number>();
  for (let i = 0; i + 2 < data.length; i += info.channels * step) seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  return seen.size;
}
