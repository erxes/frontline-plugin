// Builds what websites embed: one ES module per embed in dist/, sharing chunks in dist/chunks/,
// which the API serves at /widget. `--watch` rebuilds on each change.
import { resolve } from 'node:path';
import { build } from 'vite-plus';

const root = import.meta.dirname;

/** Each embed, by the file name a website's script loads. */
const entries = {
  messenger: resolve(root, 'src/messenger.tsx'),
};

await build({
  configFile: false,
  root,
  logLevel: 'warn',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // tools/budgets.ts reads which chunks each embed loads.
    manifest: true,
    target: 'es2022',
    // The embeds load from a website, which has no `<link rel=modulepreload>` for them.
    modulePreload: false,
    rolldownOptions: {
      input: entries,
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
    watch: process.argv.includes('--watch') ? {} : null,
  },
});
