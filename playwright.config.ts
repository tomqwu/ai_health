import { defineConfig, devices } from '@playwright/test';
import { SOFTWARE_WEBGL_ARGS } from './scripts/lib/browser';

const PORT = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  webServer: {
    // --ignore-lock keeps Astro 7 in the foreground even when it detects an AI agent.
    command: `npm run build && npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/ai_health/en/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL so 3D pages render on CI machines without a GPU.
        launchOptions: { args: SOFTWARE_WEBGL_ARGS },
      },
    },
  ],
});
