import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['{tools,migration,scripts}/*.ts'],
      project: ['*.ts', '{tools,migration,scripts,e2e}/**/*.ts'],
      // The plugin in web (pnpm e2e); the config names the specs and the setup file.
      playwright: {
        config: ['e2e/playwright.config.ts'],
        entry: ['e2e/*.spec.ts', 'e2e/*.setup.ts'],
      },
      // Oxlint runs tsrs-lint through OXLINT_TSGOLINT_PATH in the check task.
      ignoreDependencies: ['tsrs'],
    },
    api: {
      project: ['src/**/*.ts'],
    },
    ui: {
      entry: ['src/config.tsx', 'src/Frontline.tsx'],
      project: ['src/**/*.{ts,tsx,css}'],
    },
  },
};

export default config;
