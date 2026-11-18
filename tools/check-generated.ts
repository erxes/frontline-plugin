// Committed files in the form their tools give: mn.json's keys sorted, and the migrations as
// drizzle generates them, regenerated into .scratch so a failed check never changes one.
// `--fix` sorts mn.json.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '..');

// Sorted, a new key lands among its neighbours instead of where every branch appends, at the end.
const mnFile = join(root, 'ui/src/i18n/mn.json');
const text = readFileSync(mnFile, 'utf8');
const mn = z.record(z.string(), z.string()).parse(JSON.parse(text));
const keys = Object.keys(mn).toSorted();

// JSON.parse keeps a repeated key's last value, so count the file's own entries.
if (text.match(/^ {2}"/gm)?.length !== keys.length)
  throw new Error('ui/src/i18n/mn.json repeats a key. Keep one of its values.');

// Written as text: an object would put integer-like keys first.
const sorted = `{\n${keys.map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(mn[key])}`).join(',\n')}\n}\n`;

if (process.argv.includes('--fix')) {
  writeFileSync(mnFile, sorted);
  process.exit(0);
}

const lines = sorted.split('\n');
const moved = text.split('\n').findIndex((line, index) => line !== lines[index]);

if (moved !== -1)
  throw new Error(`ui/src/i18n/mn.json is out of order at line ${moved + 1}. Run vp run fix.`);

const scratch = join(root, '.scratch');

mkdirSync(scratch, { recursive: true });

const dir = mkdtempSync(join(scratch, 'generated-'));
const api = join(root, 'api');
const drizzle = join(api, 'node_modules/drizzle-kit/bin.cjs');

const run = (entry: string, ...args: string[]) => {
  const output = execFileSync(process.execPath, [entry, ...args], {
    cwd: api,
    encoding: 'utf8',
  });

  process.stdout.write(output);

  return output;
};

try {
  const migrations = join(root, 'api/drizzle');
  const generated = join(dir, 'drizzle');
  const config = join(dir, 'drizzle.config.ts');

  cpSync(migrations, generated, { recursive: true });
  writeFileSync(
    config,
    `import config from ${JSON.stringify(join(root, 'api/drizzle.config.ts'))};\nexport default { ...config, out: ${JSON.stringify(relative(join(root, 'api'), generated))} };\n`,
  );
  run(drizzle, 'check');

  const result = run(drizzle, 'generate', '--config', config);

  // Drizzle sometimes prints an error and exits zero. Require its completion message too.
  if (!/No schema changes, nothing to migrate|Your SQL migration file/.test(result))
    throw new Error('Drizzle did not complete schema generation.');

  const files = globSync('**/*', { cwd: generated, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(generated.length + 1));

  const drift = files.filter(
    (file) =>
      !globSync(file, { cwd: migrations }).length ||
      readFileSync(join(generated, file), 'utf8') !== readFileSync(join(migrations, file), 'utf8'),
  );

  if (drift.length > 0)
    throw new Error(
      `Migration drift in ${drift.join(', ')}. Run pnpm db:generate and commit api/drizzle.`,
    );

  process.stdout.write('Migrations match the schema.\n');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
