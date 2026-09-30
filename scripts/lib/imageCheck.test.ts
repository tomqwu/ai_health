import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { distinctColors } from './imageCheck';

describe('distinctColors', () => {
  it('finds one colour in a blank image', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#f3f2ee' } }).png().toBuffer();
    expect(await distinctColors(png)).toBe(1);
  });
  it('finds many colours in a gradient', async () => {
    const raw = Buffer.alloc(256 * 64 * 3);
    for (let x = 0; x < 256; x++) for (let y = 0; y < 64; y++) raw.writeUInt8(x, (y * 256 + x) * 3);
    const png = await sharp(raw, { raw: { width: 256, height: 64, channels: 3 } }).png().toBuffer();
    expect(await distinctColors(png, 1)).toBeGreaterThan(200);
  });
});
