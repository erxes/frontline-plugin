---
name: verify
description: Prove a change works before filing it: the gates, then its e2e spec. Use before calling a change done.
---

Use synthetic data only. Green gates are the proof. A walk by hand is only
for what no spec can drive.

1. While you work: `vp run check` after each edit, `vp run test` when the API
   changed, and the spec you touched, in light only. Run `pnpm e2e:stack up`
   once, then `pnpm e2e --project=light <spec>`, and leave the stack up
   between runs.
2. Once, before filing: `pnpm check:rls`, `pnpm image` then `pnpm budgets`, and
   the whole `pnpm e2e`. CI runs it again in three shards, so don't rerun it
   locally after it passes. Run `pnpm e2e:stack down` when you're done.
3. A screen a member can reach has a spec that walks every old action, field
   and filter, plus the refusal for a member without the permission. That spec
   is the parity check. Don't run old erxes beside it. The flow specs don't run
   axe; `e2e/a11y*.spec.ts` open each screen, panel and sheet once with data on
   it and run axe in light and dark, so a new screen gets a stop there. After
   a link or button that changes page, wait with `expectPage(page, heading)`
   for the new page's own heading, never for text the old page shows too.
4. When a failure traces to erxes-ui or core, such as an axe contrast hit on
   core's button or a label core draws, file it on erxes/erxes, add a
   `DECISIONS.md` row with the link, and assert only what the plugin draws.
   Don't restyle core's parts in the plugin.
5. Walk by hand only what no spec can drive, such as a provider webhook or the
   messenger widget on another site. Start core from an erxes checkout on
   branch `postgre` with its `verify-feature` skill, give core
   `CORE_PLUGIN_KEYS=frontline:<32+ character secret>` and web
   `PUBLIC_PLUGINS=frontline_ui@http://localhost:3099/remoteEntry.js`, run
   `core$ pnpm db:plugin-role frontline`, put its URL in `.env` as `DATA_URL`
   with the same secret as `PLUGIN_SECRET`, then `pnpm dev:api` and
   `pnpm dev:ui`.
6. If the same failure happens twice, stop and report it with the output.
7. A UI PR shows one after-screenshot per new or changed screen, grabbed once
   from the running stack. A port has no before shot. Don't retake shots or fix
   pixels; cosmetic notes go in the PR body as a list.

Done when step 2 passes. The handoff names the gates that ran and any issue
filed.
