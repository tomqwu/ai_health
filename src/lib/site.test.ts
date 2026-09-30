import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withBase } from './site';

describe('withBase', () => {
  it('joins the base and a relative path with one slash', () => {
    expect(withBase('en/', '/ai_health/')).toBe('/ai_health/en/');
    expect(withBase('/models/human.glb', '/ai_health')).toBe('/ai_health/models/human.glb');
  });
  it('returns the base for an empty path', () => {
    expect(withBase('', '/ai_health/')).toBe('/ai_health/');
    expect(withBase('', '/')).toBe('/');
  });
});

describe('outside Vite', () => {
  // Under plain Node (tsx), `import.meta.env` is undefined; the helpers must fall back to "/".
  it('withBase, localizedPath and switchLocale work without a base', () => {
    const script = `
      const { withBase } = await import('./src/lib/site.ts');
      const { localizedPath, switchLocale } = await import('./src/lib/i18n/index.ts');
      console.log(JSON.stringify([withBase('a/'), localizedPath('zh', 'fitness'), switchLocale('/en/safety/', 'zh')]));
    `;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      encoding: 'utf8',
      cwd: fileURLToPath(new URL('../..', import.meta.url)), // the script's relative imports resolve from the repo root
    });
    expect(JSON.parse(out)).toEqual(['/a/', '/zh/fitness/', '/zh/safety/']);
  });
});
