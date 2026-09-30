import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { extractSkeleton } from './lib/extractSkeleton';

const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const BUILD = 'assets-src/human/build';
const RAW = `${BUILD}/human.raw.glb`;
const META = `${BUILD}/human.meta.json`;
const OUT = 'public/models/human.glb';
const SKELETON = 'src/lib/figure/pose/skeleton.json';
const MAX_BYTES = 8 * 1024 * 1024;

mkdirSync(BUILD, { recursive: true });
mkdirSync('public/models', { recursive: true });
execFileSync(
  BLENDER,
  ['-b', '--python-exit-code', '1', '--python', 'assets-src/human/generate_human.py', '--', 'assets-src/human/human.config.json', RAW, META],
  { stdio: 'inherit' },
);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(RAW);
doc.getRoot().listScenes()[0]!.setExtras(JSON.parse(readFileSync(META, 'utf8')));
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(OUT, doc);

const bytes = statSync(OUT).size;
if (bytes > MAX_BYTES) throw new Error(`${OUT} is ${(bytes / 1e6).toFixed(1)} MB; the limit is 8 MB`);
const sha256 = createHash('sha256').update(readFileSync(OUT)).digest('hex');
const skeleton = extractSkeleton(await io.read(OUT), { file: OUT, sha256 });
writeFileSync(SKELETON, `${JSON.stringify(skeleton, null, 2)}\n`);
console.log(`Wrote ${OUT} (${(bytes / 1e6).toFixed(2)} MB): ${skeleton.bones.length} bones, stature ${skeleton.statureCm.toFixed(1)} cm`);
