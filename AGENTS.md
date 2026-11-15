# Frontline

Inbox, channels, tickets and customer messaging for erxes

An erxes plugin for the new core (Postgres). `api/` is the API: Express 5,
oRPC and Drizzle. `ui/` is the Module Federation remote web loads. Read the
`AGENTS.md` in the folder you edit. `api/src/modules/channels` and
`ui/src/modules/channels` are the reference feature: copy their shape for a new one.

<!-- quality:start -->

## Quality

Every erxes repo on the new stack has this section, unchanged. The brackets name the checks that
enforce a rule; `review` marks the part no tool can check. The rewrite keeps every feature and improves the
architecture. Agents write the code and the checks judge it, so a green check lets a change ship
without line-by-line review.

- `vp run check` is the type check: oxfmt, type-aware oxlint on tsrs and knip in about 10 s. Run it after each edit and before each commit; it replaces `tsc`. `vp run fix` formats and autofixes. [vp run check]
- Port what a feature does, not its code. Fix what the old code got wrong instead of carrying it over. [review]
- Use a maintained library when one does the job. Keep dependencies near their latest release and off deprecated APIs. [typescript/no-deprecated, review]
- One way to do each job. Search for the existing helper before writing one, merge the repeats you find, delete what nothing uses. [knip, review]
- Types flow from the database schema to the contract to the UI. Infer them, so each shape is written once. [pnpm check:generated, review]
- API input, output and events are flat rows, as the table stores them: `referenceType` and `referenceId`, never a nested `{ type, id }` object or a `to…Dto` mapper. A value the row lacks comes from the query. [erxes/no-dto-mapper, review]
- Parse outside input with zod and narrow it, so the code needs no `any`, cast or `!`. [typescript/no-explicit-any, typescript/no-unsafe-type-assertion, typescript/no-non-null-assertion]
- Lint and type rules are the spec: when one fires, fix the code. Silencing it is never the fix, whether by a disable comment, `@ts-ignore`, an override, an ignore, a weaker option or a raised limit. A rule that is wrong changes in its own PR. [typescript/ban-ts-comment, review]
- Split a file or function that outgrows its limit by responsibility (router, service, queries). [max-lines, max-lines-per-function, review]
- Finish the work in the change, with no TODO or FIXME left in code. [no-warning-comments]
- Tests call the public interface (HTTP, the typed client, the rendered page) and assert what it does, never source strings or code shapes. [review]
- Every test runs: a skipped test or an empty suite fails the run. A failing test gets its code or its wrong expectation fixed, never loosened or deleted. [vp run test, review]
- Log through the structured logger, with the facts as fields. A caught error is rethrown or logged with its context. [no-console, review]
- Make the long-term change in one go, with no backward-compatibility shim, stopgap or speculative option. [review]
- Docs, PRs and copy are short: plain words, active voice, what it does or the number. [review]

<!-- quality:end -->

## This repo

- `vp run check` runs the escape guard, format, lint, types, React Doctor on `ui/`
  (`doctor.config.jsonc`), knip, the docs guard and `pnpm check:generated`, which
  compares the migrations with the schema. `pnpm exec react-doctor why <file:line>`,
  run in `ui/`, explains a React Doctor hit.
- Other gates: `vp run test` on real Postgres via `DATA_TEST_URL`,
  `pnpm check:rls`, `pnpm image` then `pnpm budgets`, and `pnpm e2e`. `vp run fix`
  formats and fixes lint. CI's one required status is `Check`.
- `pnpm e2e:stack up` runs core's released images and the plugin image on a
  fresh database, web on :8080. `pnpm e2e` drives it in Chromium, light and dark,
  with axe. A screen a member can reach gets a spec in `e2e/` and its refusal.
- `api/src/__tests__/access.test.ts` walks the router: every procedure refuses a
  member without its permission. Build procedures on `reads`/`writes`, never bare `os`.
- `budgets.json` caps, gzipped, what web loads on every page (`./config`,
  `remoteEntry.js`), the page module, and the bytes of these instructions. A
  number over its ceiling fails; a PR that raises a ceiling needs the
  `budget-increase` label. `./config` imports nothing but its icon.
- Core finds the plugin by these names, so they stay fixed: plugin `frontline`,
  remote `frontline_ui` exposing `./config` and `./frontline`, pages under `/frontline/*`.
- Every table, index and constraint starts with `frontline_`, and every table has
  `org_id` with forced row-level security, or is listed in `tools/no-org-id.sql`
  with the reason. Core and other plugins share the database. [pnpm check:rls]
- The lint rules are `@erxes/lint`'s preset (`vite.config.ts`). It,
  `tools/test/no-skips.ts` and `tools/check-rls.sql` come from core unchanged, as
  does the quality section above. Change them in core.
- The API reaches core through `@erxes/plugin-sdk` (`api/src/core.ts`), the UI
  through `@erxes/core-contract/client` with the member's session. Neither reads
  `core_*` tables or imports core's app code.
- Members are signed in by core: the UI sends a session token, the API checks it
  with `verifyPluginSession`. There is no public route yet, because core can't
  tell a public request's organisation.
- Skills in `.agents/skills/`: `endpoint` for a procedure, `schema-change` for a
  table or column, `ui-patterns` for any page (lists, filters, forms, record
  details look like core's), `verify` before calling a change done.
- This repo ports the old erxes `frontline` plugin. Read `PORTING.md`
  first, then work through the `plugin-migrate` skill.
- What core promises plugins, and what counts as a breaking change, is core's
  `plugin-contract` skill (erxes repo, branch `postgre`).
