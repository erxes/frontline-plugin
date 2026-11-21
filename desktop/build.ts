// Builds the Electron app into dist/: the main process and the preload, each one CommonJS file
// with its packages inlined, the app's pages beside them, and the icons rendered from icons.ts.
// electron-builder ships only dist/.
import { cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { build } from 'vite-plus/pack';
import { appIcon, TRAY_STATES, trayTemplate, trayTile } from './icons.ts';

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

/** `svg` as a `size`-pixel square PNG in dist/. */
const render = (name: string, svg: string, size: number) =>
  writeFile(
    resolve(dist, name),
    new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng(),
  );

// electron-builder makes each system's icon from the 1024 one. A tray icon has its double-size
// copy beside it, as name@2x.png. macOS's menu bar takes a 16-point template, the other trays
// 32 pixels.
await Promise.all([
  render('icon.png', appIcon(), 1024),
  ...TRAY_STATES.flatMap((state) => [
    render(`tray-${state}Template.png`, trayTemplate(state), 16),
    render(`tray-${state}Template@2x.png`, trayTemplate(state), 32),
    render(`tray-${state}.png`, trayTile(state), 32),
    render(`tray-${state}@2x.png`, trayTile(state), 64),
  ]),
]);
