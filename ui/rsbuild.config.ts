import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginReact } from '@rsbuild/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import reactCompiler from 'babel-plugin-react-compiler';
// What web shares. The host provides each one (`import: false`), so the plugin
// never bundles a second React, router, query client or erxes-ui.
import { SHARED } from 'erxes-ui/federation';

export default defineConfig({
  plugins: [
    pluginReact(),
    // The React Compiler memoizes components and hooks; it runs on our source before SWC.
    pluginBabel({
      include: /[\\/]src[\\/]/,
      babelLoaderOptions: (options) => {
        options.plugins ??= [];
        options.plugins.unshift(reactCompiler);
      },
    }),
    pluginModuleFederation({
      name: 'frontline_ui',
      filename: 'remoteEntry.js',
      exposes: { './config': './src/config.tsx', './frontline': './src/Frontline.tsx' },
      dts: false,
      shared: Object.fromEntries(
        SHARED.map((name) => [name, { singleton: true, requiredVersion: false, import: false }]),
      ),
    }),
  ],
  // No page of its own: web loads ./config and ./frontline from remoteEntry.js.
  source: { entry: {} },
  // As tsconfig.json's paths: @/ is a feature in src/modules, ~/ anything else in src.
  resolve: { alias: { '@': './src/modules', '~': './src' } },
  // Chunks load from wherever remoteEntry.js came from, not from web's origin.
  output: { assetPrefix: 'auto' },
  dev: { assetPrefix: true, lazyCompilation: false },
  server: { port: Number(process.env.UI_PORT) || 3099, cors: { origin: '*' } },
  // src/styles.css: the plugin's own Tailwind utilities.
  tools: { postcss: (_options, { addPlugins }) => addPlugins(tailwindcss()) },
});
