# api

Node 26 runs the TypeScript directly; imports carry `.ts` and `#/` is `src/`.

- `src/main.ts` runs migrations, `core.registerManifest(manifest)`, then the server.
  Core installs the plugin itself in development.
- `src/core.ts` holds the core client, `src/manifest.ts` the manifest. Every permission, event
  and kind in the manifest starts with `frontline.`. A new scope waits for the
  owner's approval, so ask for one only when a procedure needs it.
- `src/server.ts` verifies the session token on `/api/rpc/*` and `/api/v1/*` and hands
  procedures `context.member`, a `PluginMember`.
- `src/orpc.ts`: build every procedure on `reads(action)` or `writes(action)`.
  Both check the permission and run the handler in `withOrg(member.orgId)`, so
  row-level security shows `context.tx` one organisation's rows. Queries carry
  no org filter; only an insert sets `orgId`, from `context.member`.
- Call core (`core.forOrg(orgId)...`) outside `context.tx`; a failed core call
  must not roll back the plugin's own change.
- What happens to a record is an event: publish it with `core_publish_event()`
  in `context.tx`, so it commits with the change, with a `summary`,
  a flat payload, `entityType` (a type in the manifest's `timelines`) and
  `entityId`. It appears on the record's Activity tab, and on the customer's or
  company's too when it names `subjectType` and `subjectId`. A retried event
  adds nothing. `activities.create` is for entries that are not events.
- Live signals carry no data and go once per transaction. An inbox change sends
  `conversations` and `conversation.<id>`, lowercased, per conversation it touched.
- Tests `call(procedure, input, { context: { member } })`. `src/test/setup.ts` gives
  each file its own database, owned by a role without BYPASSRLS.
