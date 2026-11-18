import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isProcedure, resolveContractProcedures } from '@orpc/server';
import { describe, expect, it } from 'vite-plus/test';
import { pool } from '#/db/client.ts';
import { manifest } from '#/manifest.ts';
import { router } from '#/router.ts';

// MIGRATION.md is ticked by hand. A ticked row names what does its job in this repo, and a drop
// names the DECISIONS.md row that says why, so a tick with nothing behind it fails here.
const root = resolve(import.meta.dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const procedures = new Set<string>();

await resolveContractProcedures({ router, path: [] }, ({ contract, path }) => {
  if (isProcedure(contract)) procedures.add(path.join('.'));
});

const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];

  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);

  return [];
};

// The permissions, events, actions and other dotted names core learns from the manifest, not its
// labels: `Ticket` names a record type, not code.
const declared = new Set(strings(manifest).filter((name) => /^[\w-]+(\.[\w-]+)+$/.test(name)));

const { rows } = await pool.query<{ name: string }>(
  "SELECT table_name AS name FROM information_schema.tables WHERE table_name LIKE 'frontline\\_%'",
);

const tables = new Set(rows.map(({ name }) => name));

const config = read('api/src/config.ts');

// Where the API calls core through the sdk, as `core.users.get(`.
const api = globSync('api/src/**/*.ts', { cwd: root }).map(read).join('\n');

// The first cell of each table row in DECISIONS.md.
const decisions = new Set(
  read('DECISIONS.md')
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\| (-|Old\s+\| New\s)/.test(line))
    .map((line) => line.slice(2, line.indexOf(' | ')).trim()),
);

const PATH = /(?<![\w/])(?:api|ui|widget|e2e|scripts|tools)\/[\w./[\]-]+\.\w+/g;

/** A name in backticks that this repo has: a procedure, a manifest entry, a table or a setting. */
const exists = (name: string) => {
  const head = name.split('(')[0]?.trim() ?? '';

  return (
    procedures.has(head) ||
    declared.has(head) ||
    tables.has(head) ||
    (/^manifest\.\w+$/.test(head) && head.slice('manifest.'.length) in manifest) ||
    (/^[A-Z][A-Z0-9_]+$/.test(head) && config.includes(`${head}:`)) ||
    (/^[a-z]+\.[a-zA-Z]+$/.test(head) && api.includes(`.${head}(`))
  );
};

const ticked = read('MIGRATION.md')
  .split('\n')
  .map((text, index) => ({ line: index + 1, text }))
  .filter(({ text }) => text.startsWith('- [x] '));

const label = ({ line, text }: { line: number; text: string }) =>
  `MIGRATION.md:${line} ${text.slice(6, 120)}`;

const links = (text: string) =>
  [...text.matchAll(/the "(.+?)" row in DECISIONS\.md/g)].map((match) => match[1] ?? '');

const isDrop = (text: string) => /\*\*drop\*\*|\bdropped\b/i.test(text);

describe('MIGRATION.md', () => {
  it('ticks a port only where it names the code that does the job', () => {
    const unproven = ticked.filter(
      ({ text }) =>
        !isDrop(text) &&
        !/\(filed https:\/\/github\.com\/[^)]+\)/.test(text) &&
        ![...text.matchAll(PATH)].some(([path]) => existsSync(resolve(root, path))) &&
        ![...text.matchAll(/`([^`]+)`/g)].some(([, name]) => exists(name ?? '')),
    );

    expect(unproven.map(label)).toEqual([]);
  });

  it('ticks a drop only with the DECISIONS.md row that says why', () => {
    const unexplained = ticked.filter(({ text }) => isDrop(text) && links(text).length === 0);

    expect(unexplained.map(label)).toEqual([]);
  });

  it('links only DECISIONS.md rows that exist', () => {
    const stale = ticked.flatMap((row) =>
      links(row.text)
        .filter((old) => !decisions.has(old))
        .map((old) => `${label(row)}: "${old}"`),
    );

    expect(stale).toEqual([]);
  });
});
