import { devices, type PlaywrightTestConfig } from '@playwright/test';
import { OWNER_STATE } from './fixtures.ts';

/*
 * The plugin in web, in Chromium, against `e2e/stack.sh up`: core's released images
 * and this plugin's image on a fresh database. The light theme runs every spec; the
 * dark theme runs only the a11y specs, which put every screen through axe, so axe
 * checks contrast in both without running each flow twice. Playwright reads these
 * named exports as the config (the lint preset allows no default export here). CI
 * adds `--shard` and `--reporter=github,list`.
 */
export const testDir = '.';
export const outputDir = 'test-results';
export const fullyParallel = true;
export const forbidOnly = true;

export const use = {
  baseURL: 'http://localhost:8080',
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
} satisfies PlaywrightTestConfig['use'];

export const projects = [
  { name: 'setup', testMatch: 'owner.setup.ts' },
  ...(['light', 'dark'] as const).map((colorScheme) => ({
    name: colorScheme,
    dependencies: ['setup'],
    ...(colorScheme === 'dark' && { testMatch: 'a11y*.spec.ts' }),
    use: { ...devices['Desktop Chrome'], colorScheme, storageState: OWNER_STATE },
  })),
] satisfies PlaywrightTestConfig['projects'];
