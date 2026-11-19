// Builds the Electron app into dist/: the main process and the preload, each one CommonJS file
// with its packages inlined, and the setup page and icons beside them. electron-builder ships
// only dist/.
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite-plus/pack';

const root = import.meta.dirname;
const dist = resolve(root, 'dist');

/** One self-contained file: a sandboxed preload can't load a shared chunk. */
const bundle = (entry: string, clean: boolean) =>
  build({
    config: false,
    cwd: root,
    entry: [resolve(root, entry)],
    format: 'cjs',
    platform: 'node',
    outDir: dist,
    outExtensions: () => ({ js: '.cjs' }),
    clean,
    dts: false,
    logLevel: 'warn',
    deps: { neverBundle: ['electron'], alwaysBundle: [/./] },
  });

await bundle('src/main.ts', true);

await bundle('src/preload.ts', false);

await cp(resolve(root, 'static'), dist, { recursive: true });
