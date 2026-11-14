// Sizes that grow only on purpose. Run after `pnpm build`: it fails when a number
// passes its ceiling in budgets.json. With `--base <file>` (CI, the base branch's
// budgets.json) it also fails when this change raises a ceiling, unless
// `--allow-increase` (the PR's budget-increase label).
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'ui/dist');

const Assets = z.object({
  js: z.object({ sync: z.array(z.string()), async: z.array(z.string()) }),
});

const Stats = z.object({
  shared: z.array(z.object({ name: z.string(), assets: Assets })),
  exposes: z.array(z.object({ path: z.string(), assets: Assets })),
});

const Budgets = z.record(z.string(), z.int().positive());

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const stats = Stats.parse(readJson(join(dist, 'mf-stats.json')));

const gzip = (files: string[]) =>
  files.reduce((sum, file) => sum + gzipSync(readFileSync(join(dist, file))).length, 0);

const exposed = (path: string) => {
  const expose = stats.exposes.find((entry) => entry.path === path);

  if (!expose) throw new Error(`The remote no longer exposes ${path}.`);

  return gzip(expose.assets.js.sync);
};

// web provides its singletons (erxes-ui/federation); a bundled copy is a second React.
const bundled = stats.shared
  .filter(({ assets }) => assets.js.sync.length + assets.js.async.length > 0)
  .map(({ name }) => name);

if (bundled.length > 0)
  throw new Error(`The remote bundles web's ${bundled.join(', ')}. Share them with import: false.`);

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
  'ui.remoteEntry.gzip': gzip(['remoteEntry.js']),
  'agents.context.bytes': instructions.reduce((sum, text) => sum + Buffer.byteLength(text), 0),
};

const budgets = Budgets.parse(readJson(join(root, 'budgets.json')));
const failures: string[] = [];

for (const [name, value] of Object.entries(measured)) {
  const ceiling = budgets[name];

  process.stdout.write(`${name.padEnd(24)} ${String(value).padStart(7)} / ${ceiling ?? '-'}\n`);

  if (ceiling === undefined) failures.push(`${name} has no ceiling in budgets.json.`);
  else if (value > ceiling) failures.push(`${name} is ${value}, over its ceiling of ${ceiling}.`);
}

const { values } = parseArgs({
  options: { base: { type: 'string' }, 'allow-increase': { type: 'boolean', default: false } },
});

if (values.base && existsSync(values.base) && !values['allow-increase']) {
  const base = Budgets.parse(readJson(values.base));
  const raised = Object.entries(budgets).filter(([name, ceiling]) => ceiling > (base[name] ?? 0));

  for (const [name, ceiling] of raised)
    failures.push(`${name}'s ceiling rises to ${ceiling}. Add the budget-increase label.`);
}

if (failures.length > 0) throw new Error(failures.join('\n'));
