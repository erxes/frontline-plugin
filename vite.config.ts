import { resolve } from 'node:path';
import { preset } from '@erxes/lint';
import { configDefaults, defineConfig } from 'vite-plus';
import { noSkips } from './tools/test/no-skips.ts';

// The type check is tsrs (TypeScript 7) running as oxlint's tsgolint.
const tsrs = 'OXLINT_TSGOLINT_PATH=node_modules/.bin/tsrs-lint';

// React Doctor on ui/ (doctor.config.jsonc), failing on any warning. Offline: no score upload,
// share link or crash reports, and no dependency scan.
const reactDoctor = 'react-doctor --no-score --no-supply-chain --blocking warning';

// Vite Task tracks the files each command reads; the lockfile is listed too, so an
// install that changes a dependency always reruns the task.
const tracked = { input: [{ auto: true }, 'pnpm-lock.yaml'] };

export default defineConfig({
  run: {
    tasks: {
      // A rerun with no edits replays the last result.
      check: {
        command: `erxes-check-escapes && ${tsrs} vp check && ${reactDoctor} && knip && erxes-check-docs && pnpm check:generated`,
        cache: tracked,
      },
      fix: { command: `pnpm check:generated --fix && ${tsrs} vp check --fix`, cache: false },
      test: { command: 'vp test run', cache: { ...tracked, env: ['DATA_TEST_URL'] } },
    },
  },
  fmt: {
    singleQuote: true,
    sortPackageJson: true,
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      'coverage/**',
      'api/drizzle/**',
      'pnpm-lock.yaml',
    ],
  },
  // The rules core and every plugin share, with the overrides for a plugin's api/, ui/ and
  // migration kit. Change them in core's packages/lint; a new @erxes/lint brings them here.
  lint: {
    ...preset,
    ignorePatterns: ['**/node_modules/**', '**/dist/**', 'coverage/**'],
  },
  test: {
    reporters: [...configDefaults.reporters, noSkips()],
    // A pull request runs only the test files its changes reach through imports (`--changed`,
    // plugin CI's integration job). A change to an input tests read without importing it reruns
    // every file: the toolchain and CI, the test setup, and the files code reads at run time
    // (migrations, SQL, JSON), which is anything in api/, ui/, widget/, desktop/ that isn't TypeScript.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      '**/.github/**',
      '**/pnpm-lock.yaml',
      '**/pnpm-workspace.yaml',
      '**/.node-version',
      '**/patches/**',
      '**/tsconfig*.json',
      '**/tools/test/**',
      '**/api/src/test/**',
      '**/{api,ui,widget,desktop}/**/!(*.ts|*.tsx)',
    ],
    projects: [
      {
        root: 'api',
        test: {
          name: 'api',
          include: ['src/**/*.test.ts'],
          environment: 'node',
          setupFiles: [resolve(import.meta.dirname, 'api/src/test/setup.ts')],
          // config.ts needs these; tests never reach core.
          env: {
            CORE_URL: 'http://127.0.0.1:9',
            PLUGIN_SECRET: 'test-secret-'.padEnd(32, 'x'),
            SECRETS_KEY: Buffer.from('test-secrets-key-32-bytes-long!!').toString('base64'),
            CALL_API_USER: 'erxes',
            CALL_API_PASSWORD: 'secret',
            CF_TURN_KEY_ID: 'turn-key',
            CF_TURN_API_TOKEN: 'turn-token',
            META_APP_ID: 'test-meta-app',
            META_APP_SECRET: 'test-meta-app-secret',
            META_VERIFY_TOKEN: 'test-meta-verify',
            META_RELAY_URL: 'https://relay.example/',
            META_RELAY_KEY: 'test-relay-key',
            PBX_RELAY_URL: 'https://pbx-relay.example/',
            PBX_RELAY_KEY: 'test-pbx-relay-key',
            WIDGETS_DOMAIN: 'https://widgets.e2e.test/',
            LOG_LEVEL: 'silent',
          },
        },
      },
    ],
  },
});
