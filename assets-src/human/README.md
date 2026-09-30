# Human model source

Regenerate `public/models/human.glb` and `src/lib/figure/pose/skeleton.json`:

```bash
bash scripts/setup-mpfb.sh   # once per machine (downloads MPFB and the CC0 asset pack)
npm run build:human
```

Body shape and assets are set in `human.config.json`. Skin colour is applied at render time
(`SKIN_TONE` in `src/lib/figure/scene3d/human.ts`), so the model ships without skin textures.
See `docs/figure-pipeline.md` for conventions.
