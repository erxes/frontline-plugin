import { devices, type PlaywrightTestConfig } from '@playwright/test';
import { OWNER_STATE } from './fixtures.ts';

/*
 * The plugin in web, in Chromium, against `e2e/stack.sh up`: core's released images
 * and this plugin's image on a fresh database. Every spec runs in the light and the
 * dark theme, so axe checks contrast in both. Playwright reads these named exports
 * as the config (the lint preset allows no default export here). CI adds
 * `--reporter=github,list`.
 */
export const testDir = '.';
export const outputDir = 'test-results';
export const fullyParallel = true;
export const forbidOnly = true;

/*
 * The plugin's public URL is http://frontline:3399 (e2e/compose.yml), so core reaches it
 * between containers. The browser maps that name to the published port and treats it as
 * secure, as it would localhost.
 */
const PLUGIN_ORIGIN = 'http://frontline:3399';

const launchOptions = {
  args: [
    '--host-resolver-rules=MAP frontline 127.0.0.1',
    `--unsafely-treat-insecure-origin-as-secure=${PLUGIN_ORIGIN}`,
  ],
};

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
    use: { ...devices['Desktop Chrome'], colorScheme, storageState: OWNER_STATE, launchOptions },
  })),
] satisfies PlaywrightTestConfig['projects'];
