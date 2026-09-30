import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeStaleTempFiles, writeFileAtomic } from './atomicWrite';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'atomic-write-'));
  dirs.push(d);
  return d;
};
/** A write that puts half the data on disk and then fails, like a full disk. */
const partialThenFail = (message: string) => async (path: string, data: Buffer) => {
  writeFileSync(path, data.subarray(0, 2));
  throw new Error(message);
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('creates missing directories and leaves only the finished file', async () => {
    const dir = tmp();
    const file = join(dir, 'a/b/frame.webp');
    await writeFileAtomic(file, Buffer.from('image'));
    expect(readFileSync(file, 'utf8')).toBe('image');
    expect(readdirSync(join(dir, 'a/b'))).toEqual(['frame.webp']);
  });
  it('replaces an existing file whole', async () => {
    const file = join(tmp(), 'x.webp');
    writeFileSync(file, 'old old old');
    await writeFileAtomic(file, Buffer.from('new'));
    expect(readFileSync(file, 'utf8')).toBe('new');
  });
  it('never leaves the target or a temp file behind when the write fails', async () => {
    const dir = tmp();
    const file = join(dir, 'x.webp');
    await expect(writeFileAtomic(file, Buffer.from('image'), partialThenFail('disk full'))).rejects.toThrow('disk full');
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });
  it('keeps the previous file when the rename step is never reached', async () => {
    const file = join(tmp(), 'x.webp');
    writeFileSync(file, 'good');
    await expect(writeFileAtomic(file, Buffer.from('bad'), partialThenFail('killed'))).rejects.toThrow('killed');
    expect(readFileSync(file, 'utf8')).toBe('good');
  });
});

describe('removeStaleTempFiles', () => {
  it('removes temp files left by an interrupted run, and only those', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'frame.webp'), 'ok');
    writeFileSync(join(dir, '.frame.webp.123.tmp'), 'partial');
    await removeStaleTempFiles(dir);
    expect(readdirSync(dir)).toEqual(['frame.webp']);
  });
});
