// Turns migration/inventory.json into the port's checklist: MIGRATION.md (one
// section per module), migration/schema-draft.ts (draft Drizzle tables from the
// Mongoose schemas) and migration/import-map.ts (collection → table, for
// scripts/import-mongo.ts). Rerun after `pnpm migrate:inventory`; ticks in an
// existing MIGRATION.md are kept, and a table with a migration keeps its import
// entry and leaves the draft.
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as pg from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  CLIENT_PORTAL,
  CORE_CALLS,
  WHOLE_MODULES,
  type Equivalent,
  HELPERS,
  isClientPortal,
  isStructureField,
  OWN_TEAMS,
  pluginCall,
  PUBLIC_ROUTE,
  REGISTRATIONS,
  UNMAPPED,
} from './core-map.ts';
import { IMPORT_MAP } from './import-map.ts';

const here = import.meta.dirname;
const root = resolve(here, '..');
const alphabetical = (a: string, b: string) => a.localeCompare(b, 'en');

const Value = z.union([
  z.string(),
  z.object({ dynamic: z.string() }),
  z.object({ missing: z.literal(true) }),
]);

const Located = z.object({ file: z.string(), line: z.number() });
const InModule = Located.extend({ module: z.string() });

const Inventory = z.object({
  source: z.object({ plugin: z.string(), ref: z.string(), sha: z.string() }),
  modules: z.array(z.string()),
  graphql: z.object({
    operations: z.array(
      InModule.extend({ kind: z.string(), name: z.string(), returns: z.string() }),
    ),
    types: z.array(InModule.extend({ kind: z.string(), name: z.string() })),
  }),
  schemas: z.array(
    InModule.extend({
      name: z.string(),
      timestamps: z.boolean(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          required: z.boolean().optional(),
        }),
      ),
    }),
  ),
  collections: z.array(
    Located.extend({ collection: z.string(), module: z.string(), schema: z.string().nullable() }),
  ),
  routes: z.array(InModule.extend({ method: z.string(), path: z.string(), webhook: z.boolean() })),
  uiRoutes: z.array(
    Located.extend({
      path: z.string(),
      element: z.string(),
      files: z.array(z.string()),
      fields: z.array(z.string()),
      uiModules: z.array(z.string()),
      behaviors: z.array(Located.extend({ call: z.string(), arg: z.string().optional() })),
    }),
  ),
  trpcCalls: z.array(
    InModule.extend({
      pluginName: Value.optional(),
      target: Value.optional(),
      action: Value.optional(),
      dynamic: z.string().optional(),
    }),
  ),
  eventCalls: z.array(InModule.extend({ helper: z.string(), type: Value.optional() })),
  workerFiles: z.array(z.object({ file: z.string(), evidence: z.array(z.string()) })),
  registrations: z.array(
    Located.extend({ kind: z.string(), id: Value, group: z.string().optional() }),
  ),
  env: z.array(Located.extend({ name: z.string() })),
  uiModules: z.object({ files: z.number(), symbols: z.record(z.string(), z.number()) }),
});

const inventory = Inventory.parse(
  JSON.parse(readFileSync(resolve(here, 'inventory.json'), 'utf8')),
);

/** The new plugin's name; the old one's is `inventory.source.plugin`. */
const PLUGIN = 'frontline';
const { plugin } = inventory.source;
const short = (file: string) => file.replace(/^(backend|frontend)\/plugins\//, '');
const at = (item: { file: string; line: number }) => `\`${short(item.file)}:${item.line}\``;

const show = (value: z.infer<typeof Value> | undefined) =>
  value === undefined
    ? '?'
    : typeof value === 'string'
      ? value
      : 'dynamic' in value
        ? `<${value.dynamic}>`
        : '?';

// Variables old erxes itself needed; core and the template replace them.
const RUNTIME_ENV =
  /^(NODE_ENV|PORT|MONGO_URL|REDIS_\w+|RABBITMQ\w*|ELASTICSEARCH\w*|ENABLED_PLUGINS\w*|LOAD_BALANCER_ADDRESS|VERSION|DOMAIN|MAIN_APP_DOMAIN|UI_ENTRY_URL)$/;

// Checklist items -------------------------------------------------------------

/** `details` are the brief under an open item; a ticked one drops them. */
type Item = { section: string; text: string; kind?: Equivalent['kind']; details?: string[] };

const items = new Map<string, Item[]>();

const add = (
  module: string,
  section: string,
  text: string,
  kind?: Equivalent['kind'],
  details?: string[],
) => {
  const list = items.get(module) ?? [];

  list.push({ section, text, kind, details });
  items.set(module, list);
};

/** Whether the old plugin used core's departments or branches, by call or by field. */
let usesTeams = false;
const TEAMS = `${PLUGIN}_teams`;
const TEAM_MEMBERS = `${PLUGIN}_team_members`;

const describe = (equivalent: Equivalent) =>
  (equivalent.kind === 'gap' || equivalent.kind === 'drop'
    ? `**${equivalent.kind}**: ${equivalent.note ?? ''}`
    : `${equivalent.kind} \`${equivalent.to}\`${equivalent.note ? ` (${equivalent.note})` : ''}`
  ).replaceAll('<plugin>', PLUGIN);

const camel = (text: string) =>
  text.replaceAll(/[_-](\w)/g, (_match, char: string) => char.toUpperCase());

const tableName = (collection: string) =>
  `${PLUGIN}_${collection.startsWith(`${plugin}_`) ? collection.slice(plugin.length + 1) : collection}`;

const schemaByRef = new Map(
  inventory.schemas.map((schema) => [`${schema.file}#${schema.name}`, schema]),
);

for (const collection of inventory.collections) {
  const schema = collection.schema ? schemaByRef.get(collection.schema) : undefined;
  const table = tableName(collection.collection);

  add(
    collection.module,
    'Tables',
    schema
      ? `\`${table}\` from collection \`${collection.collection}\` (${schema.fields.length} fields, draft \`${camel(table)}\` in migration/schema-draft.ts) ${at(schema)}`
      : `\`${table}\` from collection \`${collection.collection}\` (schema not found: write it by hand) ${at(collection)}`,
  );
}

const VERBS: Record<string, string> = {
  add: 'create',
  create: 'create',
  edit: 'update',
  update: 'update',
  remove: 'remove',
  delete: 'remove',
};

const plural = (word: string) =>
  word.endsWith('us')
    ? `${word}es`
    : /[^aeiou]y$/.test(word)
      ? `${word.slice(0, -1)}ies`
      : word.endsWith('s')
        ? word
        : `${word}s`;

const lowerFirst = (word: string) => `${word.charAt(0).toLowerCase()}${word.slice(1)}`;

/**
 * The procedure an operation suggests, by its record and verb: `getTicketPipelines` →
 * `ticketPipelines.list`, `addTicketStatus` → `ticketStatuses.create`,
 * `knowledgeBaseTopicsTotalCount` → `knowledgeBaseTopics.list`. Names it can't read
 * stay under the old module.
 */
const procedureOf = (op: { name: string; kind: string; module: string }) => {
  const bare = op.name.replace(/^get(?=[A-Z])/, '');
  const leading = /^(add|create|edit|update|remove|delete)(?=[A-Z])/.exec(bare);
  const trailing = /(Add|Create|Edit|Update|Remove|Delete)$/.exec(bare);
  const read = /(TotalCount|Detail)$/.exec(bare);

  const [record, verb] = leading?.[1]
    ? [bare.slice(leading[1].length), VERBS[leading[1]]]
    : trailing?.[1]
      ? [bare.slice(0, -trailing[1].length), VERBS[trailing[1].toLowerCase()]]
      : read?.[1]
        ? [bare.slice(0, -read[1].length), read[1] === 'Detail' ? 'get' : 'list']
        : op.kind === 'query'
          ? [bare, plural(bare) === bare && !bare.endsWith('us') ? 'list' : 'get']
          : [undefined, undefined];

  return record && verb
    ? `${plural(lowerFirst(record))}.${verb}`
    : `${op.module}.${lowerFirst(bare)}`;
};

for (const op of inventory.graphql.operations) {
  const portal = isClientPortal(op);

  add(
    op.module,
    'Procedures',
    portal
      ? `${op.kind} \`${op.name}\` → ${describe(CLIENT_PORTAL)} ${at(op)}`
      : `${op.kind} \`${op.name}\` → procedure \`${procedureOf(op)}\` (returns \`${op.returns}\`) ${at(op)}`,
    portal ? 'drop' : undefined,
  );
}

// A page belongs to the module its component or last path segment names.
const singular = (word: string) => word.replace(/ies$/, 'y').replace(/s$/, '');

const moduleOfPage = (route: { path: string; element: string }) => {
  const byName = inventory.modules
    .filter((module) => route.element.toLowerCase().includes(module.toLowerCase()))
    .toSorted((a, b) => b.length - a.length)[0];

  const segment = route.path
    .split('/')
    .filter((part) => part && !part.startsWith(':') && part !== '*')
    .at(-1);

  const bySegment = segment && inventory.modules.find((module) => module === singular(segment));

  return byName ?? bySegment ?? '(plugin)';
};

const moduleOfOperation = new Map(inventory.graphql.operations.map((op) => [op.name, op.module]));

/** Which screens reach each old UI file, by element, so a brief lists the files only its screen has. */
const screensOf = new Map<string, Set<string>>();

// A `/*` route holds other pages' routes and reaches all their files, so it doesn't count.
for (const route of inventory.uiRoutes.filter((entry) => !entry.path.endsWith('*')))
  for (const file of route.files)
    screensOf.set(file, (screensOf.get(file) ?? new Set()).add(route.element));

const uiSrc = `frontend/plugins/${plugin}_ui/src/`;

/** What a page's port has to cover: its files, the operations it calls, old shared UI and behavior. */
const briefOf = (route: (typeof inventory.uiRoutes)[number]) => {
  const own = route.files.filter((file) => screensOf.get(file)?.size === 1);
  const byModule = Map.groupBy(route.fields, (field) => moduleOfOperation.get(field) ?? 'core');

  const calls = [...byModule]
    .toSorted(([a], [b]) => alphabetical(a, b))
    .map(([module, fields]) => `${module}: ${fields.map((field) => `\`${field}\``).join(', ')}`);

  const behaviors = [
    ...new Set(
      route.behaviors.map((entry) => `${entry.call}${entry.arg ? ` "${entry.arg}"` : ''}`),
    ),
  ];

  return [
    route.files.length > 0 &&
      `files: ${route.files.length}, ${own.length} only here${own.length ? `: ${own.map((file) => `\`${file.replace(uiSrc, '')}\``).join(', ')}` : ''}`,
    calls.length > 0 && `calls: ${calls.join('; ')}`,
    route.uiModules.length > 0 &&
      `ui-modules: ${route.uiModules.map((name) => `\`${name}\``).join(', ')}`,
    behaviors.length > 0 && `keeps: ${behaviors.join(' · ')}`,
  ].filter((line) => typeof line === 'string');
};

for (const route of inventory.uiRoutes) {
  add(
    moduleOfPage(route),
    'Pages',
    `\`/${PLUGIN}/${route.path.replace(/^\//, '')}\` (${route.element}) ${at(route)}`,
    undefined,
    briefOf(route),
  );
}

for (const call of inventory.trpcCalls) {
  const target = typeof call.pluginName === 'string' ? call.pluginName : undefined;
  const key = `${show(call.target)}.${show(call.action)}`;

  const equivalent = isClientPortal(call)
    ? CLIENT_PORTAL
    : call.dynamic || !target
      ? UNMAPPED
      : target === 'core'
        ? (CORE_CALLS[key] ?? WHOLE_MODULES[show(call.target)] ?? UNMAPPED)
        : pluginCall(target, plugin, show(call.action));

  add(
    call.module,
    'Core calls',
    `${target ?? '<dynamic>'} \`${key}\` → ${describe(equivalent)} ${at(call)}`,
    equivalent.kind,
  );

  if (equivalent === OWN_TEAMS) usesTeams = true;
}

// Old core's structure: the plugin keeps its own departments and branches, imported with
// their Mongo ids, so the ids its records hold stay valid.
for (const schema of inventory.schemas) {
  for (const field of schema.fields.filter((entry) => isStructureField(entry.name))) {
    usesTeams = true;
    add(
      schema.module,
      'Tables',
      `\`${schema.name}.${field.name}\` → plugin-owned: ids in \`${TEAMS}\`, unchanged by the import ${at(schema)}`,
      OWN_TEAMS.kind,
    );
  }
}

if (usesTeams) {
  add(
    '(plugin)',
    'Tables',
    `\`${TEAMS}\` and \`${TEAM_MEMBERS}\` from old core's \`departments\`, \`branches\` and the members' \`departmentIds\` and \`branchIds\` (drafts in migration/schema-draft.ts, imported by scripts/import-mongo.ts): core has no departments or branches`,
    OWN_TEAMS.kind,
  );
}

for (const call of inventory.eventCalls) {
  const equivalent = isClientPortal(call) ? CLIENT_PORTAL : (HELPERS[call.helper] ?? UNMAPPED);

  add(
    call.module,
    'Events',
    `\`${call.helper}\`${call.type ? ` ${show(call.type)}` : ''} → ${describe(equivalent)} ${at(call)}`,
    equivalent.kind,
  );
}

for (const route of inventory.routes) {
  const equivalent = isClientPortal(route) ? CLIENT_PORTAL : PUBLIC_ROUTE;

  add(
    route.module,
    'Routes',
    `${route.method} \`${route.path}\`${route.webhook ? ' (webhook)' : ''} → ${describe(equivalent)} ${at(route)}`,
    equivalent.kind,
  );
}

for (const worker of inventory.workerFiles) {
  add(
    '(plugin)',
    'Workers and crons',
    `\`${short(worker.file)}\` (${worker.evidence.join(', ')}) → plugin-owned: a job in the API process`,
  );
}

for (const entry of inventory.registrations) {
  const equivalent = REGISTRATIONS[entry.kind] ?? UNMAPPED;

  add(
    '(plugin)',
    'Registrations',
    `${entry.kind} \`${show(entry.id)}\`${entry.group ? ` (${entry.group})` : ''} → ${describe(equivalent)} ${at(entry)}`,
    equivalent.kind,
  );
}

const env = inventory.env.filter((entry) => !RUNTIME_ENV.test(entry.name));

for (const entry of env) {
  add('(plugin)', 'Environment', `\`${entry.name}\` → api/src/config.ts ${at(entry)}`);
}

// Most used first: ticking one records what replaces it, for every page after.
for (const [name, files] of Object.entries(inventory.uiModules.symbols).toSorted(
  (a, b) => b[1] - a[1] || alphabetical(a[0], b[0]),
))
  add('(plugin)', 'Shared UI', `\`${name}\` (${files} files)`);

// MIGRATION.md -------------------------------------------------------------------

const markdown = resolve(root, 'MIGRATION.md');

/** An item's old `file:line`. */
const LOCATION = /`[^`]+:\d+`/;

/**
 * What an item is about: its text before the arrow or the first parenthesis, and
 * its old location. A written line keeps its key while its rest is rewritten to say
 * what the item became.
 */
const keyOf = (text: string) =>
  `${text.split(' → ')[0]?.split(' (')[0] ?? text} ${LOCATION.exec(text)?.[0] ?? ''}`;

// Ticks survive a rerun with the text they were ticked with, decisions and
// `(filed <url>)` included. An open item keeps the `  - note: …` lines under it.
const ticked = new Map<string, string>();
const notes = new Map<string, string[]>();
let open: string | undefined;

for (const line of existsSync(markdown) ? readFileSync(markdown, 'utf8').split('\n') : []) {
  const item = /^- \[([ x])\] (.+)$/.exec(line);
  const note = /^ {2}- note: .+$/.exec(line);

  if (item?.[1] === 'x') ticked.set(keyOf(item[2] ?? ''), item[2] ?? '');

  if (item) open = item[1] === ' ' ? keyOf(item[2] ?? '') : undefined;
  else if (note && open) notes.set(open, [...(notes.get(open) ?? []), note[0]]);
  else if (!line.startsWith('  ')) open = undefined;
}

const all = [...items.values()].flat();
const gaps = all.filter((item) => item.kind === 'gap').length;
const drops = all.filter((item) => item.kind === 'drop').length;

const order = [
  '(plugin)',
  ...[...items.keys()].filter((module) => module !== '(plugin)').toSorted(alphabetical),
];

const sections = [
  'Tables',
  'Procedures',
  'Pages',
  'Core calls',
  'Events',
  'Routes',
  'Workers and crons',
  'Registrations',
  'Environment',
  'Shared UI',
];

const symbols = Object.keys(inventory.uiModules.symbols).length;

const lines = [
  `# Migrating ${plugin} to the new core`,
  '',
  `From erxes/erxes \`${inventory.source.ref}\` (${inventory.source.sha.slice(0, 10)}), \`${plugin}_api\` and \`${plugin}_ui\`.`,
  `${all.length} items: ${gaps} gaps and ${drops} drops. Follow \`.agents/skills/plugin-migrate\`: one module at a time,`,
  'tick an item once it works on the new core and its old bugs and workarounds are gone, tick a gap once filed, ending its line with `(filed <issue url>)`,',
  'and tick a drop once its code is left out (segments, the client portal and brands are not migrated).',
  '',
  `The old UI imports ${symbols} symbols from \`ui-modules\` in ${inventory.uiModules.files} files; the host has no \`ui-modules\`, so each page rebuilds them from \`erxes-ui\` or \`ui/src/shared\`, and Plugin-wide's Shared UI section records which (members through its \`SelectMember\` and \`MemberInline\`, other records through \`EntityPicker\`). erxes-ui's own old-to-new component table is \`packages/ui/MIGRATION.md\` in erxes (branch \`postgre\`).`,
  `GraphQL types (${inventory.graphql.types.length}) are listed in \`migration/inventory.json\` for reference; procedures replace them.`,
  '',
];

for (const module of order) {
  const moduleItems = items.get(module) ?? [];

  if (!moduleItems.length) continue;

  lines.push(`## ${module === '(plugin)' ? 'Plugin-wide' : module}`, '');

  for (const section of sections) {
    const sectionItems = moduleItems.filter((item) => item.section === section);

    if (!sectionItems.length) continue;

    lines.push(`### ${section}`, '');

    for (const item of sectionItems) {
      const key = keyOf(item.text);
      const done = ticked.get(key);

      if (done !== undefined) lines.push(`- [x] ${done}`);
      else
        lines.push(
          `- [ ] ${item.text}`,
          ...(notes.get(key) ?? []),
          ...(item.details ?? []).map((detail) => `  - ${detail}`),
        );
    }

    lines.push('');
  }
}

writeFileSync(markdown, lines.join('\n'));

// schema-draft.ts and import-map.ts ------------------------------------------------

const COLUMN: Record<string, `${keyof typeof pg}(${string})`> = {
  String: 'text()',
  Number: 'doublePrecision()',
  Boolean: 'boolean()',
  Date: 'timestamp({ withTimezone: true })',
  ObjectId: 'text()',
};

const columnOf = (type: string) => {
  const array = /^\[(.*)\]$/.exec(type);
  const scalar = COLUMN[array?.[1] ?? type];

  if (array) return scalar && array[1] !== 'Date' ? `${scalar}.array()` : 'jsonb()';

  return scalar ?? 'jsonb()';
};

const identifier = (name: string) =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

const snake = (name: string) => name.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const drafted = new Set<string>();
const tables: string[] = [];
const imports: (typeof IMPORT_MAP)[number][] = [];

/** Tables a migration creates: ported, so their schema and import entry are hand-written now. */
const ported = new Set(
  globSync('api/drizzle/*.sql', { cwd: root }).flatMap((file) =>
    [...readFileSync(resolve(root, file), 'utf8').matchAll(/CREATE TABLE "(\w+)"/g)].map(
      (match) => match[1],
    ),
  ),
);

for (const collection of inventory.collections) {
  const schema = collection.schema ? schemaByRef.get(collection.schema) : undefined;
  const table = tableName(collection.collection);

  if (!schema || drafted.has(table)) continue;

  drafted.add(table);

  // A ported table may take a better name than its collection's; its entry names it.
  const kept = IMPORT_MAP.find((entry) => entry.collection === collection.collection);

  if (kept && ported.has(kept.table)) {
    imports.push(kept);
    continue;
  }

  // `timestamps: true` adds createdAt and updatedAt below; a schema that also declares them gets them once.
  const stamped = new Set(schema.timestamps ? ['createdAt', 'updatedAt'] : []);

  const fields = schema.fields.filter(
    (entry) => entry.type !== 'spread' && entry.name !== '_id' && !stamped.has(entry.name),
  );

  const columns = fields.map((entry) => {
    const column = `${columnOf(entry.type)}${entry.required ? '.notNull()' : ''}`;

    return `    ${identifier(entry.name)}: ${column}, // ${entry.type}`;
  });

  const spreads = schema.fields.filter((entry) => entry.type === 'spread');

  const stamps = schema.timestamps
    ? [
        '    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),',
        '    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),',
      ]
    : [];

  tables.push(
    [
      `/** From \`${collection.collection}\` (${short(schema.file)}:${schema.line}). */`,
      `export const ${camel(table)} = table(`,
      `  '${table.slice(PLUGIN.length + 1)}',`,
      '  {',
      '    // The Mongo `_id`, kept as text so references survive the import.',
      '    id: text().primaryKey(),',
      '    orgId: text().notNull(),',
      ...spreads.map(
        (entry) => `    // Spread in the old schema, list its fields here: ${entry.name}`,
      ),
      ...columns,
      ...stamps,
      '  },',
      `  (t) => [index('${table}_org_idx').on(t.orgId)],`,
      ');',
    ].join('\n'),
  );

  const columnMap: [string, string][] = [
    ['_id', 'id'],
    ...fields.map((entry): [string, string] => [entry.name, snake(entry.name)]),
    ...(schema.timestamps
      ? ([
          ['createdAt', 'created_at'],
          ['updatedAt', 'updated_at'],
        ] satisfies [string, string][])
      : []),
  ];

  imports.push({
    collection: collection.collection,
    table,
    columns: Object.fromEntries(columnMap),
  });
}

// The plugin's own departments and branches, in place of old core's structure.
if (usesTeams) {
  tables.push(
    [
      "/** Old core's departments and branches, now the plugin's. Ids are the Mongo `_id`s. */",
      `export const ${camel(TEAMS)} = table(`,
      "  'teams',",
      '  {',
      '    id: text().primaryKey(),',
      '    orgId: text().notNull(),',
      "    kind: text({ enum: ['department', 'branch'] }).notNull(),",
      '    name: text(),',
      '    code: text(),',
      '    parentId: text(),',
      '    supervisorId: text(),',
      '    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),',
      '    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),',
      '  },',
      `  (t) => [index('${TEAMS}_org_idx').on(t.orgId)],`,
      ');',
      '',
      '/**',
      " * Who is in which team, from old users' departmentIds and branchIds. User ids are core's,",
      ' * which keep the Mongo `_id` of members imported from old erxes. Old users may point at',
      ' * removed departments: drop those rows before adding a foreign key to the teams.',
      ' */',
      `export const ${camel(TEAM_MEMBERS)} = table(`,
      "  'team_members',",
      '  {',
      '    orgId: text().notNull(),',
      '    teamId: text().notNull(),',
      '    userId: text().notNull(),',
      '  },',
      `  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index('${TEAM_MEMBERS}_user_idx').on(t.userId)],`,
      ');',
    ].join('\n'),
  );

  const structure = (collection: string, kind: string) => ({
    collection,
    table: TEAMS,
    values: { kind },
    columns: {
      _id: 'id',
      title: 'name',
      code: 'code',
      parentId: 'parent_id',
      supervisorId: 'supervisor_id',
      createdAt: 'created_at',
    },
  });

  const members = (field: string) => ({
    collection: 'users',
    table: TEAM_MEMBERS,
    unwind: field,
    columns: { [field]: 'team_id', _id: 'user_id' },
  });

  imports.push(
    structure('departments', 'department'),
    structure('branches', 'branch'),
    members('departmentIds'),
    members('branchIds'),
  );
}

writeFileSync(
  resolve(here, 'schema-draft.ts'),
  [
    `// Draft tables for ${plugin}, written by migration/checklist.ts from the Mongoose`,
    '// schemas. Nothing imports this file: move a table into api/src/db/schema.ts when',
    '// you port its module, pick real types (integer, enums, foreign keys), then run',
    '// `pnpm db:generate` and add its core_enable_tenant_rls line (schema-change skill).',
    `import { boolean, doublePrecision, index, jsonb, ${usesTeams ? 'primaryKey, ' : ''}text, timestamp } from 'drizzle-orm/pg-core';`,
    "import { table } from '../api/src/db/table.ts';",
    '',
    tables.join('\n\n'),
    '',
  ].join('\n'),
);

writeFileSync(
  resolve(here, 'import-map.ts'),
  [
    '// Which Mongo field goes to which column, per collection, for scripts/import-mongo.ts.',
    '// Written by migration/checklist.ts; edit it as the tables in api/src/db/schema.ts change.',
    '// `values` are columns every row gets; `unwind` makes one row per item of that array field.',
    'export const IMPORT_MAP: {',
    '  collection: string;',
    '  table: string;',
    '  columns: Record<string, string>;',
    '  values?: Record<string, string>;',
    '  unwind?: string;',
    `}[] = ${JSON.stringify(imports, null, 2)};`,
    '',
  ].join('\n'),
);

console.info(
  `MIGRATION.md: ${all.length} items, ${gaps} gaps, ${drops} drops; ${tables.length} draft tables`,
);
