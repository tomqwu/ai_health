import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://tomqwu.github.io',
  base: '/ai_health',
  trailingSlash: 'always',
  // The dev toolbar injects DOM into every page, which breaks figure screenshots.
  devToolbar: { enabled: false },
  integrations: [preact()],
});
