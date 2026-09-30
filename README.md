# Healthy Living

Practical guides for healthy living, in English and 简体中文, starting with fitness. The site shows how to use home-gym equipment, which exercises it supports, and builds a weekly training plan around your equipment, space and time.

**Live site:** https://tomqwu.github.io/ai_health/

## What's in the app today

- **Two languages, one toggle.** Every page is available in English and Simplified Chinese. The first visit follows your browser's language, and you can switch at any time.
- **Realistic 3D exercise figures.** An interactive 3D person demonstrates each exercise on the equipment. You can orbit the camera, step through the key positions, or press Play to watch the whole movement. Movement arrows show which way to move. Without 3D support, the site shows still images instead.
- **Safety first.** A safety page lists the warning signs that mean stop and get checked, plus everyday habits for training safely at home.
- **Works on any screen.** The layout adapts to phones, and the site is built to be accessible: keyboard navigation, screen-reader labels, and readable contrast in light and dark mode.

The 3D figures can be previewed on a review page with every figure and piece of equipment: [/en/dev/figures/](https://tomqwu.github.io/ai_health/en/dev/figures/).

## Built, not yet on screen

The planning engine behind the upcoming weekly planner is finished and tested:

- **Knows your equipment.** A catalog describes machines, attachments and exercises, using typical dimensions, so you never have to measure anything.
- **Only plans what fits.** It checks whether each exercise works with the equipment you own, your space and your height. For example, it knows when an exercise needs more clearance than your ceiling allows, or when the bar can't go low enough. It never quietly plans something that doesn't fit, and it explains why an exercise was left out.
- **Fills a week for you.** Starting from a program template, it picks exercises for each day, keeps the day within your time budget, and has a short-session mode for busy days.
- **Your profile stays private.** It is saved only in your browser, with backups if anything goes wrong, and can be exported or imported as a file.

## Coming next

| Next up | What you'll get |
|---|---|
| Figure system | 3D figures for every exercise and piece of equipment |
| Planner and PDF | A setup wizard, a week view where you can swap exercises, and printable PDF plans |
| Equipment guides and programs | Step-by-step guides for each machine, the full exercise library, and ready-made weekly programs |
| Later | Nutrition and daily habit tracking |

Progress is tracked in [GitHub milestones](https://github.com/tomqwu/ai_health/milestones).

## Privacy

Everything personal stays on your device. Your profile, preferences and plans are saved only in your browser and never sent anywhere. This repository is public and holds only generic content.

## For developers

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

Docs:
- [Design spec](docs/superpowers/specs/2026-09-29-fitness-platform-design.md)
- [Implementation plans](docs/superpowers/plans/)
- [Architecture](docs/architecture.md)
- [3D figure pipeline](docs/figure-pipeline.md)
