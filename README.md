# Healthy Living (ai_health)

A bilingual (English / 简体中文) static site with practical, evidence-based guides for healthy living, starting with fitness.
Live site: https://tomqwu.github.io/ai_health/

- Design: [docs/superpowers/specs/2026-09-29-fitness-platform-design.md](docs/superpowers/specs/2026-09-29-fitness-platform-design.md)
- Plans: [docs/superpowers/plans/](docs/superpowers/plans/)
- Architecture: [docs/architecture.md](docs/architecture.md)
- 3D figure pipeline: [docs/figure-pipeline.md](docs/figure-pipeline.md)

## Develop

```bash
npm ci
npm run dev        # http://localhost:4321/ai_health/
npm test           # unit tests
npm run check      # type check
npm run lint
npm run build      # production build
npm run preview    # serve the built site
npx playwright install chromium   # once per machine
npm run render:figures   # pre-render 3D exercise frames into public/figures/
npm run test:e2e   # end-to-end tests (run render:figures first)
npm run build:human      # regenerate the 3D human (needs Blender + MPFB; see docs/figure-pipeline.md)
```

## Privacy

This repository is public and holds generic content only. Personal profiles, measurements and plans stay in each visitor's browser.
