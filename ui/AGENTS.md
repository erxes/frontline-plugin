# ui

The Module Federation remote `frontline_ui`. web loads `./config` (`CONFIG`)
and renders `./frontline` (the `Frontline` export) under `/frontline/*`.

- `rsbuild.config.ts` declares web's shared singletons with `import: false`,
  reading the list from `erxes-ui/federation`, so it follows the installed
  erxes-ui. A missing name bundles a second copy and breaks at runtime.
- A feature is a folder in `src/modules` (`src/modules/channels`); what features
  share sits in `src`, such as `src/orpc.ts`. A folder's own
  files import as `./`; anything else as `@/<feature>/…` (`src/modules`) or
  `~/…` (`src`), set in `tsconfig.json` and `rsbuild.config.ts`. Lint refuses `../`.
- Build pages from `erxes-ui` components and its root export. The host provides
  React, the router, the query client and erxes-ui, and web's stylesheet styles
  erxes-ui's components.
- Any Tailwind class works, on erxes-ui's tokens (`bg-muted`, `text-sm`,
  `md:grid-cols-2`). `src/styles.css` builds the plugin's own utilities, and
  `src/Frontline.tsx` passes them to `addPluginStyles`, which adds only the
  classes web's stylesheet lacks. erxes-ui's design rules hold here too (its
  `AGENTS.md`, enforced by `vp run check`): no inline styles or raw colours.
- The plugin's API goes through `src/orpc.ts`:
  `useQuery(orpc.channels.list.queryOptions(...))`,
  `useMutation(orpc.channels.create.mutationOptions(...))`. Types come from
  `api/src/router.ts`; after a mutation, invalidate `orpc.<group>.key()`.
- Core's API goes through `orpc` from `@erxes/core-contract/client`, the client
  web uses, with the member's own session; import it as `core` beside the
  plugin's `orpc`: `useQuery(core.users.get.queryOptions({ input: { id } }))`.
  It shares web's query cache, and the member needs the core permission the
  procedure asks for (`team.view` for team members).
- Members: `SelectMember.Field`, `SelectMember.InlineCell`, `MemberInline` and
  `useMembersById` from erxes-ui, given `members={memberQueries}` from
  `@erxes/core-contract/client`. `src/modules/channels/ChannelsPage.tsx` has a member filter
  and a "Created by" column. erxes-ui's `EntityPicker` is the searchable list
  under them, for a picker of the plugin's own records.
- Pages look and behave like core's: follow the `ui-patterns` skill.
- Lists have core's bar (`src/modules/channels/ChannelsPage.tsx`): erxes-ui's `ViewBar` with
  `ListFilter`, given the list's fields and, for `member` fields, `members={memberQueries}`
  (a `tags` query for `tags` fields). It draws the bar itself, in erxes or on its own. Its conditions and search live in the
  address; `useListFilterParams()` hands them to the list's query, and the API
  applies them (`api/src/modules/filter.ts`). No search boxes, toggle
  tabs or pickers in a row above the table.
- Records open in core's side panel, like a customer: core draws the panel and
  `CONFIG.recordTypes` (`src/config.tsx`) fills its slots, the record's `Title`,
  `Actions` and `Detail` (`src/modules/channels/ChannelPanel.tsx`) and `New`
  (`src/modules/channels/ChannelNew.tsx`). `useOpenRecord()` opens them, and the
  record's `detailPath` renders erxes-ui's `RecordPage` for the expanded record
  (`RecordRoute` in `src/Frontline.tsx`). Type names live in `src/plugin.ts`, apart
  from the API client, so `./config` stays small. A plugin's records of other records' customers are `relationTabs`
  (the `ui-patterns` skill). Forms are core's
  `PanelFormRow` rows with Cancel and Save at the bottom; nothing saves until
  Save. Dialogs are for confirmations, not forms.
- Text uses `t(key, 'English default')` from `react-i18next`.
- Development: `pnpm dev:ui` serves `http://localhost:3099/remoteEntry.js`;
  web loads it from the manifest's `UI_ENTRY_URL` or from its own
  `PUBLIC_PLUGINS=frontline_ui@http://localhost:3099/remoteEntry.js`.
