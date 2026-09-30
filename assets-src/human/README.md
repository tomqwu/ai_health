# Human model source

Regenerate `public/models/human.glb` and `src/lib/figure/pose/skeleton.json`:

```bash
bash scripts/setup-mpfb.sh   # once per machine (downloads MPFB and the CC0 asset pack)
npm run build:human
```

Body shape and assets are set in `human.config.json`. Skin colour is applied at render time
(`SKIN_TONE` in `src/lib/figure/scene3d/human.ts`), so the model ships without skin textures.
See `docs/figure-pipeline.md` for conventions.

## Pinned toolchain

The committed model was built on 2026-09-29 with:

- MPFB 2.0.17, installed from the exact extension zip
  `https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip`
  (sha256 `4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87`)
- Asset pack `https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`
  (sha256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`)

`scripts/setup-mpfb.sh` downloads to a `.part` file, verifies the sha256 and only then installs; it fails if a
different MPFB version is already installed.
