# Decisions

Where this port differs from the old erxes frontline plugin, and why. Each row
says what the old plugin did, what this one does, and the reason. A port adds
its rows in the same commit as the code. `MIGRATION.md` tracks what is ported,
and this file explains each place the port doesn't copy the old plugin.

## Whole plugin

| Old                                                                        | New                                                                                   | Why                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mongo collections                                                          | Postgres tables named `frontline_*`, each with `org_id` and forced row-level security | Core and every plugin share one database on the new core                          |
| Mongo `_id` strings                                                        | Text ids that keep the old `_id`                                                      | An import can run twice and skip what it copied, and old links keep working       |
| GraphQL resolvers, some with no permission check                           | oRPC procedures on `reads` or `writes` with a permission and zod input                | The access test walks every procedure and refuses a member without its permission |
| A separate `...TotalCount` query beside each list                          | The count comes back with the list                                                    | One request per screen instead of two                                             |
| Panel and filter state in Jotai atoms and `useSidePanel`                   | The URL, through nuqs                                                                 | A link or a reload opens the same panel and filters                               |
| Unsaved edits kept by `usePanelFormDraft` on some panels                   | Every panel keeps its draft after Esc until it is saved or discarded                  | One draft helper for all panels                                                   |
| Bulk delete sent one request per row, so one refusal left the rest deleted | One transaction deletes every id or none                                              | A half-done delete was the worst outcome                                          |
| Client portal procedures (`cp*`), brands and segments                      | Dropped                                                                               | The new core has none of them                                                     |
| The import ran tables in a fixed order, and one refused row aborted it     | `scripts/import-mongo.ts` imports parents first, and skips and lists refused rows     | Children failed their foreign keys                                                |

## Channels

| Old                                                                    | New                                                                             | Why                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `memberIds` on the channel beside `channel_members`, and stored counts | Only `frontline_channel_members`, counts computed                               | The two copies drifted and the counts went stale |
| Roles admin, lead and member                                           | Admin and member, `lead` folds into admin                                       | Lead could only add members, which admins do     |
| A channel could lose its last admin                                    | `removeMembers` and `setRole` refuse it                                         | Nobody could manage that channel again           |
| `getChannels` and `getMyChannels`                                      | One `channels.list`: members see their own, `frontline.channel.manage` sees all | They differed only by filter                     |
| Confirms and counts said "1 channels"                                  | Singular and plural copy                                                        | Plain grammar                                    |

## Response templates

| Old                                                      | New                                                         | Why                                               |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| A `showResponseTemplates` permission                     | The template's channel decides: members read, admins change | A template belongs to a channel                   |
| A `files` field                                          | Dropped                                                     | No screen set it                                  |
| `/frontline/:id/response/:responseId` was its own route  | It opens the template in the list's side panel              | The old page did the same                         |
| `removeChannel` deleted only the channel and its members | Deleting a channel deletes its templates                    | The templates stayed with no screen to reach them |

## Knowledge base

| Old                                                                                           | New                                                                                      | Why                                                                |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mutations skipped the permission check                                                        | Every procedure checks its own permission                                                | Any member could change the knowledge base                         |
| A Redis job published scheduled articles                                                      | Every article read first publishes the ones that are due                                 | A lost job left an article unpublished                             |
| Removing a topic searched the wrong field, and removing a category matched `categoryId`       | Foreign keys cascade: a topic takes its categories and articles, a category its articles | Both left orphans                                                  |
| Children of a deleted category                                                                | Move to the top level                                                                    | A dangling parent id hid them                                      |
| Lists loaded the first 100 rows with no paging                                                | Articles page by cursor, 50 at a time                                                    | Rows past 100 never showed                                         |
| `topicsTotalCount` ignored the filters                                                        | The count folds into the list                                                            | The total disagreed with the rows                                  |
| Category counts and authors ran one query per row                                             | One query for the page                                                                   | N+1 queries                                                        |
| `numOfArticles` counted only draft and published, and a parent didn't count its subtree       | Counts cover every status and the subtree                                                | The numbers were wrong                                             |
| `publishedAt` was set only on draft to publish                                                | Set on every move to published                                                           | Other paths left it empty                                          |
| Edits fetched the detail and resent every field                                               | Updates are partial                                                                      | Two editors overwrote each other's fields                          |
| Bulk edits sent one request per article                                                       | `articles.bulkUpdate` is one statement                                                   | Partial bulk edits                                                 |
| The parent rule refused only a direct loop                                                    | A full cycle check under a topic lock                                                    | A category could become its own ancestor                           |
| `code` unique across every organisation                                                       | Unique per organisation                                                                  | One organisation's code blocked another's                          |
| `topicId` on articles, `categoryIds` and `articleIds` on topics                               | Dropped, the category gives the topic                                                    | Copies that drifted                                                |
| `code` on articles, `forms`, `reactionCounts`, `publishedUserId`, `modifiedBy`, `createdDate` | Dropped                                                                                  | No screen read them                                                |
| `knowledgeBaseCategoriesGetLast`                                                              | Dropped                                                                                  | No screen called it, and it ignored the topic                      |
| Title and summary edited in their table cells                                                 | Edited in the side panel, while status and category stay editable in the row             | Long text fits the panel's editor                                  |
| The sidebar width in raw `localStorage`                                                       | erxes-ui `stored()` under the same key, clamped to 200 to 480 px                         | The lint rule bans raw storage, and the schema rejects a bad value |
| The embed script, view counts and the public article page                                     | Waiting for public routes                                                                | Core can't yet tell a public request's organisation                |
| Brand on a topic                                                                              | Dropped                                                                                  | The new core has no brands                                         |

## Pipelines and statuses

| Old                                                                                                             | New                                                                           | Why                                                         |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Reads checked no access, and `ticketStatusesManage` ignored the channel                                         | A pipeline and its statuses follow their channel: members read, admins change | Any holder of the grant could edit every channel's statuses |
| A pipeline and its default statuses were written separately                                                     | One transaction                                                               | A failure left a pipeline with no statuses                  |
| `removePipeline` left its statuses, and `removeChannel` left its pipelines                                      | Both cascade                                                                  | Orphans                                                     |
| Two status adds at once could share an order                                                                    | The add takes the next place under the channel lock                           | Duplicate orders                                            |
| Reorder sent one update per status                                                                              | `statuses.reorder` is one statement that refuses a stale list                 | A failure left a mixed order                                |
| One status query per stage                                                                                      | One `pipelines.statuses.list`                                                 | Six requests became one                                     |
| Deleting a status asked nothing                                                                                 | It confirms first                                                             | A misclick deleted it                                       |
| `numberSize` was free text                                                                                      | An integer from 1 to 8                                                        | Ticket numbers need a width                                 |
| An SLA could hold two rules for one priority                                                                    | Refused                                                                       | Which rule applied was undefined                            |
| Pipeline tabs were side panel record paths                                                                      | General, Ticket statuses and SLA are pages with their own links               | A link opens the tab, and each loads on first visit         |
| `order`, `state`, `isHideName`, `tagId` on pipelines; `state`, `probability` on statuses                        | Dropped                                                                       | No screen set them                                          |
| An attribution toast on the name field                                                                          | Dropped                                                                       | The field trims what it saves                               |
| The API fetched the pipeline creator with `users.findOne`                                                       | The UI names them with `MemberInline`                                         | The API needs no `users:read` scope for it                  |
| Deleting a pipeline checked for open tickets, a job rechecked SLA due times, a status could start an automation | Waiting for tickets                                                           | Each one needs tickets to exist                             |
