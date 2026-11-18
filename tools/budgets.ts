// Sizes that grow only on purpose: what web loads, each embed a website loads, and the
// instructions agents read. Run after `pnpm build`. It fails when a number passes its ceiling in
// budgets.json, and with `--base <checkout>` (CI: the base branch, built) when a number grows more
// than GROWTH over the base's, or a ceiling rises. `--allow-increase` (the PR's budget-increase
// label) lets both through. `--raise` sets each ceiling a number passed to the number plus
// HEADROOM, the only raise the check accepts.
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

const GROWTH = 0.02;
const HEADROOM = 0.05;

// A local build can measure a few bytes off CI's (remoteEntry.js varied by 1 between runs of the
// same code), so a raise made on a laptop passes when CI checks it.
const DRIFT = 0.01;

const Assets = z.object({
  js: z.object({ sync: z.array(z.string()), async: z.array(z.string()) }),
});

const Stats = z.object({
  shared: z.array(z.object({ name: z.string(), assets: Assets })),
  exposes: z.array(z.object({ path: z.string(), assets: Assets })),
});

const Budgets = z.record(z.string(), z.int().positive());

// What vite's manifest says each embed in widget/dist loads.
const WidgetManifest = z.record(
  z.string(),
  z.object({
    file: z.string(),
    name: z.string().optional(),
    isEntry: z.boolean().optional(),
    imports: z.array(z.string()).optional(),
  }),
);

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

const gzip = (files: string[], from: string) =>
  files.reduce((sum, file) => sum + gzipSync(readFileSync(join(from, file))).length, 0);

/** Every number in the built checkout at `root`. */
const measure = (root: string) => {
  const dist = join(root, 'ui/dist');
  const stats = Stats.parse(readJson(join(dist, 'mf-stats.json')));
  const widgetDist = join(root, 'widget/dist');
  const widgetManifest = WidgetManifest.parse(readJson(join(widgetDist, '.vite/manifest.json')));

  /** An embed's file and every chunk it imports before it runs. */
  const filesOf = (key: string, seen = new Set<string>()): Set<string> => {
    const chunk = widgetManifest[key];

    if (!chunk || seen.has(chunk.file)) return seen;

    seen.add(chunk.file);

    for (const imported of chunk.imports ?? []) filesOf(imported, seen);

    return seen;
  };

  const exposed = (path: string) => {
    const expose = stats.exposes.find((entry) => entry.path === path);

    if (!expose) throw new Error(`The remote no longer exposes ${path}.`);

    return gzip(expose.assets.js.sync, dist);
  };

  // web provides its singletons (erxes-ui/federation); a bundled copy is a second React.
  const bundled = stats.shared
    .filter(({ assets }) => assets.js.sync.length + assets.js.async.length > 0)
    .map(({ name }) => name);

  if (bundled.length > 0)
    throw new Error(
      `The remote bundles web's ${bundled.join(', ')}. Share them with import: false.`,
    );

  // What an agent reads before it starts: the AGENTS.md files and each skill's frontmatter.
  const instructions = ['CLAUDE.md', 'AGENTS.md', 'api/AGENTS.md', 'ui/AGENTS.md']
    .map((file) => readFileSync(join(root, file), 'utf8'))
    .concat(
      globSync('.agents/skills/*/SKILL.md', { cwd: root }).map(
        (file) => readFileSync(join(root, file), 'utf8').split('\n---', 1)[0] ?? '',
      ),
    );

  const measured: Record<string, number> = {
    'ui.config.gzip': exposed('./config'),
    'ui.frontline.gzip': exposed('./frontline'),
    'ui.remoteEntry.gzip': gzip(['remoteEntry.js'], dist),
    'agents.context.bytes': instructions.reduce((sum, text) => sum + Buffer.byteLength(text), 0),
  };

  for (const [key, chunk] of Object.entries(widgetManifest))
    if (chunk.isEntry)
      measured[`widget.${chunk.name ?? key}.gzip`] = gzip([...filesOf(key)], widgetDist);

  return measured;
};

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    'allow-increase': { type: 'boolean', default: false },
    raise: { type: 'boolean', default: false },
  },
});

const root = resolve(import.meta.dirname, '..');
const budgetsFile = join(root, 'budgets.json');
const budgets = Budgets.parse(readJson(budgetsFile));
const measured = measure(root);
const base = values.base ? measure(resolve(values.base)) : {};
const baseBudgets = values.base ? Budgets.parse(readJson(join(values.base, 'budgets.json'))) : {};
const allowed = values['allow-increase'];
const headroom = (value: number) => Math.ceil(value * (1 + HEADROOM));
const failures: string[] = [];

for (const [name, value] of Object.entries(measured)) {
  const ceiling = budgets[name];
  const before = base[name];
  const growth = before ? value / before - 1 : 0;

  process.stdout.write(
    `${name.padEnd(26)} ${String(value).padStart(7)} / ${String(ceiling ?? '-').padStart(7)}` +
      `${before ? `  ${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}% on ${before}` : ''}\n`,
  );

  if (values.raise && (ceiling === undefined || value > ceiling)) budgets[name] = headroom(value);
  else if (ceiling === undefined)
    failures.push(`${name} has no ceiling. Run pnpm budgets --raise.`);
  else if (value > ceiling)
    failures.push(
      `${name} is ${value}, over its ceiling of ${ceiling}. Run pnpm budgets --raise and add the budget-increase label.`,
    );

  if (growth > GROWTH && !allowed)
    failures.push(
      `${name} grows ${(growth * 100).toFixed(1)}% over the base branch, ${before} to ${value}. Over ${GROWTH * 100}% needs the budget-increase label.`,
    );
}

for (const [name, ceiling] of Object.entries(budgets)) {
  const value = measured[name];
  const raised = ceiling > (baseBudgets[name] ?? (values.base ? 0 : ceiling));

  if (raised && !allowed)
    failures.push(`${name}'s ceiling rises to ${ceiling}. Add the budget-increase label.`);

  if (raised && value !== undefined && ceiling > Math.ceil(value * (1 + HEADROOM + DRIFT)))
    failures.push(
      `${name}'s ceiling of ${ceiling} sits over ${value} plus ${HEADROOM * 100}%. Run pnpm budgets --raise.`,
    );
}

if (values.raise) writeFileSync(budgetsFile, `${JSON.stringify(budgets, null, 2)}\n`);

if (failures.length > 0) throw new Error(failures.join('\n'));
