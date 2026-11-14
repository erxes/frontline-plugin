// The old plugin as the port steps read it: from the git objects recorded in
// migration/inventory.json, never the working tree, like the inventory does.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

export const repo = resolve(import.meta.dirname, '..');

const Inventory = z.object({
  source: z.object({ from: z.string(), plugin: z.string(), sha: z.string() }),
  registrations: z.array(z.object({ kind: z.string(), id: z.unknown() })),
  graphql: z.object({
    operations: z.array(
      z.object({
        kind: z.string(),
        name: z.string(),
        returns: z.string(),
        file: z.string(),
        line: z.number(),
        module: z.string(),
      }),
    ),
  }),
});

export const inventory = Inventory.parse(
  JSON.parse(readFileSync(join(repo, 'migration/inventory.json'), 'utf8')),
);

const { source } = inventory;

const git = (...rest: string[]) =>
  execFileSync('git', ['-C', source.from, ...rest], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** An old file's text at the recorded commit. */
export const read = (path: string) => git('cat-file', 'blob', `${source.sha}:${path}`);

/** Every old file path under `prefix`. */
export const filesUnder = (prefix: string) =>
  git('ls-tree', '-r', '--name-only', source.sha, prefix).trim().split('\n');

export const oldUi = `frontend/plugins/${source.plugin}_ui/src`;
export const oldApi = `backend/plugins/${source.plugin}_api/src`;
export const sourceFile = /\.tsx?$/;

/** `<module> [--to <path>]`, with the `--` pnpm passes through. */
export const moduleArgs = (usage: string) => {
  const argv = process.argv.slice(2);

  const { values, positionals } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    allowPositionals: true,
    options: { to: { type: 'string' } },
  });

  const [name] = positionals;

  if (!name) {
    console.error(`usage: ${usage}`);
    process.exit(1);
  }

  return { name, to: values.to };
};

export type Note = { line: number; text: string };

/** Writes the worklist a step leaves in .scratch/<step>/<module>.md and prints where. */
export const writeReport = (
  step: string,
  name: string,
  summary: string[],
  sections: { title: string; from: string; notes: Note[] }[],
) => {
  const path = join(repo, '.scratch', step, `${name}.md`);

  const body = sections
    .filter((section) => section.notes.length > 0)
    .flatMap((section) => [
      '',
      `## ${section.title}`,
      '',
      `From \`${section.from}\`.`,
      '',
      ...section.notes
        .toSorted((a, b) => a.line - b.line)
        .map((note) => `- [ ] old line ${note.line}: ${note.text}`),
    ]);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [`# ${step} ${name}`, '', ...summary, ...body, ''].join('\n'));
  console.info(`wrote ${relative(repo, path)}`);
};

/**
 * Formats and autofixes what a step wrote with the repo's own lint, and returns the line
 * counting what's left. Findings are expected right after a port: they are the worklist.
 */
export const tidy = (path: string) => {
  const run = spawnSync('pnpm', ['exec', 'vp', 'check', '--fix', relative(repo, path)], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, OXLINT_TSGOLINT_PATH: 'node_modules/.bin/tsrs-lint' },
  });

  return (
    /Found \d+ errors? and \d+ warnings?/.exec(run.stdout + run.stderr)?.[0] ?? 'Lint is clean'
  );
};
