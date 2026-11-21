# Porting rules

Every agent that ports frontline reads this first. The rewrite only pays off
if the new plugin is better built than the old one. Once officenext's data is
imported and the first enterprise customer goes live, changing a table means
migrating real customer data. So each table, procedure and boundary gets its
long-term shape the first time it is written. A port that carries the old
bugs and debt onto the new stack wasted the rewrite.

## Done means

- Same features, core's screens. Every old feature, action, field and filter
  works, unless `DECISIONS.md` records why not, on screens built the way the
  `ui-patterns` skill says. Never copy the old layout. A record with a status
  gets a list grouped by status. [`pnpm e2e`, the PR's screenshots, review]
- Every old bug the code shows is fixed, with its row in `DECISIONS.md` in the
  same commit. [review]
- The gates pass: `vp run check`, `vp run test`, `pnpm check:rls`,
  `pnpm budgets`, `pnpm e2e`. Green gates ship without line-by-line review.

## Port the behavior, rebuild the shape

Old frontline on erxes main has 508 `any`, 925 `throw new Error('…')`, 265
`console.*` calls, 244 broker calls and `subdomain` passed through 1,928
places. It has 56 files over 500 lines and 48 branches on integration kind.
Each of its seven integrations keeps its own customers, conversations and
messages beside the inbox's. None of that carries over.

| Old                                                                            | Port                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subdomain` and `models` passed to every function, org filters written by hand | The org comes from the token. Forced RLS scopes every query, so no query filters by org.                                                                                 |
| One shape typed three times: Mongoose schema, GraphQL type, TS interface       | Drizzle table, then zod, then the oRPC router, then TanStack Query. Outputs come from the table through drizzle-zod and add only computed fields. No row-to-DTO mappers. |
| `throw new Error('message')`, and the UI matches on the text                   | A typed oRPC error for each failure the UI acts on.                                                                                                                      |
| `console.log`                                                                  | `api/src/logger.ts`, with the facts as fields.                                                                                                                           |
| Untyped broker calls to core                                                   | `core.forOrg(orgId)` from `api/src/core.ts`, called outside the transaction, with a `dedupeKey` on writes.                                                               |
| Several writes per action, then a separate call for the activity row           | One transaction per action, which also writes its activity and event rows.                                                                                               |
| Counters and uniqueness checked in code, indexes unique across all orgs        | A row lock, or a unique index that includes `org_id`.                                                                                                                    |
| Status strings compared all over the code                                      | A `text({ enum })` column and one function that owns the allowed moves.                                                                                                  |
| `if (kind === 'facebook')` in inbox code                                       | One adapter interface. Inbox code never names a provider.                                                                                                                |
| Per-provider customers, conversations and messages                             | One conversations table and one messages table. A provider stores only its external ids and config. Customers live in core, and the plugin stores `customerId`.          |
| Page tokens, bot tokens and mail passwords in plain text                       | Encrypted at rest with a key from the environment.                                                                                                                       |
| `setTimeout` to wait for state                                                 | Await the thing itself, or queue a job.                                                                                                                                  |
| Lists that load the first 100 rows and count in a second query                 | Cursor paging, with the count in the same response.                                                                                                                      |
| Panel state in Jotai atoms                                                     | The URL, through nuqs.                                                                                                                                                   |
| A hand-rolled helper                                                           | A maintained library, added with `pnpm add`.                                                                                                                             |

Keep provider logic that works, such as Graph API calls, bot clients, IMAP
and call recording. Storage, wiring, auth and errors get rebuilt.

## Thin core

Core owns members, roles and sign-in. It owns customers, companies and
products, with their tags and custom fields. It also owns files,
notifications, email sending, the timeline, audit, events, automations, live
updates and payments.
Frontline owns everything else it does, including tags and custom fields for
its own records. Branches and departments are core's units; `frontline_teams`
is a read-only copy for SQL. The API reaches core only through
`@erxes/plugin-sdk`, and the UI only through `@erxes/core-contract/client`.
Never read a `core_*` table. The client portal became core's client accounts,
segments became saved views, and brands are gone.

## When core lacks something

Don't build around it. Check core's guide and contract first. If the feature
is missing, file an issue that says what the old plugin did and what core
would need, add a `DECISIONS.md` row, and port the rest of the module. Build
a plugin-owned version only when core's guide, or the list below, says the
plugin owns that job.
A workaround that would need a data migration once core ships the feature is
never fine.

One ask is open with core: org import. Old users and customers keep their
Mongo ids in core, because the plugin import maps to them (the "Mongo `_id`
strings" row in `DECISIONS.md`).

Mail sync, token refresh, SLA breach checks and send retries are plugin jobs
(`@erxes/plugin-sdk` 0.1.0-v2.6): the manifest's `jobs` declares each with its
retry and `cron`, `enqueueJob` queues one in the change's transaction, and
`verifyCoreJob` checks each attempt core POSTs to `/api/jobs/<name>`.

Frontline builds these in its own tables, with no core change:

- Public routes. Webhooks, the messenger, form embeds and the help center
  arrive signed out, carrying a key frontline issued. One table maps the key
  to its org, listed in `tools/no-org-id.sql` with that reason, and the route
  runs its transaction in that org.
- Customers by provider id. Facebook, Instagram, Telegram, Discord and
  messenger visitors have only a provider user id.
  `frontline_customer_links (org_id, source, external_id, customer_id)`, unique
  on the first three, finds the customer. A new one is
  `customers.create({ firstName })` in core, then its link row.
- Secrets. Page tokens, bot tokens and mail passwords are encrypted at rest
  with a key from the environment.
- Visitor live updates. Core's stream serves members, so frontline pushes new
  messages to messenger visitors itself. Members get `core.signal`.
- Teams. Core's units, copied to `frontline_teams` by `modules/teams/sync.ts`.

A messenger can be answered by an agent an admin made in core: its Bot tab saves the agent's id
in `frontline_integrations.agent_id`. While a conversation's `operator` is `bot`, each visitor
message goes to core's `agents.submit`, keyed by the conversation id, with the customer only when
the website signed the visitor in. Core's `core.agent.finished` posts the answer as a bot message,
and `core.agent.failed` hands the conversation to a person (`api/src/modules/messenger/agent.ts`).
A member's reply or an assignment stops the bot.

A messenger's FAQ answers before the agent does. Its settings keep up to 10 questions with saved
answers in `config.faq`, and the widget's home screen shows the questions. A tap
(`POST /api/public/messenger/faq/:id`) posts the question as the visitor's message, in their latest
unresolved conversation or a new one, and the saved answer as a bot message straight after. A
typed message that equals a question, once trimmed, lowercased and stripped of trailing
punctuation, gets the same answer. Neither goes to the agent or changes the conversation's
`operator` (`api/src/modules/messenger/faq.ts`).

## Verification without theatre

- Run `vp run check` after each edit. Never run `tsc` or `npx tsc`.
- Tests call the public interface and assert behavior. Write one for each bug
  you fix and each rule you add, never one per line, and none that can't fail.
- Integrations get API tests that feed recorded webhook payloads into the
  routes. They get no e2e, because that would need real Meta, Telegram and
  Discord accounts.
- A screen's parity check is its e2e spec plus a look at the old screen
  beside the new one, as the `verify` skill says. The spec proves each action
  works; only the look catches a header that scrolls away or a dialog that
  never opens. Each module PR carries old and new screenshots, scrolled,
  empty and with data, at 1280×800. A bug you see gets fixed or filed as an
  issue, never left as a note in the PR body.
- A failure in erxes-ui or core gets an issue and a decision row, not a fix
  in the plugin.
- If the same failure happens twice, stop and report it with the output.
  Don't try a third time, and don't hand the retry to a subagent.
- No review subagents for nits. Lint and the gates catch what a tool can.
  Before a module's PR merges, one agent that didn't write it opens its
  screenshots next to the old screens and checks MIGRATION.md's ticks against
  the code.
- A lint rule that is wrong changes in core's `@erxes/lint`, in its own PR.

## Shipping fast

- Work on one module in your own worktree, and commit early.
- `api/src/modules/channels` and `ui/src/modules/channels` are the reference. Copy
  their shape, and search for an existing helper before writing one.
- Each difference from the old plugin gets its `DECISIONS.md` row in the
  module's commit.
- When you see the same smell twice, propose a check for it. That's a rule
  for core's `@erxes/lint` or a test here, never another paragraph in this file.
- Docs, PR bodies and UI copy are short: plain words, active voice, numbers.
