import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['tools/*.ts'],
      project: ['*.ts', '{tools,scripts,e2e}/**/*.ts'],
      // The plugin in web (pnpm e2e); the config names the specs and the setup file.
      playwright: {
        config: ['e2e/playwright.config.ts'],
        entry: ['e2e/*.spec.ts', 'e2e/*.setup.ts'],
      },
      // The check task runs these: oxlint calls tsrs-lint through OXLINT_TSGOLINT_PATH, and
      // react-doctor reads doctor.config.jsonc.
      ignoreDependencies: ['tsrs', 'react-doctor'],
    },
    api: {
      project: ['src/**/*.ts'],
    },
    ui: {
      entry: ['src/config.tsx', 'src/Frontline.tsx'],
      project: ['src/**/*.{ts,tsx,css}'],
    },
    // Each file in src/ is an embed a website loads (build.ts).
    widget: {
      entry: ['src/*.tsx'],
      project: ['src/**/*.{ts,tsx}'],
    },
  },
};

export default config;
