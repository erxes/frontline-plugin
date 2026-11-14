# Migrating frontline to the new core

From erxes/erxes `origin/main` (f2a56ac961), `frontline_api` and `frontline_ui`.
893 items: 2 gaps and 49 drops. Follow `.agents/skills/plugin-migrate`: one module at a time,
tick an item once it works on the new core and its old bugs and workarounds are gone, tick a gap once filed, ending its line with `(filed <issue url>)`,
and tick a drop once its code is left out (segments, the client portal and brands are not migrated).

The old UI imports 145 symbols from `ui-modules` in 328 files; the host has no `ui-modules`, so each page rebuilds them from `erxes-ui` (members through its `SelectMember` and `MemberInline`, other records through `EntityPicker`). erxes-ui's own old-to-new component table is `packages/ui/MIGRATION.md` in erxes (branch `postgre`).
GraphQL types (337) are listed in `migration/inventory.json` for reference; procedures replace them.

## Plugin-wide

### Tables

- [ ] `frontline_teams` and `frontline_team_members` from old core's `departments`, `branches` and the members' `departmentIds` and `branchIds` (drafts in migration/schema-draft.ts, imported by scripts/import-mongo.ts): core has no departments or branches

### Pages

- [ ] `/frontline/erxes-messenger-preview` (ErxesMessengerPreview) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:159`
- [ ] `/frontline/` (PageContainer) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:164`
- [ ] `/frontline/details/:id/:integrationType` (IntegrationDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:181`
- [ ] `/frontline/:id/pipelines/:pipelineId` (PipelineLayoutPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:189`
- [ ] `/frontline/:id/pipelines/:pipelineId` (PipelineDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:193`
- [ ] `/frontline/:id/pipelines/:pipelineId/configs` (PipelineConfigsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:198`
- [ ] `/frontline/:id/pipelines/:pipelineId/permissions` (PipelinePermissionsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:202`
- [ ] `/frontline/:id/pipelines/:pipelineId/properties` (PipelinePropertiesPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:206`
- [ ] `/frontline/:id/pipelines/:pipelineId/mail` (PipelineMailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:210`
- [ ] `/frontline/calls/dashboard` (CallDashboardIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:131`
- [ ] `/frontline/calls/dashboard/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:132`
- [ ] `/frontline/calls/statistics` (CallStatisticsIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:136`
- [ ] `/frontline/calls/statistics/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:137`
- [ ] `/frontline/calls/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:143`
- [ ] `/frontline/*` (FrontlineAppRoutes) `frontline_ui/src/modules/FrontlineMain.tsx:206`
- [ ] `/frontline/personal-channel` (PageContainer) `frontline_ui/src/modules/FrontlineSettings.tsx:53`
- [ ] `/frontline/` (div) `frontline_ui/src/modules/integrations-config/Settings.tsx:22`
- [ ] `/frontline/` (IntegrationConfigPage) `frontline_ui/src/modules/integrations-config/Settings.tsx:40`
- [ ] `/frontline/` (TopicsPage) `frontline_ui/src/modules/knowledgebase/Main.tsx:31`
- [ ] `/frontline/:topicId/articles` (ArticlesPage) `frontline_ui/src/modules/knowledgebase/Main.tsx:33`
- [ ] `/frontline/:topicId/categories` (CategoriesPage) `frontline_ui/src/modules/knowledgebase/Main.tsx:34`

### Core calls

- [ ] frontline `conversation.find` → plugin-owned `a direct function call` `frontline_api/src/apollo/subscription.ts:94`
- [ ] frontline `ticket.matchesProperties` → plugin-owned `a direct function call` `frontline_api/src/apollo/subscription.ts:250`
- [ ] frontline `mail.canViewConversation` → plugin-owned `a direct function call` `frontline_api/src/apollo/subscription.ts:527`
- [ ] core `segment.fetchSegment` → **drop**: the new core has no segments; the plugin filters its own records `frontline_api/src/conversationQueryBuilder.ts:99`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/conversationQueryBuilder.ts:363`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/conversationQueryBuilder.ts:419`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/meta/import-export/export/getTicketExportData.ts:68`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/meta/import-export/export/getTicketExportData.ts:83`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/meta/import-export/utils.ts:48`
- [ ] core `fieldsGroups.find` → plugin-owned `frontline_fields` `frontline_api/src/meta/import-export/utils.ts:70`
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/meta/import-export/utils.ts:141`

### Events

- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/utils/notifications.ts:72`

### Workers and crons

- [ ] `frontline_api/src/modules/customdomain/schedule.ts` (upsertJobScheduler) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/customdomain/worker.ts` (createMQWorkerWithListeners, path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/form/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/inbox/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/discord/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/facebook/commentOutboxWorker.ts` (createMQWorkerWithListeners, path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/facebook/meta/automation/messages/inputWait.ts` (createMQWorkerWithListeners) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/facebook/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/instagram/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/mail/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/mail/utils/cloudflare/worker.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/mail/worker/bundle.generated.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/integrations/telegram/meta/automation/workers.ts` (path) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/knowledgebase/utils/scheduledPublish.ts` (createMQWorkerWithListeners) → plugin-owned: a job in the API process
- [ ] `frontline_api/src/modules/ticket/utils/slaWorker.ts` (createMQWorkerWithListeners, path) → plugin-owned: a job in the API process

### Registrations

- [ ] notification `conversationAddMessage` (conversations) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:16`
- [ ] notification `conversationAssigneeChange` (conversations) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:23`
- [ ] notification `conversationMention` (conversations) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:28`
- [ ] notification `conversationStateChange` (conversations) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:34`
- [ ] notification `ticketAssignee` (tickets) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:47`
- [ ] notification `ticketUpdated` (tickets) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:52`
- [ ] notification `ticketMention` (tickets) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:57`
- [ ] notification `ticketCustomerReply` (tickets) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:62`
- [ ] notification `integrationHealthBroken` (integrations) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:75`
- [ ] notification `channelMembersChange` (channels) → sdk `manifest.notificationKinds` `frontline_api/src/meta/notifications.ts:89`
- [ ] permission `showConversations` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:18`
- [ ] permission `conversationMessageAdd` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:24`
- [ ] permission `conversationMessageEdit` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:29`
- [ ] permission `conversationsAssign` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:34`
- [ ] permission `conversationsUnassign` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:39`
- [ ] permission `conversationsChangeStatus` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:44`
- [ ] permission `conversationsResolve` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:49`
- [ ] permission `conversationEditCustomFields` (inbox) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:54`
- [ ] permission `showChannels` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:68`
- [ ] permission `showAllChannels` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:74`
- [ ] permission `channelAdd` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:79`
- [ ] permission `channelUpdate` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:84`
- [ ] permission `channelRemove` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:89`
- [ ] permission `channelManageMembers` (channel) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:94`
- [ ] permission `showIntegrations` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:108`
- [ ] permission `integrationsAdd` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:114`
- [ ] permission `integrationsEdit` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:119`
- [ ] permission `integrationsRemove` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:124`
- [ ] permission `showTickets` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:142`
- [ ] permission `createTicket` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:148`
- [ ] permission `updateTicket` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:153`
- [ ] permission `removeTicket` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:158`
- [ ] permission `ticketStatusesManage` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:163`
- [ ] permission `ticketsExportManage` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:168`
- [ ] permission `ticketsImportManage` (ticket) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:173`
- [ ] permission `showForms` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:187`
- [ ] permission `formsAdd` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:193`
- [ ] permission `formsEdit` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:194`
- [ ] permission `formsRemove` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:195`
- [ ] permission `formsDuplicate` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:200`
- [ ] permission `formsToggleStatus` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:205`
- [ ] permission `showFormSubmissions` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:210`
- [ ] permission `formSubmissionsRemove` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:216`
- [ ] permission `formSubmissionsExportManage` (form) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:221`
- [ ] permission `showSurveys` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:235`
- [ ] permission `surveyAdd` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:241`
- [ ] permission `surveyEdit` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:246`
- [ ] permission `surveyRemove` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:251`
- [ ] permission `surveyToggleStatus` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:256`
- [ ] permission `surveySendToConversation` (survey) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:261`
- [ ] permission `showCallReports` (callReport) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:275`
- [ ] permission `showAllCallReports` (callReport) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:281`
- [ ] permission `showResponseTemplates` (responseTemplate) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:296`
- [ ] permission `responseTemplatesAdd` (responseTemplate) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:302`
- [ ] permission `responseTemplatesEdit` (responseTemplate) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:307`
- [ ] permission `responseTemplatesRemove` (responseTemplate) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:312`
- [ ] permission `showKnowledgeBase` (knowledgeBase) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:326`
- [ ] permission `knowledgeBaseTopicsManage` (knowledgeBase) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:332`
- [ ] permission `knowledgeBaseCategoriesManage` (knowledgeBase) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:337`
- [ ] permission `knowledgeBaseArticlesManage` (knowledgeBase) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:342`
- [ ] permission `showHelpCenter` (helpCenter) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:356`
- [ ] permission `helpCenterManage` (helpCenter) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:362`
- [ ] default role `frontline:admin` → sdk `manifest.permissionSets` (a set of its permissions an owner adds to any role; members keep one role) `frontline_api/src/meta/permissions.ts:373`
- [ ] default role `frontline:user` → sdk `manifest.permissionSets` (a set of its permissions an owner adds to any role; members keep one role) `frontline_api/src/meta/permissions.ts:483`
- [ ] default role `frontline:viewer` → sdk `manifest.permissionSets` (a set of its permissions an owner adds to any role; members keep one role) `frontline_api/src/meta/permissions.ts:534`
- [ ] automation trigger `Form submitted` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/form/meta/automation/constants.ts:56`
- [ ] automation action `Create form link` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/form/meta/automation/constants.ts:43`
- [ ] automation trigger `Conversation event` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/inbox/meta/automation/constants.ts:101`
- [ ] automation trigger `Erxes Messenger Message` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/inbox/meta/automation/constants.ts:113`
- [ ] automation action `Send Erxes Messenger Message` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/inbox/meta/automation/constants.ts:161`
- [ ] automation action `Hand off to a person` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/inbox/meta/automation/constants.ts:172`
- [ ] segment `conversations` → **drop**: the new core has no segments; the plugin filters its own records `frontline_api/src/modules/inbox/meta/segments/configs.ts:3`
- [ ] automation trigger `Discord Message` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/integrations/discord/meta/automation/constants.ts:45`
- [ ] automation action `Send Discord Message` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/discord/meta/automation/constants.ts:33`
- [ ] automation trigger `Facebook Message` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/integrations/facebook/meta/automation/constants.ts:161`
- [ ] automation trigger `Facebook Comments` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/integrations/facebook/meta/automation/constants.ts:172`
- [ ] automation action `Send Facebook Message` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/facebook/meta/automation/constants.ts:105`
- [ ] automation action `Message the customer on Messenger` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/facebook/meta/automation/constants.ts:126`
- [ ] automation action `Send Facebook Comment` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/facebook/meta/automation/constants.ts:143`
- [ ] automation trigger `Email Received` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/integrations/mail/meta/automation/constants.ts:84`
- [ ] automation action `Send Email` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/mail/meta/automation/constants.ts:60`
- [ ] automation action `Draft Email Reply` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/mail/meta/automation/constants.ts:71`
- [ ] automation trigger `Telegram Message` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/integrations/telegram/meta/automation/constants.ts:43`
- [ ] automation action `Send Telegram Message` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/integrations/telegram/meta/automation/constants.ts:31`
- [ ] automation trigger `Tickets` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:149`
- [ ] automation trigger `Ticket status changed` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:159`
- [ ] automation trigger `Ticket SLA` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:173`
- [ ] automation action `Create ticket` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:189`
- [ ] segment `tickets` → **drop**: the new core has no segments; the plugin filters its own records `frontline_api/src/modules/ticket/meta/segments/configs.ts:13`
- [ ] automation trigger `<TICKET_STATUS_CHANGED_TRIGGER_TYPE>` → sdk `manifest.events` (published with core_publish_event()) `frontline_ui/src/modules/status/utils/statusAutomationSeed.ts:24`
- [ ] automation action `split` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_ui/src/modules/status/utils/statusAutomationSeed.ts:39`
- [ ] automation action `frontline:facebook.comments.create` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_ui/src/widgets/automations/modules/facebook/components/bots/utils/buildAiReplySeedLink.ts:54`
- [ ] automation action `frontline:facebook.messages.create` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_ui/src/widgets/automations/modules/facebook/components/bots/utils/buildAiReplySeedLink.ts:80`
- [ ] automation action `frontline:instagram.comments.create` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_ui/src/widgets/automations/modules/instagram/components/bots/utils/buildAiReplySeedLink.ts:52`
- [ ] automation action `frontline:instagram.messages.create` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_ui/src/widgets/automations/modules/instagram/components/bots/utils/buildAiReplySeedLink.ts:77`

### Environment

- [ ] `BATCH_SIZE` → api/src/config.ts `frontline_api/src/migrations/migrateLegacyIntegrations.ts:13`
- [ ] `BOT_OWNER_USER_ID` → api/src/config.ts `frontline_api/src/migrations/migrateLegacyIntegrations.ts:11`
- [ ] `CALL_API_EXPIRY` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:205`
- [ ] `CALL_API_PASSWORD` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:204`
- [ ] `CALL_API_USER` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:203`
- [ ] `CALL_ENDPOINT_URL` → api/src/config.ts `frontline_api/src/modules/integrations/call/helpers.ts:228`
- [ ] `CALL_SUBSCRIPTION_REQUIRE_AUTH` → api/src/config.ts `frontline_api/src/modules/integrations/call/graphql/resolvers/queries.ts:215`
- [ ] `CALL_WEBHOOK_REQUIRE_SIGNATURE` → api/src/config.ts `frontline_api/src/modules/integrations/call/webhookAuth.ts:10`
- [ ] `CALLPRO_ENABLED` → api/src/config.ts `frontline_api/src/modules/integrations/callpro/config.ts:4`
- [ ] `CLOUDFLARE_CUSTOMHOST_API_TOKEN` → api/src/config.ts `frontline_api/src/modules/customdomain/constants.ts:15`
- [ ] `CLOUDFLARE_ZONE_ID` → api/src/config.ts `frontline_api/src/modules/customdomain/constants.ts:14`
- [ ] `CUTOFF` → api/src/config.ts `frontline_api/src/migrations/migrateCdrDates.ts:11`
- [ ] `DRY_RUN` → api/src/config.ts `frontline_api/src/migrations/migrateTickets.ts:17`
- [ ] `ENDPOINT_URL` → api/src/config.ts `frontline_api/src/modules/integrations/instagram/helpers.ts:21`
- [ ] `FACEBOOK_GRAPH_URL` → api/src/config.ts `frontline_api/src/modules/integrations/facebook/graphRequest.ts:8`
- [ ] `FACEBOOK_REPLY_DEBOUNCE_MEDIA_MS` → api/src/config.ts `frontline_api/src/modules/integrations/facebook/meta/automation/utils/turnTaking.ts:64`
- [ ] `FACEBOOK_REPLY_DEBOUNCE_TEXT_MS` → api/src/config.ts `frontline_api/src/modules/integrations/facebook/meta/automation/utils/turnTaking.ts:63`
- [ ] `GATEWAY_URL` → api/src/config.ts `frontline_api/src/modules/integrations/discord/utils/media/attachments.ts:33`
- [ ] `HELPCENTER_DOMAIN_SUFFIX` → api/src/config.ts `frontline_api/src/modules/customdomain/constants.ts:5`
- [ ] `INSTAGRAM_REPLY_DEBOUNCE_MEDIA_MS` → api/src/config.ts `frontline_api/src/modules/integrations/instagram/meta/automation/utils/turnTaking.ts:27`
- [ ] `INSTAGRAM_REPLY_DEBOUNCE_TEXT_MS` → api/src/config.ts `frontline_api/src/modules/integrations/instagram/meta/automation/utils/turnTaking.ts:21`
- [ ] `JWT_TOKEN_SECRET` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:19`
- [ ] `LEGACY_FACEBOOK_DB` → api/src/config.ts `frontline_api/src/migrations/migrateLegacyIntegrations.ts:9`
- [ ] `LEGACY_INTEGRATIONS_DB` → api/src/config.ts `frontline_api/src/migrations/migrateLegacyIntegrations.ts:10`
- [ ] `MAIL_DOMAIN` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/platformConfig.ts:6`
- [ ] `MAIL_INBOUND_RATE_LIMIT` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/rateLimit.ts:20`
- [ ] `MAIL_RECEIVE_URL` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/cloudflare/provision.ts:117`
- [ ] `MAIL_SENDING_ACCOUNT_ID` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/platformConfig.ts:15`
- [ ] `MAIL_SENDING_API_TOKEN` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/platformConfig.ts:21`
- [ ] `MAIL_SENDING_DAILY_LIMIT` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/rateLimit.ts:32`
- [ ] `MAIL_TENANT` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/address.ts:90`
- [ ] `MAIL_WEBHOOK_SECRET` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/signature.ts:13`
- [ ] `MAIL_WORKER_URL` → api/src/config.ts `frontline_api/src/modules/integrations/mail/utils/connection.ts:48`
- [ ] `NODE_TLS_REJECT_UNAUTHORIZED` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:209`
- [ ] `REACT_APP_WIDGETS_URL` → api/src/config.ts `frontline_ui/src/modules/utils.ts:27`
- [ ] `SINCE` → api/src/config.ts `frontline_api/src/migrations/migrateCallConversationContents.ts:19`
- [ ] `STATIC_CHANNEL_ID` → api/src/config.ts `frontline_api/src/migrations/migrateTickets.ts:24`
- [ ] `TIMEZONE` → api/src/config.ts `frontline_api/src/modules/integrations/call/utils.ts:586`
- [ ] `TZ` → api/src/config.ts `frontline_api/src/modules/reports/utils.ts:384`
- [ ] `WIDGETS_DOMAIN` → api/src/config.ts `frontline_api/src/modules/form/meta/automation/createFormLinkAction.ts:87`

## channel

### Tables

- [ ] `frontline_channels` from collection `channels` (11 fields, draft `frontlineChannels` in migration/schema-draft.ts) `frontline_api/src/modules/channel/db/definitions/channel.ts:6`
- [ ] `frontline_channel_members` from collection `channel_members` (5 fields, draft `frontlineChannelMembers` in migration/schema-draft.ts) `frontline_api/src/modules/channel/db/definitions/channel.ts:53`

### Procedures

- [ ] query `getChannel` → procedure `channel.getChannel` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] query `getChannels` → procedure `channel.getChannels` (returns `[Channel]`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] query `getMyChannels` → procedure `channel.getMyChannels` (returns `[Channel]`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] query `getPersonalChannel` → procedure `channel.getPersonalChannel` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] query `getChannelMembers` → procedure `channel.getChannelMembers` (returns `[ChannelMember]`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] mutation `channelAdd` → procedure `channel.channelAdd` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelUpdate` → procedure `channel.channelUpdate` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelRemove` → procedure `channel.channelRemove` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelAddMembers` → procedure `channel.channelAddMembers` (returns `[ChannelMember]`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelRemoveMember` → procedure `channel.channelRemoveMember` (returns `ChannelMember`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelRemoveMembers` → procedure `channel.channelRemoveMembers` (returns `[ChannelMember]`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelUpdateMember` → procedure `channel.channelUpdateMember` (returns `ChannelMember`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelMoveResources` → procedure `channel.channelMoveResources` (returns `ChannelMoveResourcesResult`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`

### Pages

- [ ] `/frontline/:id` (ChannelDetailsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:173`
- [ ] `/frontline/:id/members` (ChannelMembersPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:177`
- [ ] `/frontline/:id/forms` (ChannelFormsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:227`

### Events

- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/channel/graphql/resolvers/mutations/channel.ts:77`

## channels

### Pages

- [ ] `/frontline/` (ChannelsSettingsIndexPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:172`
- [ ] `/frontline/:id/surveys` (ChannelSurveysPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:231`
- [ ] `/frontline/channels/*` (ChannelsSettings) `frontline_ui/src/modules/FrontlineSettings.tsx:49`

## customdomain

### Procedures

- [ ] query `frontlineCustomDomain` → procedure `customdomain.frontlineCustomDomain` (returns `FrontlineCustomDomain`) `frontline_api/src/modules/customdomain/graphql/schemas/customDomain.ts:23`
- [ ] mutation `frontlineCustomDomainSave` → procedure `customdomain.frontlineCustomDomainSave` (returns `FrontlineCustomDomain`) `frontline_api/src/modules/customdomain/graphql/schemas/customDomain.ts:27`
- [ ] mutation `frontlineCustomDomainRefresh` → procedure `customdomain.frontlineCustomDomainRefresh` (returns `FrontlineCustomDomain`) `frontline_api/src/modules/customdomain/graphql/schemas/customDomain.ts:27`
- [ ] mutation `frontlineCustomDomainReset` → procedure `customdomain.frontlineCustomDomainReset` (returns `FrontlineCustomDomain`) `frontline_api/src/modules/customdomain/graphql/schemas/customDomain.ts:27`

### Routes

- [ ] GET `/customdomain/resolve` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/customdomain/routes.ts:11`

## form

### Tables

- [ ] `frontline_form_fields` from collection `frontline_form_fields` (37 fields, draft `frontlineFormFields` in migration/schema-draft.ts) `frontline_api/src/modules/form/db/definitions/fields.ts:137`
- [ ] `frontline_forms` from collection `frontline_forms` (20 fields, draft `frontlineForms` in migration/schema-draft.ts) `frontline_api/src/modules/form/db/definitions/forms.ts:318`
- [ ] `frontline_form_submissions` from collection `frontline_form_submissions` (13 fields, draft `frontlineFormSubmissions` in migration/schema-draft.ts) `frontline_api/src/modules/form/db/definitions/forms.ts:114`
- [ ] `formSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/form/db/definitions/forms.ts:318`

### Procedures

- [ ] query `frontlineFields` → procedure `form.frontlineFields` (returns `FrontlineFieldListResponse`) `frontline_api/src/modules/form/graphql/schema/field.ts:167`
- [ ] query `frontlineFormFieldConversionCheck` → procedure `form.frontlineFormFieldConversionCheck` (returns `FrontlineFormConversionCheck!`) `frontline_api/src/modules/form/graphql/schema/field.ts:167`
- [ ] mutation `frontlineFieldsBulkAction` → procedure `form.frontlineFieldsBulkAction` (returns `[FrontlineField]`) `frontline_api/src/modules/form/graphql/schema/field.ts:172`
- [ ] query `formDetail` → procedure `form.formDetail` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `forms` → procedure `form.forms` (returns `FormListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formsMain` → procedure `form.formsMain` (returns `FormListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formsTotalCount` → procedure `form.formsTotalCount` (returns `FormsTotalCount`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formSubmissions` → procedure `form.formSubmissions` (returns `SubmissionListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formSubmissionDetail` → procedure `form.formSubmissionDetail` (returns `Submission`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `cpForms` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `cpFormDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] mutation `formsAdd` → procedure `form.formsAdd` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsEdit` → procedure `form.formsEdit` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsRemove` → procedure `form.formsRemove` (returns `[String]`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsToggleStatus` → procedure `form.formsToggleStatus` (returns `Boolean`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsDuplicate` → procedure `form.formsDuplicate` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsSave` → procedure `form.formSubmissionsSave` (returns `Boolean`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsRemove` → procedure `form.formSubmissionsRemove` (returns `JSON`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsEdit` → procedure `form.formSubmissionsEdit` (returns `Submission`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `widgetsLeadConnect` → procedure `form.widgetsLeadConnect` (returns `FormConnectResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `widgetsSaveLead` → procedure `form.widgetsSaveLead` (returns `SaveFormResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `cpWidgetsSaveLead` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:188`

### Pages

- [ ] `/frontline/:id/forms/create` (FormCreatePage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:243`
- [ ] `/frontline/:id/forms/:formId` (FormDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:247`
- [ ] `/frontline/forms/create` (FormCreatePage) `frontline_ui/src/modules/FrontlineMain.tsx:147`
- [ ] `/frontline/forms/:formId` (FormDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:148`
- [ ] `/frontline/forms/preview` (FormPreviewPage) `frontline_ui/src/modules/FrontlineMain.tsx:154`
- [ ] `/frontline/:`/forms${FrontlinePaths.FormPreview`}` (FormPreviewPage) `frontline_ui/src/modules/FrontlineSettings.tsx:62`

### Core calls

- [ ] core `fields.getFieldList` → plugin-owned `frontline_fields` `frontline_api/src/modules/form/graphql/resolvers/mutations/widget.ts:318`
- [ ] core `fields.getFieldList` → plugin-owned `frontline_fields` `frontline_api/src/modules/form/graphql/resolvers/mutations/widget.ts:329`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/form/graphql/resolvers/mutations/widget.ts:438`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/form/graphql/resolvers/mutations/widget.ts:449`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/form/graphql/resolvers/mutations/widget.ts:506`
- [ ] core `tags.findOne` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/form/graphql/resolvers/queries/forms.ts:23`

### Events

- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/form/meta/automation/workers.ts:154`

## forms

### Pages

- [ ] `/frontline/:id/forms/submissions/:formId` (FormSubmissionIndexPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:251`
- [ ] `/frontline/forms` (FormsView) `frontline_ui/src/modules/FrontlineMain.tsx:145`
- [ ] `/frontline/forms` (Forms) `frontline_ui/src/modules/FrontlineMain.tsx:146`
- [ ] `/frontline/forms/submissions/:formId` (FormSubmissionIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:149`

## helpcenter

### Tables

- [ ] `frontline_help_center_configs` from collection `frontline_help_center_configs` (28 fields, draft `frontlineHelpCenterConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/helpcenter/db/definitions/helpCenterConfig.ts:78`

### Procedures

- [ ] query `helpCenterConfig` → procedure `helpcenter.helpCenterConfig` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterConfigs` → procedure `helpcenter.helpCenterConfigs` (returns `[HelpCenterConfig]`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterConfigsTotalCount` → procedure `helpcenter.helpCenterConfigsTotalCount` (returns `Int`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterGetConfigByDomain` → procedure `helpcenter.helpCenterGetConfigByDomain` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] mutation `helpCenterConfigUpdate` → procedure `helpcenter.helpCenterConfigUpdate` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:197`
- [ ] mutation `helpCenterConfigRemove` → procedure `helpcenter.helpCenterConfigRemove` (returns `JSON`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:197`

### Pages

- [ ] `/frontline/helpcenter` (HelpCenter) `frontline_ui/src/modules/FrontlineMain.tsx:160`

### Core calls

- [ ] core `clientPortals.get` → **drop**: the new core has no client portal `frontline_api/src/modules/helpcenter/utils/clientPortal.ts:21`

## inbox

### Tables

- [ ] `frontline_integrations` from collection `integrations` (16 fields, draft `frontlineIntegrations` in migration/schema-draft.ts) `frontline_api/src/modules/inbox/db/definitions/integrations.ts:310`
- [ ] `frontline_conversations` from collection `conversations` (3 fields, draft `frontlineConversations` in migration/schema-draft.ts) `frontline_api/src/modules/inbox/db/definitions/conversations.ts:111`
- [ ] `frontline_conversation_messages` from collection `conversation_messages` (27 fields, draft `frontlineConversationMessages` in migration/schema-draft.ts) `frontline_api/src/modules/inbox/db/definitions/conversationMessages.ts:60`
- [ ] `frontline_messenger_apps` from collection `messenger_apps` (6 fields, draft `frontlineMessengerApps` in migration/schema-draft.ts) `frontline_api/src/modules/inbox/db/definitions/messengerApps.ts:49`
- [ ] `frontline_configs` from collection `configs` (3 fields, draft `frontlineConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/inbox/@types/configs.ts:16`

### Procedures

- [ ] query `cpIntegrations` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:1`
- [ ] query `cpConversation` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:1`
- [ ] query `cpConversationDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:1`
- [ ] query `cpConversations` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:1`
- [ ] query `cpMessengerConversationDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:1`
- [ ] mutation `cpConnect` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:9`
- [ ] mutation `cpInsertMessage` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:9`
- [ ] mutation `cpReadConversationMessages` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:9`
- [ ] subscription `cpConversationChanged` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:38`
- [ ] subscription `cpConversationMessageInserted` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:38`
- [ ] subscription `cpConversationClientMessageInserted` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/schemas/clientPortal.ts:38`
- [ ] query `getColorThemePreview` → procedure `inbox.getColorThemePreview` (returns `ColorThemePreview`) `frontline_api/src/modules/inbox/graphql/schemas/colorTheme.ts:1`
- [ ] mutation `applyColorThemeToIntegration` → procedure `inbox.applyColorThemeToIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/colorTheme.ts:5`
- [ ] query `conversationMessage` → procedure `inbox.conversationMessage` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversations` → procedure `inbox.conversations` (returns `ConversationListResponse`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationMessages` → procedure `inbox.conversationMessages` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationMessagesTotalCount` → procedure `inbox.conversationMessagesTotalCount` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationPinnedMessages` → procedure `inbox.conversationPinnedMessages` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationCounts` → procedure `inbox.conversationCounts` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsTotalCount` → procedure `inbox.conversationsTotalCount` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationDetail` → procedure `inbox.conversationDetail` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsGetLast` → procedure `inbox.conversationsGetLast` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsTotalUnreadCount` → procedure `inbox.conversationsTotalUnreadCount` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `userConversations` → procedure `inbox.userConversations` (returns `UserConversationListResponse`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] mutation `conversationMessageReact` → procedure `inbox.conversationMessageReact` (returns `Boolean!`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessageAdd` → procedure `inbox.conversationMessageAdd` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessagePin` → procedure `inbox.conversationMessagePin` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessageEdit` → procedure `inbox.conversationMessageEdit` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsAssign` → procedure `inbox.conversationsAssign` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsUnassign` → procedure `inbox.conversationsUnassign` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsChangeStatus` → procedure `inbox.conversationsChangeStatus` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMarkAsRead` → procedure `inbox.conversationMarkAsRead` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationAgentTyping` → procedure `inbox.conversationAgentTyping` (returns `Boolean`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `changeConversationOperator` → procedure `inbox.changeConversationOperator` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationSetAutomatedReplyControl` → procedure `inbox.conversationSetAutomatedReplyControl` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsResolve` → procedure `inbox.conversationsResolve` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationEditCustomFields` → procedure `inbox.conversationEditCustomFields` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] query `integrations` → procedure `inbox.integrations` (returns `IntegrationRespone`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `allLeadIntegrations` → procedure `inbox.allLeadIntegrations` (returns `[Integration]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsGetUsedTypes` → procedure `inbox.integrationsGetUsedTypes` (returns `[integrationsGetUsedTypes]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsGetUsedTypesByChannel` → procedure `inbox.integrationsGetUsedTypesByChannel` (returns `[integrationsGetUsedTypesByChannel]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationDetail` → procedure `inbox.integrationDetail` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsTotalCount` → procedure `inbox.integrationsTotalCount` (returns `integrationsTotalCount`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] mutation `integrationsCreateMessengerOnboarding` → procedure `inbox.integrationsCreateMessengerOnboarding` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsEditMessengerOnboarding` → procedure `inbox.integrationsEditMessengerOnboarding` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCreateMessengerIntegration` → procedure `inbox.integrationsCreateMessengerIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsEditMessengerIntegration` → procedure `inbox.integrationsEditMessengerIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsSaveMessengerAppearanceData` → procedure `inbox.integrationsSaveMessengerAppearanceData` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsSaveMessengerColorTheme` → procedure `inbox.integrationsSaveMessengerColorTheme` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsGetMessengerColorThemes` → procedure `inbox.integrationsGetMessengerColorThemes` (returns `[MessengerColorTheme]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsSaveMessengerConfigs` → procedure `inbox.integrationsSaveMessengerConfigs` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCreateExternalIntegration` → procedure `inbox.integrationsCreateExternalIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsEditCommonFields` → procedure `inbox.integrationsEditCommonFields` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsRemove` → procedure `inbox.integrationsRemove` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsRemoveAccount` → procedure `inbox.integrationsRemoveAccount` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsRepair` → procedure `inbox.integrationsRepair` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsArchive` → procedure `inbox.integrationsArchive` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCreateLeadIntegration` → procedure `inbox.integrationsCreateLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsEditLeadIntegration` → procedure `inbox.integrationsEditLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCopyLeadIntegration` → procedure `inbox.integrationsCopyLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsSaveMessengerTicketData` → procedure `inbox.integrationsSaveMessengerTicketData` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] query `widgetsConversations` → procedure `inbox.widgetsConversations` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsConversationDetail` → procedure `inbox.widgetsConversationDetail` (returns `ConversationDetailResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsMessages` → procedure `inbox.widgetsMessages` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsUnreadCount` → procedure `inbox.widgetsUnreadCount` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsTotalUnreadCount` → procedure `inbox.widgetsTotalUnreadCount` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsMessengerSupporters` → procedure `inbox.widgetsMessengerSupporters` (returns `MessengerSupportersResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsTicketCustomerDetail` → procedure `inbox.widgetsTicketCustomerDetail` (returns `Customer`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsGetTicketTags` → procedure `inbox.widgetsGetTicketTags` (returns `[Tag]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketCheckProgress` → procedure `inbox.widgetTicketCheckProgress` (returns `Ticket`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketComments` → procedure `inbox.widgetTicketComments` (returns `[TicketNote]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketActivityLogs` → procedure `inbox.widgetTicketActivityLogs` (returns `[TicketActivity]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketsByCustomer` → procedure `inbox.widgetTicketsByCustomer` (returns `[Ticket]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] mutation `widgetsMessengerConnect` → procedure `inbox.widgetsMessengerConnect` (returns `MessengerConnectResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsSaveBrowserInfo` → procedure `inbox.widgetsSaveBrowserInfo` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsInsertMessage` → procedure `inbox.widgetsInsertMessage` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetBotRequest` → procedure `inbox.widgetBotRequest` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsReadConversationMessages` → procedure `inbox.widgetsReadConversationMessages` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetChangeOperatorStatus` → procedure `inbox.widgetChangeOperatorStatus` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetGetBotInitialMessage` → procedure `inbox.widgetGetBotInitialMessage` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsLeadIncreaseViewCount` → procedure `inbox.widgetsLeadIncreaseViewCount` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsSendTypingInfo` → procedure `inbox.widgetsSendTypingInfo` (returns `String`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsTicketCustomersEdit` → procedure `inbox.widgetsTicketCustomersEdit` (returns `Customer`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCreated` → procedure `inbox.widgetTicketCreated` (returns `Ticket`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCommentAdd` → procedure `inbox.widgetTicketCommentAdd` (returns `TicketNote`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCommentRemove` → procedure `inbox.widgetTicketCommentRemove` (returns `String`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`

### Pages

- [ ] `/frontline/inbox` (Inbox) `frontline_ui/src/modules/FrontlineMain.tsx:124`
- [ ] `/frontline/` (Inbox) `frontline_ui/src/modules/inbox/InboxMain.tsx:15`

### Core calls

- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/actionHandlers.ts:33`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/inbox/actionHandlers.ts:46`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/inbox/actionHandlers.ts:70`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/inbox/actionHandlers.ts:104`
- [ ] core `config.getConfig` → plugin-owned `frontline_settings` (country and currency: organizations.current (sdk)) `frontline_api/src/modules/inbox/actionHandlers.ts:217`
- [ ] core `users.getIds` → sdk `users.list` (scope users:read) `frontline_api/src/modules/inbox/actionHandlers.ts:230`
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/inbox/db/models/Conversations.ts:180`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/events.ts:44`
- [ ] core `customers.getWidgetCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone) `frontline_api/src/modules/inbox/events.ts:140`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/inbox/events.ts:152`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/events.ts:182`
- [ ] core `fields.generateTypedListFromMap` → plugin-owned `frontline_fields` `frontline_api/src/modules/inbox/events.ts:238`
- [ ] core `fields.generateTypedListFromMap` → plugin-owned `frontline_fields` `frontline_api/src/modules/inbox/events.ts:251`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/inbox/events.ts:264`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/events.ts:276`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationMessageMutations.ts:77`
- [ ] core `core.sendEmail` → sdk `emails.send` (scope emails:write; plain text, up to 50 addresses, replyTo; team members: notifications.create) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationMessageMutations.ts:98`
- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationNotifications.ts:79`
- [ ] core `clientPortals.get` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationNotifications.ts:91`
- [ ] core `cpNotifications.create` → **drop**: the new core has no client portal `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationNotifications.ts:101`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversations.ts:83`
- [ ] core `brands.create` → **drop**: the new core has no brands; leave brand ids and names out `frontline_api/src/modules/inbox/graphql/resolvers/mutations/integrations.ts:288`
- [ ] core `brands.updateOne` → **drop**: the new core has no brands; leave brand ids and names out `frontline_api/src/modules/inbox/graphql/resolvers/mutations/integrations.ts:350`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:218`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:247`
- [ ] core `companies.findOne` → sdk `companies.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:297`
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:365`
- [ ] core `customers.getWidgetCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:445`
- [ ] core `customers.updateMessengerCustomer` → sdk `customers.update` (scope customers:write; messenger session data (last seen, online, location) stays in the plugin) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:468`
- [ ] core `customers.createMessengerCustomer` → sdk `customers.findOrCreate` (scope customers:write; state: 'lead', source: 'chat') `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:481`
- [ ] core `fields.generatePropertiesData` → plugin-owned `frontline_fields` `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:499`
- [ ] core `companies.updateCompany` → sdk `companies.update` (scope customers:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:517`
- [ ] core `companies.createCompany` → sdk `companies.create` (scope customers:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:537`
- [ ] core `customers.markCustomerAsActive` → plugin-owned `frontline_customers` (messenger session data) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:786`
- [ ] core `customers.updateLocation` → plugin-owned `frontline_customers` (the visitor's location is messenger session data) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:999`
- [ ] core `customers.updateSession` → plugin-owned `frontline_customers` (messenger session data) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:1011`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:1290`
- [ ] core `tags.findOne` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/inbox/graphql/resolvers/queries/integrations.ts:83`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/inbox/graphql/resolvers/queries/integrations.ts:344`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/inbox/graphql/resolvers/queries/widget.ts:55`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/graphql/resolvers/queries/widget.ts:285`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/inbox/graphql/resolvers/queries/widget.ts:302`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/receiveMessage.ts:83`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/inbox/receiveMessage.ts:95`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/inbox/receiveMessage.ts:119`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/inbox/receiveMessage.ts:152`
- [ ] core `config.getConfig` → plugin-owned `frontline_settings` (country and currency: organizations.current (sdk)) `frontline_api/src/modules/inbox/receiveMessage.ts:310`
- [ ] core `users.getIds` → sdk `users.list` (scope users:read) `frontline_api/src/modules/inbox/receiveMessage.ts:323`
- [ ] core `automation.find` → plugin-owned `frontline_settings` (what the plugin read from an automation (a chatbot's menu, its get-started reply) is its own setting; automations act on its events) `frontline_api/src/modules/inbox/utils.ts:75`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/inbox/utils/conversationCounts.ts:36`
- [ ] core `activityLog.createActivityLog` → sdk `activities.create` (scope activities:write; customer or company targets, else manifest timelines) `frontline_api/src/modules/inbox/utils/conversationFormSubmission.ts:61`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/inbox/widgetSession.ts:142`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/inbox/widgetUtils.ts:17`
- [ ] core `customers.updateOne` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/inbox/widgetUtils.ts:52`

### Events

- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationMessageMutations.ts:65`
- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversationNotifications.ts:159`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversations.ts:111`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversations.ts:165`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversations.ts:189`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:529`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts:818`
- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/inbox/meta/afterProcess/conversation.ts:35`
- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/inbox/meta/afterProcess/conversation.ts:52`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/inbox/trpc/inbox.ts:946`

## integrations

### Tables

- [ ] `frontline_facebook_accounts` from collection `facebook_accounts` (9 fields, draft `frontlineFacebookAccounts` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/accounts.ts:6`
- [ ] `frontline_customers_facebooks` from collection `customers_facebooks` (7 fields, draft `frontlineCustomersFacebooks` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/customers.ts:4`
- [ ] `frontline_conversations_facebooks` from collection `conversations_facebooks` (10 fields, draft `frontlineConversationsFacebooks` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/conversations.ts:5`
- [ ] `frontline_conversation_messages_facebooks` from collection `conversation_messages_facebooks` (21 fields, draft `frontlineConversationMessagesFacebooks` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/conversationMessages.ts:5`
- [ ] `frontline_comment_conversations_facebook` from collection `comment_conversations_facebook` (14 fields, draft `frontlineCommentConversationsFacebook` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/comment_conversations.ts:5`
- [ ] `frontline_comment_conversations_reply_facebook` from collection `comment_conversations_reply_facebook` (16 fields, draft `frontlineCommentConversationsReplyFacebook` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/comment_conversations_reply.ts:4`
- [ ] `frontline_comment_outbox_facebook` from collection `comment_outbox_facebook` (17 fields, draft `frontlineCommentOutboxFacebook` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/comment_outbox.ts:36`
- [ ] `frontline_facebook_integrations` from collection `facebook_integrations` (11 fields, draft `frontlineFacebookIntegrations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/integrations.ts:4`
- [ ] `frontline_facebook_logs` from collection `facebook_logs` (5 fields, draft `frontlineFacebookLogs` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/logs.ts:4`
- [ ] `frontline_posts_conversations_facebooks` from collection `posts_conversations_facebooks` (15 fields, draft `frontlinePostsConversationsFacebooks` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/postConversations.ts:3`
- [ ] `frontline_facebook_configs` from collection `facebook_configs` (3 fields, draft `frontlineFacebookConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/config.ts:4`
- [ ] `frontline_instagram_integrations` from collection `instagram_integrations` (12 fields, draft `frontlineInstagramIntegrations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/integrations.ts:4`
- [ ] `frontline_instagram_accounts` from collection `instagram_accounts` (8 fields, draft `frontlineInstagramAccounts` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/accounts.ts:5`
- [ ] `frontline_instagram_customers` from collection `instagram_customers` (7 fields, draft `frontlineInstagramCustomers` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/customers.ts:4`
- [ ] `frontline_instagram_conversations` from collection `instagram_conversations` (9 fields, draft `frontlineInstagramConversations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/conversations.ts:5`
- [ ] `frontline_instagram_conversation_messages` from collection `instagram_conversation_messages` (25 fields, draft `frontlineInstagramConversationMessages` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/conversationMessages.ts:11`
- [ ] `frontline_instagram_comment_conversations` from collection `instagram_comment_conversations` (18 fields, draft `frontlineInstagramCommentConversations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/comment_conversations.ts:6`
- [ ] `frontline_instagram_comment_conversations_reply` from collection `instagram_comment_conversations_reply` (16 fields, draft `frontlineInstagramCommentConversationsReply` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/comment_conversations_reply.ts:6`
- [ ] `frontline_instagram_post_conversations` from collection `instagram_post_conversations` (12 fields, draft `frontlineInstagramPostConversations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/postConversations.ts:5`
- [ ] `frontline_instagram_logs` from collection `instagram_logs` (5 fields, draft `frontlineInstagramLogs` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/logs.ts:6`
- [ ] `frontline_instagram_bots` from collection `instagram_bots` (12 fields, draft `frontlineInstagramBots` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/bots.ts:12`
- [ ] `frontline_instagram_configs` from collection `instagram_configs` (3 fields, draft `frontlineInstagramConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/instagram/db/definitions/config.ts:4`
- [ ] `frontline_calls_integrations` from collection `calls_integrations` (10 fields, draft `frontlineCallsIntegrations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/integrations.ts:4`
- [ ] `frontline_calls_customers` from collection `calls_customers` (5 fields, draft `frontlineCallsCustomers` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/customers.ts:7`
- [ ] `frontline_calls_history` from collection `calls_history` (20 fields, draft `frontlineCallsHistory` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/histories.ts:4`
- [ ] `frontline_calls_configs` from collection `calls_configs` (3 fields, draft `frontlineCallsConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/models/Configs.ts:11`
- [ ] `frontline_calls_operators` from collection `calls_operators` (3 fields, draft `frontlineCallsOperators` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/operators.ts:4`
- [ ] `frontline_calls_cdr` from collection `calls_cdr` (53 fields, draft `frontlineCallsCdr` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/cdrs.ts:3`
- [ ] `frontline_calls_queue_statistics` from collection `calls_queue_statistics` (15 fields, draft `frontlineCallsQueueStatistics` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/queueStatistics.ts:15`
- [ ] `frontline_calls_sessions` from collection `calls_sessions` (23 fields, draft `frontlineCallsSessions` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/call/db/definitions/callSessions.ts:19`
- [ ] `frontline_facebook_messengers_bots` from collection `facebook_messengers_bots` (20 fields, draft `frontlineFacebookMessengersBots` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/facebook/db/definitions/bots.ts:99`
- [ ] `frontline_discord_bots` from collection `discord_bots` (12 fields, draft `frontlineDiscordBots` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/discord/db/definitions/bots.ts:22`
- [ ] `frontline_customers_discord` from collection `customers_discord` (7 fields, draft `frontlineCustomersDiscord` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/discord/db/definitions/customers.ts:4`
- [ ] `frontline_conversations_discord` from collection `conversations_discord` (12 fields, draft `frontlineConversationsDiscord` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/discord/db/definitions/conversations.ts:4`
- [ ] `frontline_conversation_messages_discord` from collection `conversation_messages_discord` (14 fields, draft `frontlineConversationMessagesDiscord` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/discord/db/definitions/conversationMessages.ts:14`
- [ ] `frontline_telegram_reactions` from collection `telegram_reactions` (8 fields, draft `frontlineTelegramReactions` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/telegram/db/models/Reactions.ts:4`
- [ ] `frontline_telegram_bots` from collection `telegram_bots` (11 fields, draft `frontlineTelegramBots` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/telegram/db/definitions/bots.ts:4`
- [ ] `frontline_customers_telegram` from collection `customers_telegram` (7 fields, draft `frontlineCustomersTelegram` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/telegram/db/definitions/customers.ts:4`
- [ ] `frontline_conversations_telegram` from collection `conversations_telegram` (11 fields, draft `frontlineConversationsTelegram` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/telegram/db/definitions/conversations.ts:4`
- [ ] `frontline_conversation_messages_telegram` from collection `conversation_messages_telegram` (24 fields, draft `frontlineConversationMessagesTelegram` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/telegram/db/definitions/conversationMessages.ts:5`
- [ ] `frontline_integrations_callpro` from collection `integrations_callpro` (4 fields, draft `frontlineIntegrationsCallpro` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/callpro/db/definitions/integrations.ts:4`
- [ ] `frontline_customers_callpro` from collection `customers_callpro` (4 fields, draft `frontlineCustomersCallpro` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/callpro/db/definitions/customers.ts:4`
- [ ] `frontline_conversations_callpro` from collection `conversations_callpro` (7 fields, draft `frontlineConversationsCallpro` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/callpro/db/definitions/conversations.ts:4`
- [ ] `frontline_logs_callpro` from collection `logs_callpro` (5 fields, draft `frontlineLogsCallpro` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/callpro/db/definitions/logs.ts:4`
- [ ] `frontline_mail_integrations` from collection `mail_integrations` (13 fields, draft `frontlineMailIntegrations` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/mail/db/definitions/integrations.ts:17`
- [ ] `frontline_mail_customers` from collection `mail_customers` (6 fields, draft `frontlineMailCustomers` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/mail/db/definitions/customers.ts:4`
- [ ] `frontline_mail_messages` from collection `mail_messages` (33 fields, draft `frontlineMailMessages` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/mail/db/definitions/messages.ts:31`
- [ ] `frontline_mail_drafts` from collection `mail_drafts` (15 fields, draft `frontlineMailDrafts` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/mail/db/definitions/drafts.ts:5`
- [ ] `frontline_mail_cloudflare` from collection `mail_cloudflare` (22 fields, draft `frontlineMailCloudflare` in migration/schema-draft.ts) `frontline_api/src/modules/integrations/mail/db/definitions/cloudflare.ts:15`

### Procedures

- [ ] query `callQueueInitialList` → procedure `integrations.callQueueInitialList` (returns `user`) `frontline_api/src/modules/integrations/call/graphql/resolvers/queries.ts:213`
- [ ] subscription `sessionTerminateRequested` → procedure `integrations.sessionTerminateRequested` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] subscription `queueRealtimeUpdate` → procedure `integrations.queueRealtimeUpdate` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] subscription `callStatistic` → procedure `integrations.callStatistic` (returns `CallStatistic`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] query `callsIntegrationDetail` → procedure `integrations.callsIntegrationDetail` (returns `CallsIntegrationDetailResponse`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callUserIntegrations` → procedure `integrations.callUserIntegrations` (returns `[CallsIntegrationDetailResponse]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callsCustomerDetail` → procedure `integrations.callsCustomerDetail` (returns `Customer`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistories` → procedure `integrations.callHistories` (returns `[CallHistory]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistoriesTotalCount` → procedure `integrations.callHistoriesTotalCount` (returns `Int`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callsGetConfigs` → procedure `integrations.callsGetConfigs` (returns `[CallConfig]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callGetAgentStatus` → procedure `integrations.callGetAgentStatus` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callExtensionList` → procedure `integrations.callExtensionList` (returns `[CallExtension]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callQueueList` → procedure `integrations.callQueueList` (returns `[CallQueueStatistic]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callQueueInitialList` → procedure `integrations.callQueueInitialList` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callConversationNotes` → procedure `integrations.callConversationNotes` (returns `[CallConversationNotes]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistoryDetail` → procedure `integrations.callHistoryDetail` (returns `CallHistory`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] mutation `callsIntegrationUpdate` → procedure `integrations.callsIntegrationUpdate` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callAddCustomer` → procedure `integrations.callAddCustomer` (returns `CallConversationDetail`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callsUpdateConfigs` → procedure `integrations.callsUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callsPauseAgent` → procedure `integrations.callsPauseAgent` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callTransfer` → procedure `integrations.callTransfer` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callSyncRecordFile` → procedure `integrations.callSyncRecordFile` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] query `callProConfig` → procedure `integrations.callProConfig` (returns `CallProConfig`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] query `callProIntegrationDetail` → procedure `integrations.callProIntegrationDetail` (returns `CallProIntegrationDetail`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] query `callProCustomersByPhone` → procedure `integrations.callProCustomersByPhone` (returns `[Customer]`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] mutation `callProCustomerSelect` → procedure `integrations.callProCustomerSelect` (returns `Conversation`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:19`
- [ ] query `discordStickerAnimation` → procedure `integrations.discordStickerAnimation` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBots` → procedure `integrations.discordBots` (returns `[DiscordBot]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBot` → procedure `integrations.discordBot` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBotsTotalCount` → procedure `integrations.discordBotsTotalCount` (returns `Int`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordValidateToken` → procedure `integrations.discordValidateToken` (returns `DiscordTokenValidation`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordGuilds` → procedure `integrations.discordGuilds` (returns `[FrontlineDiscordGuild]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordGuildChannels` → procedure `integrations.discordGuildChannels` (returns `[DiscordChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBotChannels` → procedure `integrations.discordBotChannels` (returns `[DiscordChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationChannel` → procedure `integrations.discordConversationChannel` (returns `DiscordConversationChannel`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationChannels` → procedure `integrations.discordConversationChannels` (returns `[DiscordConversationChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationParticipants` → procedure `integrations.discordConversationParticipants` (returns `[DiscordParticipant]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordChannelMembers` → procedure `integrations.discordChannelMembers` (returns `DiscordChannelMembersResult`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordServers` → procedure `integrations.discordServers` (returns `[DiscordServer]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConnectedServers` → procedure `integrations.discordConnectedServers` (returns `[DiscordConnectedServer]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordTakenChannels` → procedure `integrations.discordTakenChannels` (returns `[String]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordNamePresets` → procedure `integrations.discordNamePresets` (returns `[String]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] mutation `discordAddBot` → procedure `integrations.discordAddBot` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordUpdateBot` → procedure `integrations.discordUpdateBot` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordRemoveBot` → procedure `integrations.discordRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordEditMessage` → procedure `integrations.discordEditMessage` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordDeleteMessage` → procedure `integrations.discordDeleteMessage` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] query `facebookGetAccounts` → procedure `integrations.facebookGetAccounts` (returns `[FacebookAccount]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetIntegrations` → procedure `integrations.facebookGetIntegrations` (returns `[FacebookIntegrationRecord]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetIntegrationDetail` → procedure `integrations.facebookGetIntegrationDetail` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetConfigs` → procedure `integrations.facebookGetConfigs` (returns `[FacebookConfig]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetComments` → procedure `integrations.facebookGetComments` (returns `[FacebookPostMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetCommentCount` → procedure `integrations.facebookGetCommentCount` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPages` → procedure `integrations.facebookGetPages` (returns `[FacebookPage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationDetail` → procedure `integrations.facebookConversationDetail` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationMessages` → procedure `integrations.facebookConversationMessages` (returns `[FacebookConversationMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationMessagesCount` → procedure `integrations.facebookConversationMessagesCount` (returns `Int`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPost` → procedure `integrations.facebookGetPost` (returns `FacebookPost`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPosts` → procedure `integrations.facebookGetPosts` (returns `[FacebookPosts!]!`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookHasTaggedMessages` → procedure `integrations.facebookHasTaggedMessages` (returns `Boolean`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookPostMessages` → procedure `integrations.facebookPostMessages` (returns `[FacebookPostMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotsTotalCount` → procedure `integrations.facebookMessengerBotsTotalCount` (returns `Int`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBots` → procedure `integrations.facebookMessengerBots` (returns `[FacebookMessengerBot]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBot` → procedure `integrations.facebookMessengerBot` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotDelivery` → procedure `integrations.facebookMessengerBotDelivery` (returns `FacebookBotDelivery`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotCommentReplyStats` → procedure `integrations.facebookMessengerBotCommentReplyStats` (returns `[FacebookBotCommentReplyStat]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetBotPosts` → procedure `integrations.facebookGetBotPosts` (returns `[FacebookPosts]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetBotPost` → procedure `integrations.facebookGetBotPost` (returns `FacebookPosts`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] mutation `facebookUpdateConfigs` → procedure `integrations.facebookUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookRepair` → procedure `integrations.facebookRepair` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookReplyToComment` → procedure `integrations.facebookReplyToComment` (returns `FacebookComment`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookCreatePost` → procedure `integrations.facebookCreatePost` (returns `FacebookCreatePostResult`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerAddBot` → procedure `integrations.facebookMessengerAddBot` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerUpdateBot` → procedure `integrations.facebookMessengerUpdateBot` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerRemoveBot` → procedure `integrations.facebookMessengerRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerRepairBot` → procedure `integrations.facebookMessengerRepairBot` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] query `frontlineInstagramCopyImage` → procedure `integrations.frontlineInstagramCopyImage` (returns `String!`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetAccounts` → procedure `integrations.instagramGetAccounts` (returns `[InstagramAccount]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetIntegrations` → procedure `integrations.instagramGetIntegrations` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetIntegrationDetail` → procedure `integrations.instagramGetIntegrationDetail` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetConfigs` → procedure `integrations.instagramGetConfigs` (returns `[InstagramConfig]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetComments` → procedure `integrations.instagramGetComments` (returns `[InstagramPostMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetCommentCount` → procedure `integrations.instagramGetCommentCount` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPages` → procedure `integrations.instagramGetPages` (returns `[InstagramPage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationDetail` → procedure `integrations.instagramConversationDetail` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationMessages` → procedure `integrations.instagramConversationMessages` (returns `[InstagramConversationMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationMessagesCount` → procedure `integrations.instagramConversationMessagesCount` (returns `Int`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPost` → procedure `integrations.instagramGetPost` (returns `InstagramPost`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPosts` → procedure `integrations.instagramGetPosts` (returns `[InstagramPosts]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramHasTaggedMessages` → procedure `integrations.instagramHasTaggedMessages` (returns `Boolean`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramPostMessages` → procedure `integrations.instagramPostMessages` (returns `[InstagramPostMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBotsTotalCount` → procedure `integrations.instagramMessengerBotsTotalCount` (returns `Int`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBots` → procedure `integrations.instagramMessengerBots` (returns `[InstagramMessengerBot]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBot` → procedure `integrations.instagramMessengerBot` (returns `InstagramMessengerBot`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetBotPosts` → procedure `integrations.instagramGetBotPosts` (returns `[InstagramPosts]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetBotPost` → procedure `integrations.instagramGetBotPost` (returns `InstagramPosts`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] mutation `instagramUpdateConfigs` → procedure `integrations.instagramUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramRepair` → procedure `integrations.instagramRepair` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramReplyToComment` → procedure `integrations.instagramReplyToComment` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramResolveComment` → procedure `integrations.instagramResolveComment` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerAddBot` → procedure `integrations.instagramMessengerAddBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerUpdateBot` → procedure `integrations.instagramMessengerUpdateBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerRemoveBot` → procedure `integrations.instagramMessengerRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerRepairBot` → procedure `integrations.instagramMessengerRepairBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] query `mailVerifiedContacts` → procedure `integrations.mailVerifiedContacts` (returns `MailVerifiedContacts!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationDetail` → procedure `integrations.mailConversationDetail` (returns `MailConversationMessages`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationInternalNotes` → procedure `integrations.mailConversationInternalNotes` (returns `[ConversationMessage!]!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationInternalNotesCount` → procedure `integrations.mailConversationInternalNotesCount` (returns `Int!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailSendingReadiness` → procedure `integrations.mailSendingReadiness` (returns `MailSendingReadiness`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationDrafts` → procedure `integrations.mailConversationDrafts` (returns `[MailDraft]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailInboxes` → procedure `integrations.mailInboxes` (returns `[MailInbox]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailPipelineIntegration` → procedure `integrations.mailPipelineIntegration` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailSenders` → procedure `integrations.mailSenders` (returns `[MailSender!]!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailTicketReplyTarget` → procedure `integrations.mailTicketReplyTarget` (returns `MailTicketReplyTarget`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareConnection` → procedure `integrations.mailCloudflareConnection` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareSendingQuota` → procedure `integrations.mailCloudflareSendingQuota` (returns `MailCloudflareSendingQuota`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareZones` → procedure `integrations.mailCloudflareZones` (returns `[MailCloudflareZone]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] mutation `mailSendMail` → procedure `integrations.mailSendMail` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailSendReaction` → procedure `integrations.mailSendReaction` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineConnect` → procedure `integrations.mailPipelineConnect` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineUpdate` → procedure `integrations.mailPipelineUpdate` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineForwardVerified` → procedure `integrations.mailPipelineForwardVerified` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineDisconnect` → procedure `integrations.mailPipelineDisconnect` (returns `Boolean`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailTicketNoteRetry` → procedure `integrations.mailTicketNoteRetry` (returns `TicketNote`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailMessageRetry` → procedure `integrations.mailMessageRetry` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftSave` → procedure `integrations.mailDraftSave` (returns `MailDraft`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftApprove` → procedure `integrations.mailDraftApprove` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftRemove` → procedure `integrations.mailDraftRemove` (returns `MailDraft`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCheckConnection` → procedure `integrations.mailCheckConnection` (returns `MailConnectionCheck`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareConnect` → procedure `integrations.mailCloudflareConnect` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareProvision` → procedure `integrations.mailCloudflareProvision` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareDisconnect` → procedure `integrations.mailCloudflareDisconnect` (returns `Boolean`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] query `telegramMessageLinkPreviews` → procedure `integrations.telegramMessageLinkPreviews` (returns `[TelegramLinkPreview!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramConversationChats` → procedure `integrations.telegramConversationChats` (returns `[TelegramConversationChat!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBots` → procedure `integrations.telegramBots` (returns `[TelegramBot!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBot` → procedure `integrations.telegramBot` (returns `TelegramBot!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramValidateToken` → procedure `integrations.telegramValidateToken` (returns `TelegramTokenValidation!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBotWebhookInfo` → procedure `integrations.telegramBotWebhookInfo` (returns `TelegramWebhookInfo!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] mutation `telegramUpdateBot` → procedure `integrations.telegramUpdateBot` (returns `TelegramBot!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:73`
- [ ] mutation `telegramDisconnectBot` → procedure `integrations.telegramDisconnectBot` (returns `Boolean!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:73`
- [ ] mutation `telegramAddBot` → procedure `integrations.telegramAddBot` (returns `TelegramBot!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:73`
- [ ] mutation `telegramSetWebhook` → procedure `integrations.telegramSetWebhook` (returns `Boolean!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:73`

### Pages

- [ ] `/frontline/config` (IntegrationsConfigRoute) `frontline_ui/src/modules/FrontlineSettings.tsx:45`

### Core calls

- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/call/graphql/resolvers/customResolvers/customer.ts:11`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/call/graphql/resolvers/queries.ts:69`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/call/logUtils.ts:7`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/integrations/call/logUtils.ts:37`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/integrations/call/services/cdrServices.ts:184`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/call/store.ts:81`
- [ ] core `customers.updateCustomer` → sdk `customers.update` (scope customers:write) `frontline_api/src/modules/integrations/call/store.ts:92`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/integrations/call/store.ts:108`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/integrations/callpro/controller.ts:159`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/integrations/callpro/graphql/resolvers/queries.ts:33`
- [ ] core `fields.fieldsCombinedByContentType` → plugin-owned `frontline_fields` `frontline_api/src/modules/integrations/facebook/fieldUtils.ts:60`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/integrations/facebook/handleFacebookMessage.ts:191`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/instagram/controller/store.ts:76`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/integrations/instagram/handleInstagramMessage.ts:176`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/mail/db/models/Customers.ts:46`
- [ ] core `customers.createCustomer` → sdk `customers.findOrCreate` (scope customers:write; by email or phone, else customers.create (state: 'lead')) `frontline_api/src/modules/integrations/mail/db/models/Customers.ts:58`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/integrations/mail/trpc/mail.ts:22`
- [ ] core `emailDeliveries.create` → plugin-owned `frontline_email_deliveries` (mail sent from the organisation's own mailbox is the plugin's to log) `frontline_api/src/modules/integrations/mail/utils/emailPorts.ts:13`
- [ ] core `emailDeliveries.recordHandoff` → plugin-owned `frontline_email_deliveries` `frontline_api/src/modules/integrations/mail/utils/emailPorts.ts:24`
- [ ] core `emailSuppression.blocked` → plugin-owned `frontline_email_suppressions` (bounces and opt-outs the plugin hears from its mailbox) `frontline_api/src/modules/integrations/mail/utils/emailPorts.ts:37`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/mail/utils/mailRecipient.ts:8`
- [ ] core `customers.findActiveCustomers` → sdk `customers.list` (scope customers:read) `frontline_api/src/modules/integrations/mail/utils/recipients.ts:55`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/mail/utils/tickets.ts:187`
- [ ] core `customers.findOne` → sdk `customers.get` (scope customers:read; by id only) `frontline_api/src/modules/integrations/telegram/controller/store.ts:44`

### Events

- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/discord/services/messages/inbound.ts:115`
- [ ] `sendAutomationDeferredCompletion` → plugin-owned `the action answers at once ({ queued: true, jobId })` (the plugin keeps the final result on its own job row, and on the timeline with activities.create) `frontline_api/src/modules/integrations/facebook/commentOutbox.ts:196`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/facebook/controller/store.ts:241`
- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/integrations/facebook/db/models/Bots.ts:374`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/integrations/facebook/graphql/resolvers/mutations.ts:106`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/integrations/facebook/handleFacebookMessage.ts:203`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/facebook/meta/automation/messages/inputWait.ts:153`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/facebook/meta/automation/utils/messageUtils.ts:165`
- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/integrations/healthNotification.ts:30`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/instagram/controller/store.ts:230`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/integrations/instagram/graphql/resolvers/mutations.ts:105`
- [ ] `sendNotifications` → sdk `notifications.create` (scope notifications:write) `frontline_api/src/modules/integrations/instagram/handleInstagramMessage.ts:185`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/instagram/meta/automation/utils/messageUtils.ts:59`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/mail/controller/receiveMessage.ts:353`
- [ ] `sendAutomationTrigger` → sdk `core_publish_event() in the same transaction` (declare the type in manifest.events; automations start from events) `frontline_api/src/modules/integrations/telegram/controller/receiveMessage.ts:117`

### Routes

- [ ] GET `/resetCallCookie` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:87`
- [ ] POST `/call/queueRealtimeUpdate` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:92`
- [ ] POST `/call/queueStatistics` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:121`
- [ ] POST `/call/cdrReceive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:154`
- [ ] POST `/call/event` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:173`
- [ ] POST `/call/receiveCall` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/call/initApp.ts:192`
- [ ] POST `/callpro/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/callpro/routes.ts:11`
- [ ] GET `/facebook/fblogin` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:12`
- [ ] GET `/facebook/kind/:kind/fblogin` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:13`
- [ ] GET `/facebook/get-post` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:15`
- [ ] GET `/facebook/get-status` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:27`
- [ ] GET `/facebook/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:39`
- [ ] POST `/facebook/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/facebook/routes.ts:51`
- [ ] GET `/instagram/iglogin` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/instagram/routes.ts:12`
- [ ] GET `/instagram/get-post` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/instagram/routes.ts:13`
- [ ] GET `/instagram/get-status` → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/instagram/routes.ts:14`
- [ ] GET `/instagram/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/instagram/routes.ts:15`
- [ ] POST `/instagram/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/instagram/routes.ts:16`
- [ ] POST `/mail/receive` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/mail/routes.ts:7`
- [ ] POST `/telegram/receive/:_id` (webhook) → plugin-owned `a route on the plugin API` (organisation from the path (an id or key the plugin issued) or, for one address shared by every organisation (Meta's webhook), a lookup table listed in tools/no-org-id.sql; verify the sender's signature first) `frontline_api/src/modules/integrations/telegram/routes.ts:8`

## knowledgebase

### Tables

- [ ] `frontline_knowledgebase_articles` from collection `knowledgebase_articles` (23 fields, draft `frontlineKnowledgebaseArticles` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/article.ts:13`
- [ ] `frontline_knowledgebase_categories` from collection `knowledgebase_categories` (11 fields, draft `frontlineKnowledgebaseCategories` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/category.ts:4`
- [ ] `frontline_knowledgebase_topics` from collection `knowledgebase_topics` (13 fields, draft `frontlineKnowledgebaseTopics` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/topic.ts:4`

### Procedures

- [ ] query `knowledgeBaseTopics` → procedure `knowledgebase.knowledgeBaseTopics` (returns `[KnowledgeBaseTopic]`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseTopicDetail` → procedure `knowledgebase.knowledgeBaseTopicDetail` (returns `KnowledgeBaseTopic`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseTopicsTotalCount` → procedure `knowledgebase.knowledgeBaseTopicsTotalCount` (returns `Int`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseCategories` → procedure `knowledgebase.knowledgeBaseCategories` (returns `[KnowledgeBaseCategory]`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseCategoryDetail` → procedure `knowledgebase.knowledgeBaseCategoryDetail` (returns `KnowledgeBaseCategory`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseCategoriesTotalCount` → procedure `knowledgebase.knowledgeBaseCategoriesTotalCount` (returns `Int`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseCategoriesGetLast` → procedure `knowledgebase.knowledgeBaseCategoriesGetLast` (returns `KnowledgeBaseCategory`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseArticles` → procedure `knowledgebase.knowledgeBaseArticles` (returns `[KnowledgeBaseArticle]`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseArticleDetail` → procedure `knowledgebase.knowledgeBaseArticleDetail` (returns `KnowledgeBaseArticle`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseArticleDetailAndIncViewCount` → procedure `knowledgebase.knowledgeBaseArticleDetailAndIncViewCount` (returns `KnowledgeBaseArticle`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseArticlesTotalCount` → procedure `knowledgebase.knowledgeBaseArticlesTotalCount` (returns `Int`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `cpKnowledgeBaseTopicDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] mutation `knowledgeBaseTopicsAdd` → procedure `knowledgebase.knowledgeBaseTopicsAdd` (returns `KnowledgeBaseTopic`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseTopicsEdit` → procedure `knowledgebase.knowledgeBaseTopicsEdit` (returns `KnowledgeBaseTopic`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseTopicsRemove` → procedure `knowledgebase.knowledgeBaseTopicsRemove` (returns `JSON`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseCategoriesAdd` → procedure `knowledgebase.knowledgeBaseCategoriesAdd` (returns `KnowledgeBaseCategory`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseCategoriesEdit` → procedure `knowledgebase.knowledgeBaseCategoriesEdit` (returns `KnowledgeBaseCategory`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseCategoriesRemove` → procedure `knowledgebase.knowledgeBaseCategoriesRemove` (returns `JSON`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseArticlesAdd` → procedure `knowledgebase.knowledgeBaseArticlesAdd` (returns `KnowledgeBaseArticle`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseArticlesEdit` → procedure `knowledgebase.knowledgeBaseArticlesEdit` (returns `KnowledgeBaseArticle`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseArticlesRemove` → procedure `knowledgebase.knowledgeBaseArticlesRemove` (returns `JSON`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseArticlesIncrementViewCount` → procedure `knowledgebase.knowledgeBaseArticlesIncrementViewCount` (returns `JSON`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`

### Pages

- [ ] `/frontline/knowledgebase/*` (KnowledgeBase) `frontline_ui/src/modules/FrontlineMain.tsx:159`

## pipelines

### Pages

- [ ] `/frontline/:id/pipelines` (ChannelPipelinesPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:185`
- [ ] `/frontline/:id/pipelines/:pipelineId/sla` (PipelineSlaPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:214`

## report

### Pages

- [ ] `/frontline/reports/*` (Report) `frontline_ui/src/modules/FrontlineMain.tsx:144`

## reports

### Tables

- [ ] `frontline_report_charts` from collection `frontline_report_charts` (7 fields, draft `frontlineReportCharts` in migration/schema-draft.ts) `frontline_api/src/modules/reports/db/definitions/chart.ts:45`
- [ ] `reportChartFiltersSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/reports/db/definitions/chart.ts:13`

### Procedures

- [ ] query `callReportIntegrations` → procedure `reports.callReportIntegrations` (returns `[CallReportIntegration!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetQueueStats` → procedure `reports.callGetQueueStats` (returns `[QueueStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetAgentStats` → procedure `reports.callGetAgentStats` (returns `[AgentStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `getCallbackStats` → procedure `reports.getCallbackStats` (returns `[CallbackStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callKpiScorecard` → procedure `reports.callKpiScorecard` (returns `CallKeyStatistics`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callVolumeSeries` → procedure `reports.callVolumeSeries` (returns `[CallVolumePoint]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCarrierBreakdown` → procedure `reports.callCarrierBreakdown` (returns `[CarrierSlice]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHeatmap` → procedure `reports.callHeatmap` (returns `[HeatCell]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHeatmapDaily` → procedure `reports.callHeatmapDaily` (returns `[CallDayHourCell]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callTopNumbers` → procedure `reports.callTopNumbers` (returns `[TopNumber]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callTodayStatistics` → procedure `reports.callTodayStatistics` (returns `CallKeyStatistics`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateServiceLevel` → procedure `reports.callCalculateServiceLevel` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateFirstCallResolution` → procedure `reports.callCalculateFirstCallResolution` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAbandonmentRate` → procedure `reports.callCalculateAbandonmentRate` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAverageSpeedOfAnswer` → procedure `reports.callCalculateAverageSpeedOfAnswer` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAverageHandlingTime` → procedure `reports.callCalculateAverageHandlingTime` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateOccupancyRate` → procedure `reports.callCalculateOccupancyRate` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetOperatorStats` → procedure `reports.callGetOperatorStats` (returns `[OperatorStat]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callSlaReport` → procedure `reports.callSlaReport` (returns `CallSlaReport!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHistoryList` → procedure `reports.callHistoryList` (returns `CallHistoryPage`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `reportCharts` → procedure `reports.reportCharts` (returns `[ReportChart]`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:52`
- [ ] query `reportChartDetail` → procedure `reports.reportChartDetail` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:52`
- [ ] mutation `reportChartAdd` → procedure `reports.reportChartAdd` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] mutation `reportChartEdit` → procedure `reports.reportChartEdit` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] mutation `reportChartRemove` → procedure `reports.reportChartRemove` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] query `reportFacebookPages` → procedure `reports.reportFacebookPages` (returns `[ReportFacebookPage]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookSummary` → procedure `reports.reportFacebookSummary` (returns `ReportFacebookSummary`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookActivity` → procedure `reports.reportFacebookActivity` (returns `[ReportFacebookActivityPoint]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookPosts` → procedure `reports.reportFacebookPosts` (returns `ReportFacebookPostResult`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookBots` → procedure `reports.reportFacebookBots` (returns `[ReportFacebookBot]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] mutation `reportFacebookSyncPostStats` → procedure `reports.reportFacebookSyncPostStats` (returns `ReportFacebookSyncResult`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:90`
- [ ] query `conversationProgressChart` → procedure `reports.conversationProgressChart` (returns `ConversationProgressChart`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationMemberProgress` → procedure `reports.conversationMemberProgress` (returns `[ConversationMemberProgress]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationSourceProgress` → procedure `reports.conversationSourceProgress` (returns `ConversationSourceProgress`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationTagProgress` → procedure `reports.conversationTagProgress` (returns `ConversationTagProgress`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationOpenDate` → procedure `reports.reportConversationOpenDate` (returns `[ConversationDateStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResolvedDate` → procedure `reports.reportConversationResolvedDate` (returns `[ConversationDateStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationList` → procedure `reports.reportConversationList` (returns `ConversationListResult`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResponses` → procedure `reports.reportConversationResponses` (returns `[ConversationUserMessageStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationOpen` → procedure `reports.reportConversationOpen` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationClosed` → procedure `reports.reportConversationClosed` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResolved` → procedure `reports.reportConversationResolved` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationTags` → procedure `reports.reportConversationTags` (returns `[ReportTag]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationSources` → procedure `reports.reportConversationSources` (returns `[ReportSource]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationExport` → procedure `reports.reportConversationExport` (returns `[ConversationExportItem]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportTicketSource` → procedure `reports.reportTicketSource` (returns `[ReportTicketSource]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketDate` → procedure `reports.reportTicketDate` (returns `[TicketDateStat]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketOpen` → procedure `reports.reportTicketOpen` (returns `ReportTicketMetric`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketList` → procedure `reports.reportTicketList` (returns `TicketListResult`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketTags` → procedure `reports.reportTicketTags` (returns `[ReportTicketTag]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketCustomProperties` → procedure `reports.reportTicketCustomProperties` (returns `[ReportTicketCustomProperty]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketTotalCount` → procedure `reports.reportTicketTotalCount` (returns `Int`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketStatusSummary` → procedure `reports.reportTicketStatusSummary` (returns `[ReportTicketStatusSummary]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketPriority` → procedure `reports.reportTicketPriority` (returns `[ReportTicketPriority]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketExport` → procedure `reports.reportTicketExport` (returns `[TicketExportItem]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`

### Core calls

- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/reports/graphql/resolvers/callQueries.ts:285`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/reports/graphql/resolvers/callQueries.ts:1011`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/reports/graphql/resolvers/callQueries.ts:1201`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/reports/graphql/resolvers/callQueries.ts:1225`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/reports/graphql/resolvers/inboxQueries.ts:496`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/reports/graphql/resolvers/inboxQueries.ts:572`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/reports/graphql/resolvers/inboxQueries.ts:583`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/reports/graphql/resolvers/inboxQueries.ts:597`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/reports/graphql/resolvers/ticketQueries.ts:126`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/reports/graphql/resolvers/ticketQueries.ts:277`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/reports/graphql/resolvers/ticketQueries.ts:535`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/reports/graphql/resolvers/ticketQueries.ts:641`
- [ ] core `<module>.find` → **gap**: not in migration/core-map.ts yet `frontline_api/src/modules/reports/graphql/resolvers/ticketQueries.ts:880`

## response

### Tables

- [ ] `frontline_response_templates` from collection `response_templates` (8 fields, draft `frontlineResponseTemplates` in migration/schema-draft.ts) `frontline_api/src/modules/response/db/definitions/responseTemplates.ts:6`

### Procedures

- [ ] query `responseTemplates` → procedure `response.responseTemplates` (returns `ResponseTemplateList`) `frontline_api/src/modules/response/graphql/schema.ts:29`
- [ ] query `responseTemplate` → procedure `response.responseTemplate` (returns `ResponseTemplate`) `frontline_api/src/modules/response/graphql/schema.ts:29`
- [ ] mutation `responseTemplatesAdd` → procedure `response.responseTemplatesAdd` (returns `ResponseTemplate`) `frontline_api/src/modules/response/graphql/schema.ts:38`
- [ ] mutation `responseTemplatesEdit` → procedure `response.responseTemplatesEdit` (returns `ResponseTemplate`) `frontline_api/src/modules/response/graphql/schema.ts:38`
- [ ] mutation `responseTemplatesRemove` → procedure `response.responseTemplatesRemove` (returns `ResponseTemplate`) `frontline_api/src/modules/response/graphql/schema.ts:38`

### Pages

- [ ] `/frontline/:id/response` (ChannelResponsePage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:219`
- [ ] `/frontline/:id/response/:responseId` (ResponseDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:223`

## settings

### Pages

- [ ] `/frontline/settings/*` (FrontlineSettingsLayout) `frontline_ui/src/modules/FrontlineMain.tsx:191`
- [ ] `/frontline/:topicId/kbsettings` (TopicSettingsPage) `frontline_ui/src/modules/knowledgebase/Main.tsx:35`

## status

### Pages

- [ ] `/frontline/:id/pipelines/:pipelineId/statuses` (TicketStatusesPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:194`

## survey

### Tables

- [ ] `frontline_surveys` from collection `frontline_surveys` (15 fields, draft `frontlineSurveys` in migration/schema-draft.ts) `frontline_api/src/modules/survey/db/definitions/surveys.ts:71`
- [ ] `frontline_survey_votes` from collection `frontline_survey_votes` (9 fields, draft `frontlineSurveyVotes` in migration/schema-draft.ts) `frontline_api/src/modules/survey/db/definitions/surveys.ts:106`

### Procedures

- [ ] query `surveyList` → procedure `survey.surveyList` (returns `SurveyListResponse`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `surveyDetail` → procedure `survey.surveyDetail` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `surveyTotalCount` → procedure `survey.surveyTotalCount` (returns `SurveyTotalCount`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveys` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyRequests` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyVotes` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] mutation `surveyAdd` → procedure `survey.surveyAdd` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyEdit` → procedure `survey.surveyEdit` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyRemove` → procedure `survey.surveyRemove` (returns `[String]`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyToggleStatus` → procedure `survey.surveyToggleStatus` (returns `Boolean`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveySendToConversation` → procedure `survey.surveySendToConversation` (returns `ConversationMessage`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveySubmit` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyAdd` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyEdit` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyRemove` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`

### Pages

- [ ] `/frontline/:id/surveys/create` (SurveyCreatePage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:235`
- [ ] `/frontline/:id/surveys/:surveyId` (SurveyDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:239`
- [ ] `/frontline/surveys` (SurveysView) `frontline_ui/src/modules/FrontlineMain.tsx:155`
- [ ] `/frontline/surveys` (Surveys) `frontline_ui/src/modules/FrontlineMain.tsx:156`
- [ ] `/frontline/surveys/create` (SurveyCreatePage) `frontline_ui/src/modules/FrontlineMain.tsx:157`

### Core calls

- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/customResolvers/survey.ts:24`
- [ ] core `customers.findOne` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:55`
- [ ] core `customers.getWidgetCustomer` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:78`
- [ ] core `customers.createMessengerCustomer` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:96`
- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/notifications.ts:37`
- [ ] core `cpNotifications.create` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/notifications.ts:51`

## ticket

### Tables

- [ ] `frontline_tickets_pipeline` from collection `frontline_tickets_pipeline` (24 fields, draft `frontlineTicketsPipeline` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `frontline_tickets_pipeline_status` from collection `frontline_tickets_pipeline_status` (14 fields, draft `frontlineTicketsPipelineStatus` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/status.ts:4`
- [ ] `frontline_tickets` from collection `frontline_tickets` (33 fields, draft `frontlineTickets` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`
- [ ] `frontline_ticket_activities` from collection `frontline_ticket_activities` (5 fields, draft `frontlineTicketActivities` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/activity.ts:26`
- [ ] `frontline_tickets_notes` from collection `frontline_tickets_notes` (8 fields, draft `frontlineTicketsNotes` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/note.ts:9`
- [ ] `frontline_ticket_configs` from collection `frontline_ticket_configs` (7 fields, draft `frontlineTicketConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/ticketConfig.ts:36`
- [ ] `ticketPipelineSchema.isCheckDepartment` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.isCheckBranch` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `statusSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/status.ts:4`
- [ ] `ticketSchema.branchId` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`
- [ ] `ticketSchema.departmentId` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`
- [ ] `ticketPipelineSchema.isCheckDepartment` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.isCheckBranch` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `statusSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/status.ts:9`

### Procedures

- [ ] query `getTicketActivities` → procedure `ticket.getTicketActivities` (returns `TicketActivityListResponse`) `frontline_api/src/modules/ticket/graphql/schemas/activity.ts:48`
- [ ] query `ticketGetNote` → procedure `ticket.ticketGetNote` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [ ] query `ticketGetNotes` → procedure `ticket.ticketGetNotes` (returns `[TicketNote]`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [ ] query `cpTicketGetNotes` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [ ] mutation `ticketCreateNote` → procedure `ticket.ticketCreateNote` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] mutation `ticketUpdateNote` → procedure `ticket.ticketUpdateNote` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] mutation `ticketDeleteNote` → procedure `ticket.ticketDeleteNote` (returns `JSON`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] mutation `cpTicketCreateNote` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] query `getTicketPipeline` → procedure `ticket.getTicketPipeline` (returns `Pipeline`) `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [ ] query `getTicketPipelines` → procedure `ticket.getTicketPipelines` (returns `PipelineListResponse`) `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [ ] query `cpGetTicketPipelines` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [ ] mutation `createPipeline` → procedure `ticket.createPipeline` (returns `Pipeline`) `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [ ] mutation `updatePipeline` → procedure `ticket.updatePipeline` (returns `Pipeline`) `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [ ] mutation `removePipeline` → procedure `ticket.removePipeline` (returns `JSON`) `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [ ] query `getTicketStatus` → procedure `ticket.getTicketStatus` (returns `TicketStatus`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] query `getAccessibleTicketStatuses` → procedure `ticket.getAccessibleTicketStatuses` (returns `[TicketStatusChoice!]!`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] query `getTicketStatusesChoicesPipeline` → procedure `ticket.getTicketStatusesChoicesPipeline` (returns `[TicketStatusChoice!]!`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] query `getTicketStatusesByType` → procedure `ticket.getTicketStatusesByType` (returns `[TicketStatus]`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] query `cpGetTicketStatus` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] mutation `addTicketStatus` → procedure `ticket.addTicketStatus` (returns `TicketStatus`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [ ] mutation `updateTicketStatus` → procedure `ticket.updateTicketStatus` (returns `TicketStatus`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [ ] mutation `deleteTicketStatus` → procedure `ticket.deleteTicketStatus` (returns `JSON`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [ ] query `getTicket` → procedure `ticket.getTicket` (returns `Ticket`) `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [ ] query `getTickets` → procedure `ticket.getTickets` (returns `TicketListResponse`) `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [ ] query `cpGetTickets` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [ ] query `cpGetTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [ ] query `cpGetTicketTotalCount` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [ ] mutation `createTicket` → procedure `ticket.createTicket` (returns `Ticket`) `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] mutation `updateTicket` → procedure `ticket.updateTicket` (returns `Ticket`) `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] mutation `removeTicket` → procedure `ticket.removeTicket` (returns `RemoveResponse!`) `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] mutation `cpCreateTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] mutation `cpUpdateTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] query `ticketConfigs` → procedure `ticket.ticketConfigs` (returns `[TicketConfig]`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
- [ ] query `ticketConfigDetail` → procedure `ticket.ticketConfigDetail` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
- [ ] query `ticketConfig` → procedure `ticket.ticketConfig` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
- [ ] mutation `ticketSaveConfig` → procedure `ticket.ticketSaveConfig` (returns `TicketConfig!`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:94`
- [ ] mutation `ticketRemoveConfig` → procedure `ticket.ticketRemoveConfig` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:94`

### Pages

- [ ] `/frontline/tickets` (Ticket) `frontline_ui/src/modules/FrontlineMain.tsx:125`
- [ ] `/frontline/tickets/:ticketId` (TicketDetail) `frontline_ui/src/modules/FrontlineMain.tsx:126`
- [ ] `/frontline/` (Ticket) `frontline_ui/src/modules/ticket-legacy/Main.tsx:14`
- [ ] `/frontline/` (Ticket) `frontline_ui/src/modules/ticket/Main.tsx:14`
- [ ] `/frontline/tickets` (Ticket) `frontline_ui/src/modules/ticket/Main.tsx:15`

### Core calls

- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/db/models/Ticket.ts:205`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/ticket/graphql/resolvers/customResolvers/pipeline.ts:11`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/ticket/graphql/resolvers/customResolvers/status.ts:24`
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/graphql/resolvers/mutations/ticket.ts:26`
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/ticket/meta/automations/actions/createTicketAction.ts:212`
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/meta/automations/actions/createTicketAction.ts:311`
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/ticket/meta/fields/fieldUtils.ts:253`
- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/utils/cpNotifications.ts:80`
- [ ] core `cpNotifications.create` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/utils/cpNotifications.ts:116`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/ticket/utils/nameAndNumber.ts:84`
- [ ] core `companies.find` → sdk `companies.list` (scope customers:read) `frontline_api/src/modules/ticket/utils/nameAndNumber.ts:100`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/ticket/utils/pipelineProperties.ts:15`
- [ ] core `branches.findOne` → plugin-owned `frontline_teams` (the plugin's departments and branches; members in frontline_team_members, names from users.list (users:read)) `frontline_api/src/modules/ticket/utils/slaCalendar.ts:26`
- [ ] core `<module>.findWithChild` → **gap**: not in migration/core-map.ts yet `frontline_api/src/modules/ticket/utils/teamMemberRestriction.ts:29`
- [ ] core `configs.getConfigs` → plugin-owned `frontline_settings` (country and currency: organizations.current (sdk)) `frontline_api/src/modules/ticket/utils/teamMemberRestriction.ts:50`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/ticket/utils/ticketConfig.ts:30`
- [ ] core `departments.findWithChild` → plugin-owned `frontline_teams` (the plugin's departments and branches; members in frontline_team_members, names from users.list (users:read)) `frontline_api/src/modules/ticket/utils/ticketVisibility.ts:107`

### Events

- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:165`
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:333`
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:386`
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:418`
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:461`
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:476`
