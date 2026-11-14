// Writes the procedure skeletons for one old API module: each GraphQL query
// and mutation becomes a procedure with its name, permission and zod input,
// shaped like api/src/modules/channels. It never translates a resolver: each
// body calls `unported('<old resolver>')`, which doesn't exist, so
// `vp run check` lists every body left to write. Notes go to
// .scratch/port-api/<module>.md.
//
//   pnpm migrate:api -- <old module> [--to <new module>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Lang, parse } from '@ast-grep/napi';
import {
  filesUnder,
  inventory,
  moduleArgs,
  type Note,
  oldApi,
  read,
  repo,
  sourceFile,
  tidy,
  writeReport,
} from './old-plugin.ts';

const { name: oldModule, to } = moduleArgs('pnpm migrate:api -- <old module> [--to <new module>]');
const newModule = to ?? oldModule;
const target = join(repo, 'api/src/modules', newModule, `${newModule}.ts`);

if (existsSync(target)) {
  console.error(`${relative(repo, target)} exists; pass --to with a new module name`);
  process.exit(1);
}

const operations = inventory.graphql.operations.filter(
  (op) => op.module === oldModule && op.kind !== 'subscription',
);

if (operations.length === 0) {
  console.error(`no GraphQL operations for module ${oldModule} in migration/inventory.json`);
  process.exit(1);
}

const apiFiles = filesUnder(oldApi).filter((file) => sourceFile.test(file));

// What the old names became --------------------------------------------------------------

/** Old permission ids to new actions, from MIGRATION.md's ticked permission lines. */
const actions = new Map(
  [
    ...readFileSync(join(repo, 'MIGRATION.md'), 'utf8').matchAll(
      /^- \[x\] permission `(\w+)` \([^)]*\) → `([\w.]+)`/gm,
    ),
  ].map((match) => [match[1] ?? '', match[2] ?? '']),
);

/** New actions to their key in api/src/core.ts's PERMISSIONS. */
const permissionKeys = new Map(
  [
    ...readFileSync(join(repo, 'api/src/core.ts'), 'utf8').matchAll(/^\s+(\w+): '([\w.]+)',$/gm),
  ].map((match) => [match[2] ?? '', match[1] ?? '']),
);

const oldPermissions = inventory.registrations.flatMap((entry) =>
  entry.kind === 'permission' && typeof entry.id === 'string' ? [entry.id] : [],
);

// GraphQL SDL --------------------------------------------------------------

const sdlCache = new Map<string, string>();
const sdl = (file: string) => sdlCache.get(file) ?? sdlCache.set(file, read(file)).get(file) ?? '';
const schemaFiles = apiFiles.filter((file) => /\/graphql\/|typeDefs|schema/i.test(file));

/** The `input` or `enum` named `name`, wherever the old plugin declares it. */
const declaration = (keyword: 'input' | 'enum', name: string) => {
  for (const file of schemaFiles) {
    const match = new RegExp(`\\b${keyword}\\s+${name}\\s*\\{([^}]*)\\}`).exec(sdl(file));

    if (match) return match[1] ?? '';
  }

  return undefined;
};

/** `name: Type = default` pairs at depth zero of an argument or field list. */
const pairs = (list: string) =>
  list
    .replace(/#[^\n]*/g, '')
    .split(/[,\n]/)
    .map((part) => /^\s*(\w+)\s*:\s*([[\]\w!]+)/.exec(part))
    .flatMap((match) => (match?.[1] && match[2] ? [{ name: match[1], type: match[2] }] : []));

const SCALARS: Record<string, string> = {
  String: 'z.string()',
  ID: 'z.string()',
  Int: 'z.number().int()',
  Float: 'z.number()',
  Boolean: 'z.boolean()',
  Date: 'z.coerce.date()',
};

/** A zod schema for a GraphQL input type; notes what it can't express. */
const zodOf = (type: string, note: (text: string) => void, depth = 0): string => {
  const required = type.endsWith('!');
  const bare = required ? type.slice(0, -1) : type;

  if (bare.startsWith('[')) return `z.array(${zodOf(bare.slice(1, -1), note, depth)})`;

  const scalar = SCALARS[bare];

  if (scalar) return scalar;

  const values = declaration('enum', bare);

  if (values !== undefined) {
    const names = values.split(/\s+/).filter(Boolean);

    return `z.enum([${names.map((value) => `'${value}'`).join(', ')}])`;
  }

  const fields = depth < 3 ? declaration('input', bare) : undefined;

  if (fields !== undefined) return objectOf(pairs(fields), note, depth + 1);

  note(`\`${bare}\` has no zod form here (JSON, Upload or an interpolated type): write it by hand`);

  return 'z.unknown()';
};

/** A zod object for GraphQL fields; `_id` becomes `id`, and a nullable field is optional. */
const objectOf = (
  fields: { name: string; type: string }[],
  note: (text: string) => void,
  depth = 0,
): string => {
  const entries = fields.map(({ name, type }) => {
    const schema = zodOf(type, note, depth);

    return `${name === '_id' ? 'id' : name}: ${schema}${type.endsWith('!') ? '' : '.optional()'}`;
  });

  return entries.length > 0 ? `z.object({ ${entries.join(', ')} })` : 'z.object({})';
};

/** The argument list of a root field, as written in the old SDL. */
const argumentsOf = (file: string, name: string) => {
  const text = sdl(file);
  const at = new RegExp(`(^|\\s)${name}\\s*(\\(|:)`, 'm').exec(text);

  if (!at || !at[0].endsWith('(')) return '';

  let depth = 1;
  let end = at.index + at[0].length;

  for (; end < text.length && depth > 0; end++)
    depth += text[end] === '(' ? 1 : text[end] === ')' ? -1 : 0;

  return text.slice(at.index + at[0].length, end - 1);
};

// The old resolver --------------------------------------------------------------

const resolverFiles = apiFiles.filter(
  (file) => file.includes(`/modules/${oldModule}/`) && /resolvers/.test(file),
);

/** Where the old resolver for `name` is, and the old permission it checks. */
const resolverOf = (name: string) => {
  for (const file of resolverFiles) {
    const root = parse(Lang.TypeScript, read(file)).root();

    const node =
      root.find({ rule: { kind: 'pair', has: { field: 'key', regex: `^${name}$` } } }) ??
      root.find({
        rule: { kind: 'method_definition', has: { field: 'name', regex: `^${name}$` } },
      });

    if (!node) continue;

    const body = node.text();

    // Old core checked the action named like the resolver, unless the body checks another.
    const permission =
      oldPermissions.find((id) => new RegExp(`['"\`]${id}['"\`]`).test(body)) ??
      oldPermissions.find((id) => id === name);

    return { at: `${file}:${node.range().start.line + 1}`, permission };
  }

  return undefined;
};

// Names --------------------------------------------------------------

const VERBS: Record<string, string> = {
  Add: 'create',
  Create: 'create',
  Edit: 'update',
  Update: 'update',
  Remove: 'remove',
  Delete: 'remove',
};

/** `getChannels` → `list`, `channelAdd` → `create`, `channelAddMembers` → `addMembers`. */
const procedureName = (old: string) => {
  const noun = new RegExp(`${oldModule}s?`, 'i');
  const get = /^get/.exec(old);
  const rest = old.replace(/^get/, '').replace(noun, '');
  const plural = new RegExp(`${oldModule}s$`, 'i').test(old);

  if (get && rest === '') return plural ? 'list' : 'get';

  const verb = VERBS[rest];

  if (verb) return verb;

  const name = `${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;

  return get ? `get${rest}` : name || old;
};

// Write --------------------------------------------------------------

const notes: Note[] = [];
const rows: string[] = [];
const used = new Set<string>();
const procedures: string[] = [];

for (const op of operations) {
  const opNotes: string[] = [];
  const note = (text: string) => opNotes.push(text);
  const resolver = resolverOf(op.name);
  const action = resolver?.permission ? actions.get(resolver.permission) : undefined;
  const key = action ? permissionKeys.get(action) : undefined;
  let name = procedureName(op.name);

  if (used.has(name)) {
    note(`\`${name}\` is taken: fold \`${op.name}\` into it if it only differs by filter`);
    name = op.name;
  }

  used.add(name);

  if (!resolver) note(`no resolver found for \`${op.name}\` under modules/${oldModule}`);
  else if (!resolver.permission)
    note('the old resolver names no permission: pick the action it needs');
  else if (!key)
    note(
      `old permission \`${resolver.permission}\` isn't ticked in MIGRATION.md with an action in api/src/core.ts`,
    );

  const args = argumentsOf(op.file, op.name);

  if (args.includes('$')) note('its arguments interpolate shared SDL: check the input');

  const builder = `${op.kind === 'mutation' ? 'writes' : 'reads'}(${key ? `PERMISSIONS.${key}` : `unported('the ${resolver?.permission ?? 'missing'} permission')`})`;
  const input = objectOf(pairs(args), note);
  const old = `${op.kind} \`${op.name}${args ? `(${args.replace(/\s+/g, ' ').trim()})` : ''}: ${op.returns}\``;

  procedures.push(
    [
      `  /** Was ${old}. */`,
      `  ${name}: ${builder}`,
      `    .input(${input})`,
      `    .handler(() => unported('${resolver?.at ?? op.file}')),`,
    ].join('\n'),
  );
  rows.push(`  ${op.name}: { procedure: '${newModule}.${name}' },`);
  notes.push(
    ...opNotes.map((text) => ({ line: op.line, text: `\`${op.name}\` → \`${name}\`: ${text}` })),
  );
}

mkdirSync(dirname(target), { recursive: true });

writeFileSync(
  target,
  [
    "import { z } from 'zod';",
    "import { PERMISSIONS } from '#/core.ts';",
    "import { reads, writes } from '#/orpc.ts';",
    '',
    `export const ${newModule}Procedures = {`,
    procedures.join('\n\n'),
    '};',
    '',
  ].join('\n'),
);

const lint = tidy(target);

writeReport(
  'port-api',
  oldModule,
  [
    `${procedures.length} procedures from ${inventory.source.plugin}'s \`${oldModule}\` into ${relative(repo, target)}.`,
    `After lint's autofix: ${lint}.`,
    '',
    `1. Add \`...${newModule}Procedures\` to api/src/router.ts under \`${newModule}\`.`,
    '2. Write each body where `unported(...)` names the old resolver: port what it does, with the tables from the schema-change skill. Fold procedures that only differ by filter.',
    '3. Add `.output()` and typed errors as api/src/modules/channels does.',
    '4. Tick each operation in MIGRATION.md, and add these rows to OPERATIONS in migration/ui-map.ts for `pnpm migrate:ui`:',
    '',
    '```ts',
    ...rows,
    '```',
  ],
  [{ title: relative(repo, target), from: operations[0]?.file ?? oldApi, notes }],
);
