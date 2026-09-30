import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const TEMP = /^\..+\.\d+\.tmp$/;

/**
 * Writes `data` to `file` so a reader never sees a partial file: the bytes go to a temp file in the same
 * directory and are renamed into place (atomic on one filesystem). A failed write removes its temp file
 * and leaves any previous `file` untouched. `write` is injectable for tests.
 */
export async function writeFileAtomic(file: string, data: Buffer, write: (path: string, data: Buffer) => Promise<void> = writeFile): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  try {
    await write(temp, data);
    await rename(temp, file);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

/** Removes temp files that a killed run left in `dir`. They are never mistaken for a cache hit (the name differs) but would otherwise be saved with the cache. */
export async function removeStaleTempFiles(dir: string): Promise<void> {
  for (const name of await readdir(dir)) if (TEMP.test(name)) await rm(join(dir, name), { force: true });
}
