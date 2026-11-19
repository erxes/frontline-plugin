// Builds what websites embed: one ES module per embed in dist/, sharing chunks in dist/chunks/,
// which the API serves at /widget. `--watch` rebuilds on each change.
import { resolve } from 'node:path';
import { build } from 'vite-plus';

const root = import.meta.dirname;

/** Each embed, by the file name a website's script loads. */
const entries = {
  messenger: resolve(root, 'src/messenger.tsx'),
  'messenger-preview': resolve(root, 'src/messenger-preview.tsx'),
  form: resolve(root, 'src/form.tsx'),
  knowledgebase: resolve(root, 'src/knowledgebase.tsx'),
};

type Modules = { getModuleInfo: (id: string) => { importers: readonly string[] } | null };

/**
 * The chunk a module goes in: packages, Vite's helpers and `src/shared` in `shared`, an embed's
 * own files in a chunk named after it. An embed's subfolder loads lazily, in a chunk of its own.
 * A file from another workspace package, such as the API's form logic, goes with the one embed
 * that imports it, or in `shared` when several do. One a lazy chunk imports too gets a chunk of
 * its own, so the embeds that never load it don't carry it.
 */
const chunkOf = (id: string, modules: Modules): string | null => {
  if (/^\0|\/node_modules\/|\/widget\/src\/shared\//.test(id)) return 'shared';

  if (id.includes('/widget/src/')) return /\/widget\/src\/(\w+)\/[^/]+$/.exec(id)?.[1] ?? null;

  const importers = new Set(
    modules.getModuleInfo(id)?.importers.map((importer) => chunkOf(importer, modules)),
  );

  if (importers.has(null)) return null;

  return importers.size === 1 ? ([...importers][0] ?? null) : 'shared';
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
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // A website loads an embed as `messenger.js?key=…`, a URL a lazy chunk can't import, so
        // no chunk imports an entry: that would run a second copy of it, and of Preact.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [{ name: (id, modules) => chunkOf(id, modules), debugName: 'by folder' }],
        },
      },
    },
    watch: process.argv.includes('--watch') ? {} : null,
  },
});
