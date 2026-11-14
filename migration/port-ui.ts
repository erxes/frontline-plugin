// Ports one module of the old plugin's UI into ui/src/<module>/. The JSX and
// layout carry over, imports move to erxes-ui 4.x, and Apollo hooks become
// oRPC query and mutation options through migration/ui-map.ts. It never
// translates what a resolver did. What it can't map goes to
// .scratch/port-ui/<module>.md; that report and `vp run check`'s failures are
// the rest of the work.
//
//   pnpm migrate:ui -- <module> [--to ui/src/<name>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { type Edit, Lang, parse, type SgNode } from '@ast-grep/napi';
import { z } from 'zod';
import {
  filesUnder,
  inventory,
  moduleArgs,
  type Note,
  oldUi as oldSrc,
  read,
  repo,
  sourceFile,
  tidy,
  writeReport,
} from './old-plugin.ts';
import { IMPORTS, type ImportRow, OPERATIONS } from './ui-map.ts';

const { name: moduleName, to } = moduleArgs('pnpm migrate:ui -- <module> [--to ui/src/<name>]');
const oldModule = `${oldSrc}/modules/${moduleName}`;
const target = resolve(repo, to ?? `ui/src/${moduleName}`);
const newSrc = join(repo, 'ui/src');
const oldFiles = filesUnder(oldSrc);
const skipped = /\/graphql\/|\.(test|spec|stories)\.tsx?$|\/__tests__\//;

const moduleFiles = oldFiles.filter(
  (file) => file.startsWith(`${oldModule}/`) && sourceFile.test(file) && !skipped.test(file),
);

if (moduleFiles.length === 0) {
  console.error(`no UI files under ${oldModule}`);
  process.exit(1);
}

// Where things go ----------------------------------------------------------------

/** The old file an import names, or undefined for a package. */
const resolveOld = (from: string, spec: string) => {
  const base = spec.startsWith('.')
    ? posix.join(posix.dirname(from), spec)
    : spec.startsWith('@/')
      ? `${oldSrc}/modules/${spec.slice(2)}`
      : spec.startsWith('~/')
        ? `${oldSrc}/${spec.slice(2)}`
        : undefined;

  if (base === undefined) return undefined;

  return (
    ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((ending) => base + ending)
      .find((path) => sourceFile.test(path) && oldFiles.includes(path)) ?? base
  );
};

/** Where an old file lands in the new UI. */
const newPathOf = (oldPath: string) => {
  if (oldPath.startsWith(`${oldModule}/`)) return join(target, oldPath.slice(oldModule.length + 1));

  if (oldPath.startsWith(`${oldSrc}/modules/`))
    return join(newSrc, oldPath.slice(`${oldSrc}/modules/`.length));

  return join(newSrc, oldPath.slice(oldSrc.length + 1));
};

const importPath = (fromFile: string, toFile: string) => {
  const path = relative(dirname(fromFile), toFile).split('\\').join('/');

  return path.startsWith('.') ? path : `./${path}`;
};

const uiPackage = z
  .object({ dependencies: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(join(repo, 'ui/package.json'), 'utf8')));

const packageOf = (spec: string) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec);

/** The names erxes-ui 4.x exports, read from the installed package's types. */
const erxesUiNames = new Set(
  [
    ...readFileSync(join(repo, 'ui/node_modules/erxes-ui/dist/index.d.ts'), 'utf8').matchAll(
      /export\s*(?:type\s*)?\{([^}]*)\}/g,
    ),
  ]
    .flatMap((match) => (match[1] ?? '').split(','))
    .map(
      (part) =>
        part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .at(-1) ?? '',
    )
    .filter(Boolean),
);

// GraphQL documents ----------------------------------------------------------------

type Doc = { file: string; name: string; kind: string; operation: string; fields: string[] };

/** The root fields a GraphQL document selects, with aliases resolved. */
const rootFields = (text: string) => {
  const body = text.replace(/#[^\n]*/g, '');
  const fields: string[] = [];
  let braces = 0;
  let parens = 0;

  for (let at = body.indexOf('{'); at >= 0 && at < body.length; at++) {
    const char = body[at] ?? '';

    if (char === '{') braces++;

    if (char === '}' && --braces === 0) break;

    if (char === '(') parens++;

    if (char === ')') parens--;

    if (braces !== 1 || parens !== 0 || !/[A-Za-z_]/.test(char)) continue;

    const word = /^\w+/.exec(body.slice(at))?.[0] ?? '';
    const before = body.slice(0, at).trimEnd();
    const alias = /^\s*:\s*(\w+)/.exec(body.slice(at + word.length));

    at += word.length - 1;

    if (before.endsWith('...') || before.endsWith('@') || before.endsWith('on')) continue;

    if (alias?.[1]) {
      fields.push(alias[1]);
      at += alias[0].length;
    } else fields.push(word);
  }

  return fields;
};

const docs: Doc[] = oldFiles
  .filter((file) => sourceFile.test(file) && file.includes('/graphql/'))
  .flatMap((file) => {
    const text = read(file);

    if (!text.includes('gql')) return [];

    return parse(Lang.TypeScript, text)
      .root()
      .findAll({ rule: { kind: 'variable_declarator' } })
      .flatMap((declarator) => {
        const value = declarator.field('value')?.text() ?? '';
        const header = /\b(query|mutation|subscription)\b\s*(\w*)/.exec(value);
        const name = declarator.field('name')?.text();

        if (!value.includes('gql') || !header || !name) return [];

        return [
          {
            file,
            name,
            kind: header[1] ?? '',
            operation: header[2] ?? '',
            fields: rootFields(value.slice(header.index)),
          },
        ];
      });
  });

const docByOperation = new Map(docs.map((doc) => [doc.operation, doc]));

/** The document a name imported from `spec` in `from` refers to. */
const docFor = (from: string, spec: string, name: string) => {
  const path = resolveOld(from, spec);
  const named = docs.filter((doc) => doc.name === name);

  const near = named.filter(
    (doc) => path !== undefined && (doc.file === path || doc.file.startsWith(posix.dirname(path))),
  );

  return near[0] ?? (named.length === 1 ? named[0] : undefined);
};

const operationOf = (doc: Doc) =>
  doc.fields.length === 1 ? OPERATIONS[doc.fields[0] ?? ''] : undefined;

// Small AST readers ----------------------------------------------------------------

const isAny = (node: SgNode, kinds: readonly string[]) => kinds.some((kind) => node.is(kind));
const PUNCTUATION = ['(', ')', '[', ']', '{', '}', ','];
const meaningful = (node: SgNode) => !isAny(node, PUNCTUATION);

const argsOf = (call: SgNode) => (call.field('arguments')?.children() ?? []).filter(meaningful);

const objectProps = (node: SgNode | undefined) => {
  const props = new Map<string, SgNode>();
  const spreads: SgNode[] = [];

  for (const child of node?.kind() === 'object' ? node.children() : []) {
    if (child.kind() === 'spread_element') spreads.push(child);
    else if (child.kind() === 'pair') props.set(child.field('key')?.text() ?? '', child);
    else if (child.kind() === 'shorthand_property_identifier') props.set(child.text(), child);
    else if (child.kind() === 'method_definition')
      props.set(child.field('name')?.text() ?? '', child);
  }

  return { props, spreads };
};

/** A property's value as source: the name for a shorthand, the value for a pair. */
const valueOf = (prop: SgNode) =>
  prop.kind() === 'pair' ? (prop.field('value')?.text() ?? '') : prop.text();

const FUNCTIONS = [
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
];

/** The function a node sits in, or the whole file. */
const scopeOf = (node: SgNode) =>
  node.ancestors().find((ancestor) => isAny(ancestor, FUNCTIONS)) ?? node.getRoot().root();

// One file ----------------------------------------------------------------

/** erxes-ui 3.x class names and parts with a one-to-one 4.x name (packages/ui/MIGRATION.md). */
const SWAPS: [RegExp, string][] = [
  [/data-\[state=closed\]:/g, 'data-closed:'],
  [/data-\[state=checked\]:/g, 'data-checked:'],
  [/data-\[state=unchecked\]:/g, 'data-unchecked:'],
  [/data-\[state=active\]:/g, 'data-active:'],
  [/data-\[state=on\]:/g, 'data-pressed:'],
  [/data-\[highlighted\]:/g, 'data-highlighted:'],
  [/data-\[disabled\]:/g, 'data-disabled:'],
  [/--radix-(popover|select|dropdown-menu|combobox)-trigger-width/g, '--anchor-width'],
  [/--radix-[a-z-]+-content-available-height/g, '--available-height'],
  [/\b(Dialog|Sheet)\.Overlay\b/g, '$1.Backdrop'],
  [/\b(Accordion|Collapsible)\.Content\b/g, '$1.Panel'],
];

/** erxes-ui 3.x props whose 4.x form depends on the element; reported, not rewritten. */
const HINTS: [RegExp, string][] = [
  [/\basChild\b/, '`asChild` is gone: pass `render={<Element />}`'],
  [
    /data-\[state=open\]:/,
    '`data-[state=open]:` is `data-popup-open:` on a trigger, `data-open:` on a popup',
  ],
  [/\bonSelect=/, 'a menu item takes `onClick`, not `onSelect`'],
  [
    /\b(delayDuration|skipDelayDuration|openDelay)\b/,
    'tooltip and hover delays are `delay` on the trigger',
  ],
  [
    /\bon(EscapeKeyDown|InteractOutside|PointerDownOutside|OpenAutoFocus|CloseAutoFocus)\b/,
    'use `onOpenChange(open, details)`, or `initialFocus` and `finalFocus`',
  ],
];

const RESULT_NAMES = {
  query: { loading: 'isLoading' },
  mutation: { loading: 'isPending' },
} satisfies Record<string, Record<string, string>>;

const RESULT_KEPT = new Set(['data', 'error', 'refetch', 'reset']);

const QUERY_DROPPED = new Set([
  'fetchPolicy',
  'nextFetchPolicy',
  'notifyOnNetworkStatusChange',
  'errorPolicy',
]);

const APOLLO_HOOKS = new Set(['useQuery', 'useMutation', 'useLazyQuery', 'useSubscription']);

const portFile = (oldPath: string, newPath: string) => {
  const notes: Note[] = [];

  const note = (at: SgNode | number, text: string) =>
    notes.push({ line: typeof at === 'number' ? at : at.range().start.line + 1, text });

  const text = read(oldPath);
  const root = parse(oldPath.endsWith('.tsx') ? Lang.Tsx : Lang.TypeScript, text).root();
  const edits: Edit[] = [];
  const statements: string[] = [];
  const named = new Map<string, Set<string>>();

  const want = (module: string, spec: string) =>
    named.set(module, (named.get(module) ?? new Set()).add(spec));

  const documents = new Map<string, Doc>();
  const stats = { rewritten: 0, left: 0 };

  // Imports.
  for (const statement of root.findAll({ rule: { kind: 'import_statement' } })) {
    const spec = statement.field('source')?.text().slice(1, -1) ?? '';
    const line = statement.range().start.line + 1;
    const typeOnly = /^import\s+type\b/.test(statement.text());
    const clause = statement.children().find((child) => child.kind() === 'import_clause');

    const specifiers = (clause?.find({ rule: { kind: 'named_imports' } })?.children() ?? [])
      .filter((child) => child.kind() === 'import_specifier')
      .map((child) => ({
        name: child.field('name')?.text() ?? '',
        local: child.field('alias')?.text() ?? child.field('name')?.text() ?? '',
        type: typeOnly || /^type\s/.test(child.text()),
        text: child.text().replace(/^type\s+/, ''),
      }));

    const defaults = (clause?.children() ?? [])
      .filter((child) => child.kind() !== 'named_imports')
      .map((child) => child.text());

    edits.push(statement.replace(''));

    if (spec === '@apollo/client') {
      const left = specifiers
        .map((s) => s.name)
        .filter((name) => !APOLLO_HOOKS.has(name) && name !== 'gql');

      if (left.length > 0)
        note(
          line,
          `@apollo/client \`${left.join('`, `')}\`: give the hook typed arguments and use @tanstack/react-query`,
        );
      continue;
    }

    if (spec === '~/gql' || spec.startsWith('~/gql/')) {
      const types = specifiers.map((s) => s.name).filter((name) => name !== 'gql');

      if (types.length > 0)
        note(
          line,
          `generated GraphQL types \`${types.join('`, `')}\`: infer them from the procedure with InferClientOutputs`,
        );
      continue;
    }

    const library = ['ui-modules', 'erxes-ui'].find(
      (name) => spec === name || spec.startsWith(`${name}/`),
    );

    if (library) {
      for (const s of specifiers) {
        const row: ImportRow | undefined = IMPORTS[library]?.[s.name];
        const type = s.type ? 'type ' : '';

        if (row && 'gone' in row) note(line, `\`${s.name}\` from ${spec}: ${row.gone}`);
        else if (row) {
          const name = row.name ?? s.name;

          want(row.from, `${type}${name}${s.local === name ? '' : ` as ${s.local}`}`);

          if (row.note)
            note(line, `\`${s.name}\` is now \`${name}\` from ${row.from}: ${row.note}`);
        } else if (erxesUiNames.has(s.name)) want('erxes-ui', `${type}${s.text}`);
        else
          note(
            line,
            `\`${s.name}\` from ${spec} is not in erxes-ui 4.x: replace it, or add its row to migration/ui-map.ts`,
          );
      }

      continue;
    }

    const oldTarget = resolveOld(oldPath, spec);

    if (oldTarget === undefined) {
      if (!(packageOf(spec) in uiPackage.dependencies) && !spec.startsWith('node:'))
        note(line, `${spec} is not a ui/ dependency: add it with pnpm, or replace it`);
      statements.push(statement.text());
      continue;
    }

    const kept = specifiers.filter((s) => {
      const doc = docFor(oldPath, spec, s.name);

      if (doc) documents.set(s.local, doc);

      return !doc;
    });

    if (specifiers.length > 0 && kept.length === 0 && defaults.length === 0) continue;

    const newTarget = newPathOf(oldTarget);
    const path = importPath(newPath, newTarget);

    if (!oldTarget.startsWith(`${oldModule}/`) && !existsSync(newTarget))
      note(line, `imports ${spec}, which isn't ported yet (${relative(repo, newTarget)})`);

    const names =
      kept.length > 0
        ? `{ ${kept.map((s) => `${s.type && !typeOnly ? 'type ' : ''}${s.text}`).join(', ')} }`
        : '';

    const what = [...defaults, names].filter(Boolean).join(', ');

    statements.push(
      what ? `import${typeOnly ? ' type' : ''} ${what} from '${path}';` : `import '${path}';`,
    );
  }

  // Apollo hooks.
  const clientAt = new Map<number, SgNode>();
  const hooks = new Set<string>();

  for (const call of root.findAll({ rule: { kind: 'call_expression' } })) {
    const callee = call.field('function')?.text() ?? '';

    if (!APOLLO_HOOKS.has(callee)) continue;

    const [docArg, optionsArg] = argsOf(call);
    const doc = documents.get(docArg?.text() ?? '');
    const row = doc && operationOf(doc);

    stats.left++;

    if (!doc) {
      note(call, `${callee}(${docArg?.text() ?? ''}): no GraphQL document found for it`);
      continue;
    }

    if (callee === 'useLazyQuery') {
      note(
        call,
        `useLazyQuery(${doc.name}): use useQuery with \`enabled\`, or queryClient.fetchQuery`,
      );
      continue;
    }

    if (callee === 'useSubscription') {
      note(
        call,
        `useSubscription(${doc.name}): live updates come from erxes-ui's useLiveSignal and the API's core.signal`,
      );
      continue;
    }

    if (!row) {
      note(
        call,
        doc.fields.length === 1
          ? `\`${doc.fields[0]}\` has no procedure yet: add its row to migration/ui-map.ts when it lands`
          : `${doc.operation} selects ${doc.fields.length} root fields (${doc.fields.join(', ')}): one call per procedure`,
      );
      continue;
    }

    stats.left--;
    stats.rewritten++;

    const declarator = call.parent()?.kind() === 'variable_declarator' ? call.parent() : null;
    const pattern = declarator?.field('name');
    const scope = scopeOf(call);
    const options = objectProps(optionsArg);

    const passed =
      optionsArg && optionsArg.kind() !== 'object'
        ? optionsArg.text()
        : options.spreads[0]?.text().slice(3);

    if (passed)
      note(call, `\`${passed}\` passes Apollo options through: take the input as a typed argument`);

    if (callee === 'useQuery') {
      const variables = options.props.get('variables');
      const skip = options.props.get('skip');
      const poll = options.props.get('pollInterval');

      const parts = [
        `input: ${variables ? valueOf(variables) : passed ? `${passed}?.variables` : '{}'}`,
        ...(skip ? [`enabled: !(${valueOf(skip)})`] : []),
        ...(poll ? [`refetchInterval: ${valueOf(poll)}`] : []),
      ];

      for (const [key, prop] of options.props)
        if (!['variables', 'skip', 'pollInterval'].includes(key) && !QUERY_DROPPED.has(key))
          note(
            prop,
            `useQuery option \`${key}\` has no direct equivalent: act on the query's result`,
          );

      edits.push(
        call.replace(`useQuery(orpc.${row.procedure}.queryOptions({ ${parts.join(', ')} }))`),
      );
      hooks.add('useQuery');

      if (pattern?.kind() !== 'object_pattern') {
        note(call, 'the query result is not destructured: rename `loading` to `isLoading` by hand');
        continue;
      }

      edits.push(
        pattern.replace(`{ ${resultEntries(pattern, RESULT_NAMES.query, note).join(', ')} }`),
      );

      const data = dataLocal(pattern);

      for (const access of data ? scope.findAll({ rule: { kind: 'member_expression' } }) : [])
        if (
          access.field('object')?.text() === data &&
          access.field('property')?.text() === doc.fields[0]
        )
          edits.push(access.replace(row.data ? `${data}?.${row.data}` : (data ?? '')));
      continue;
    }

    // useMutation
    const fn =
      pattern?.kind() === 'array_pattern'
        ? pattern
            .children()
            .find((child) => child.kind() === 'identifier')
            ?.text()
        : undefined;

    const invalidate = new Set<string>();
    const completed = options.props.get('onCompleted');
    const failed = options.props.get('onError');
    const refetch = options.props.get('refetchQueries');

    if (refetch) for (const key of refetchKeys(refetch, documents, note)) invalidate.add(key);

    for (const [key, prop] of options.props)
      if (!['onCompleted', 'onError', 'refetchQueries'].includes(key))
        note(
          prop,
          `mutation option \`${key}\` has no direct equivalent: write it with the query cache`,
        );

    for (const site of fn ? scope.findAll({ rule: { kind: 'call_expression' } }) : []) {
      if (site.field('function')?.text() !== fn) continue;

      const [arg] = argsOf(site);

      if (arg?.kind() !== 'object') {
        note(
          site,
          `${fn}(${arg?.text() ?? ''}): pass the input and callbacks as mutate(input, { onSuccess })`,
        );
        continue;
      }

      const given = objectProps(arg);
      const spread = given.spreads[0]?.text().slice(3);
      const variables = given.props.get('variables');
      const callbacks: string[] = [];

      if (spread)
        note(
          site,
          `\`...${spread}\` passes Apollo options through: take the input as a typed argument`,
        );

      for (const [key, prop] of given.props) {
        if (key === 'variables') continue;

        if (key === 'onCompleted') callbacks.push(`onSuccess: ${valueOf(prop)}`);
        else if (key === 'onError') callbacks.push(`onError: ${valueOf(prop)}`);
        else if (key === 'refetchQueries')
          for (const queryKey of refetchKeys(prop, documents, note)) invalidate.add(queryKey);
        else
          note(
            prop,
            `mutation option \`${key}\` has no direct equivalent: write it with the query cache`,
          );
      }

      const input = variables ? valueOf(variables) : spread ? `${spread}.variables` : '{}';

      edits.push(
        site.replace(
          `${fn}(${input}${callbacks.length > 0 ? `, { ${callbacks.join(', ')} }` : ''})`,
        ),
      );
    }

    const hookOptions = [
      ...(completed ? [`onSuccess: ${valueOf(completed)}`] : []),
      ...(failed ? [`onError: ${valueOf(failed)}`] : []),
    ];

    if (completed)
      note(
        completed,
        `onCompleted is now onSuccess: it gets the procedure's output, not \`data.${doc.fields[0]}\``,
      );

    if (invalidate.size > 0) {
      const keys = [...invalidate].map(
        (key) => `queryClient.invalidateQueries({ queryKey: orpc.${key}.key() })`,
      );

      const statement = declarator?.parent() ?? call;

      hookOptions.push(
        `${completed ? 'onSettled' : 'onSuccess'}: () => ${keys.length === 1 ? keys[0] : `Promise.all([${keys.join(', ')}])`}`,
      );
      clientAt.set(scope.range().start.index, clientAt.get(scope.range().start.index) ?? statement);
      hooks.add('useQueryClient');
    }

    const awaited =
      fn !== undefined &&
      new RegExp(`await\\s+${fn}\\(|${fn}\\([^)]*\\)\\s*\\.then`).test(scope.text());

    edits.push(
      call.replace(
        `useMutation(orpc.${row.procedure}.mutationOptions(${hookOptions.length > 0 ? `{ ${hookOptions.join(', ')} }` : ''}))`,
      ),
    );
    hooks.add('useMutation');

    if (pattern?.kind() === 'array_pattern') {
      const result = pattern.children().find((child) => child.kind() === 'object_pattern');

      const entries = [
        `${awaited ? 'mutateAsync' : 'mutate'}: ${fn ?? 'mutate'}`,
        ...(result ? resultEntries(result, RESULT_NAMES.mutation, note) : []),
      ];

      edits.push(pattern.replace(`{ ${entries.join(', ')} }`));
    } else
      note(
        call,
        'the mutation result is not destructured as [mutate, result]: use mutate and isPending by hand',
      );
  }

  for (const statement of clientAt.values())
    edits.push({
      startPos: statement.range().start.index,
      endPos: statement.range().start.index,
      insertedText: `const queryClient = useQueryClient();\n${' '.repeat(statement.range().start.column)}`,
    });

  if (hooks.size > 0) {
    for (const hook of hooks) want('@tanstack/react-query', hook);
    want(importPath(newPath, join(newSrc, 'orpc.ts')), 'orpc');
  }

  // erxes-ui 3.x props.
  for (const [index, line] of text.split('\n').entries())
    for (const [pattern, hint] of HINTS) if (pattern.test(line)) note(index + 1, hint);

  const body = SWAPS.reduce(
    (current, [pattern, swap]) => current.replace(pattern, swap),
    root.commitEdits(edits).replace(/^\s+/, ''),
  );

  const header = [
    ...statements,
    ...[...named].map(([module, specs]) => `import { ${[...specs].join(', ')} } from '${module}';`),
  ];

  return { body: `${header.join('\n')}\n\n${body}`, notes, stats };
};

/** The orpc namespaces a `refetchQueries` value names, for `orpc.<namespace>.key()`. */
function refetchKeys(
  prop: SgNode,
  documents: Map<string, Doc>,
  note: (at: SgNode, text: string) => void,
) {
  const value = prop.kind() === 'pair' ? prop.field('value') : prop;
  const keys: string[] = [];

  if (value?.kind() !== 'array') {
    note(prop, `refetchQueries \`${value?.text() ?? ''}\`: invalidate the query keys by hand`);

    return keys;
  }

  for (const item of value.children().filter(meaningful)) {
    const query = objectProps(item).props.get('query');

    const doc =
      item.kind() === 'string'
        ? docByOperation.get(item.text().slice(1, -1))
        : documents.get(query ? valueOf(query) : item.text());

    const row = doc && operationOf(doc);

    if (row) keys.push(row.procedure.split('.')[0] ?? row.procedure);
    else
      note(
        item,
        `refetch \`${item.text()}\` has no procedure yet: invalidate its key once it lands`,
      );
  }

  return keys;
}

/** A destructured result's entries under TanStack Query's names. */
function resultEntries(
  pattern: SgNode,
  renames: Record<string, string>,
  note: (at: SgNode, text: string) => void,
) {
  return pattern
    .children()
    .filter(meaningful)
    .map((child) => {
      const pair = child.kind() === 'pair_pattern';
      const key = pair ? (child.field('key')?.text() ?? '') : child.text();
      const local = pair ? (child.field('value')?.text() ?? key) : key;
      const renamed = renames[key];

      if (!renamed && !RESULT_KEPT.has(key))
        note(child, `\`${key}\` from the Apollo result has no TanStack Query equivalent here`);

      return renamed ? `${renamed}: ${local}` : child.text();
    });
}

/** The local name a destructured query result gives `data`. */
function dataLocal(pattern: SgNode) {
  for (const child of pattern.children()) {
    if (child.kind() === 'shorthand_property_identifier_pattern' && child.text() === 'data')
      return 'data';

    if (child.kind() === 'pair_pattern' && child.field('key')?.text() === 'data')
      return child.field('value')?.text();
  }

  return undefined;
}

// Run ----------------------------------------------------------------

const sections = moduleFiles.map((oldPath) => {
  const newPath = newPathOf(oldPath);
  const { body, notes, stats } = portFile(oldPath, newPath);

  mkdirSync(dirname(newPath), { recursive: true });
  writeFileSync(newPath, body);

  return { title: relative(repo, newPath), from: oldPath, notes, stats };
});

const count = (pick: (section: (typeof sections)[number]) => number) =>
  sections.reduce((sum, section) => sum + pick(section), 0);

const lint = tidy(target);

writeReport(
  'port-ui',
  moduleName,
  [
    `${sections.length} files from ${inventory.source.plugin} into ${relative(repo, target)}.`,
    `${count((s) => s.stats.rewritten)} Apollo calls became oRPC options and ${count((s) => s.stats.left)} were left.`,
    `After lint's autofix: ${lint}.`,
    'Work through the notes, then `vp run check` until it passes, with the old page open next to the new one.',
  ],
  sections,
);
