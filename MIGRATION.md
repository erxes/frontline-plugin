# Migrating frontline to the new core

From erxes/erxes `origin/main` (f2a56ac961), `frontline_api` and `frontline_ui`.
1038 items: 2 gaps and 49 drops. Follow `.agents/skills/plugin-migrate`: one module at a time,
tick an item once it works on the new core and its old bugs and workarounds are gone, tick a gap once filed, ending its line with `(filed <issue url>)`,
and tick a drop once its code is left out (segments, the client portal and brands are not migrated).

The old UI imports 145 symbols from `ui-modules` in 328 files; the host has no `ui-modules`, so each page rebuilds them from `erxes-ui` or `ui/src/shared`, and Plugin-wide's Shared UI section records which (members through its `SelectMember` and `MemberInline`, other records through `EntityPicker`). erxes-ui's own old-to-new component table is `packages/ui/MIGRATION.md` in erxes (branch `postgre`).
GraphQL types (337) are listed in `migration/inventory.json` for reference; procedures replace them.

## Plugin-wide

### Tables

- [ ] `frontline_teams` and `frontline_team_members` from old core's `departments`, `branches` and the members' `departmentIds` and `branchIds` (drafts in migration/schema-draft.ts, imported by scripts/import-mongo.ts): core has no departments or branches

### Pages

- [ ] `/frontline/erxes-messenger-preview` (ErxesMessengerPreview) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:159`
  - files: 47, 8 only here: `modules/integrations/erxes-messenger/components/EMPreviewChatInput.tsx`, `modules/integrations/erxes-messenger/components/EMPreviewIntro.tsx`, `modules/integrations/erxes-messenger/components/EMPreviewMessages.tsx`, `modules/integrations/erxes-messenger/components/EMPreviewTicketFlow.tsx`, `modules/integrations/erxes-messenger/components/EMPreviewWebsiteApp.tsx`, `modules/integrations/erxes-messenger/hooks/useEMIntegrationDetail.tsx`, `modules/integrations/erxes-messenger/states/emPreviewStates.ts`, `pages/ErxesMessengerPreview.tsx`
  - calls: inbox: `integrationDetail`, `integrationsCreateMessengerIntegration`, `integrationsEditMessengerIntegration`, `integrationsSaveMessengerAppearanceData`, `integrationsSaveMessengerConfigs`, `integrationsSaveMessengerTicketData`; knowledgebase: `knowledgeBaseArticleDetail`, `knowledgeBaseArticles`, `knowledgeBaseArticlesTotalCount`, `knowledgeBaseCategories`, `knowledgeBaseCategoriesTotalCount`, `knowledgeBaseCategoryDetail`, `knowledgeBaseTopicDetail`, `knowledgeBaseTopics`, `knowledgeBaseTopicsTotalCount`; ticket: `ticketConfigDetail`, `ticketConfigs`, `ticketRemoveConfig`, `ticketSaveConfig`
  - ui-modules: `MembersInline`, `SelectMember`, `useMembersInlineContext`, `useSidePanel`
  - keeps: useSidePanel · toast "failed-to-edit-messenger" · toast "Fill in the config step" · atomWithStorage "STORAGE_KEYS.SETUP_STEP" · atomWithStorage "settedIntegrationDetail" · atomWithStorage "STORAGE_KEYS.APPEARANCE" · atomWithStorage "STORAGE_KEYS.GREETING" · atomWithStorage "STORAGE_KEYS.INTRO" · atomWithStorage "STORAGE_KEYS.HOURS" · atomWithStorage "STORAGE_KEYS.SETTINGS" · atomWithStorage "STORAGE_KEYS.CONFIG" · usePanelFormDraft "{ form, recordKey, values: values ?? initial.current, drafts" · useConfirm · confirm "{ message: discardMessage }" · useQueryState "integrationId"
- [x] `/frontline/` (PageContainer) → `ui/src/channels/ChannelsLayout.tsx`, the header with the Channels › channel › Members breadcrumb `frontline_ui/src/modules/channels/components/settings/Settings.tsx:164`
- [ ] `/frontline/details/:id/:integrationType` (IntegrationDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:181`
  - files: 289, 5 only here: `modules/integrations/components/IntegrationRecordRow.tsx`, `modules/integrations/components/IntegrationsRecordTable.tsx`, `modules/integrations/discord/components/DiscordIntegrationDetail.tsx`, `pages/IntegrationDetailPage.tsx`, `widgets/automations/modules/facebook/components/bots/components/FacebookIntegrationBotCell.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `automations`, `automationsAiAgents`, `conversationClientMessageInserted`, `members`, `status`, `truncated`; inbox: `integrationDetail`, `integrations`, `integrationsArchive`, `integrationsCreateExternalIntegration`, `integrationsCreateMessengerIntegration`, `integrationsEditCommonFields`, `integrationsEditMessengerIntegration`, `integrationsGetUsedTypes`, `integrationsGetUsedTypesByChannel`, `integrationsRemove`, `integrationsRepair`, `integrationsSaveMessengerAppearanceData`, `integrationsSaveMessengerConfigs`, `integrationsSaveMessengerTicketData`; integrations: `callGetAgentStatus`, `callProConfig`, `callProCustomersByPhone`, `callProIntegrationDetail`, `callQueueInitialList`, `callsCustomerDetail`, `callsGetConfigs`, `callsIntegrationDetail`, `callUserIntegrations`, `discordBotChannels`, `discordBots`, `discordChannelMembers`, `discordConnectedServers`, `discordConversationChannel`, `discordConversationChannels`, `discordConversationParticipants`, `discordGuildChannels`, `discordGuilds`, `discordNamePresets`, `discordServers`, `discordTakenChannels`, `discordValidateToken`, `facebookGetAccounts`, `facebookGetBotPost`, `facebookGetBotPosts`, `facebookGetIntegrations`, `facebookGetPages`, `facebookMessengerAddBot`, `facebookMessengerBot`, `facebookMessengerBotCommentReplyStats`, `facebookMessengerBotDelivery`, `facebookMessengerBots`, `facebookMessengerBotsTotalCount`, `facebookMessengerRemoveBot`, `facebookMessengerRepairBot`, `facebookMessengerUpdateBot`, `facebookUpdateConfigs`, `instagramGetAccounts`, `instagramGetPages`, `instagramRepair`, `instagramUpdateConfigs`, `mailCheckConnection`, `mailDraftApprove`, `mailDraftRemove`, `mailDraftSave`, `mailMessageRetry`, `mailSendingReadiness`, `mailSendMail`, `mailSendReaction`, `telegramAddBot`, `telegramBots`, `telegramBotWebhookInfo`, `telegramConversationChats`, `telegramDisconnectBot`, `telegramSetWebhook`, `telegramUpdateBot`; knowledgebase: `knowledgeBaseArticleDetail`, `knowledgeBaseArticles`, `knowledgeBaseArticlesAdd`, `knowledgeBaseArticlesEdit`, `knowledgeBaseArticlesRemove`, `knowledgeBaseArticlesTotalCount`, `knowledgeBaseCategories`, `knowledgeBaseCategoriesAdd`, `knowledgeBaseCategoriesEdit`, `knowledgeBaseCategoriesRemove`, `knowledgeBaseCategoriesTotalCount`, `knowledgeBaseCategoryDetail`, `knowledgeBaseTopicDetail`, `knowledgeBaseTopics`, `knowledgeBaseTopicsAdd`, `knowledgeBaseTopicsEdit`, `knowledgeBaseTopicsRemove`, `knowledgeBaseTopicsTotalCount`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `ticketConfigDetail`, `ticketConfigs`, `ticketRemoveConfig`, `ticketSaveConfig`, `updateTicket`
  - ui-modules: `automationReturnLinkSearch`, `buildAutomationSeedLink`, `currentUserState`, `generateAutomationElementId`, `getSidePanelRecordPath`, `IField`, `PANEL_INPUT_CLASS_NAME`, `PanelFormLayout`, `PanelFormRow`, `RecordSidePanel`, `SelectBrand`, `SelectBrands`, `SelectMember`, `SelectTags`, `sidePanelDraftState`, `useFieldGroups`, `useFields`, `usePermissionCheck`, `useSidePanel`
  - keeps: toast "resources-moved-to-channel" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · useSidePanel · toast "something-went-wrong-getting-user-integrations" · atomWithStorage "config:call_integrations" · atomWithStorage "config:call_enabled_integrations" · atomWithStorage "callInfo" · useConfirm · confirm "{ message: isActive ? t('confirm-archive-integration', { nam" · confirm "confirm-delete-selected-integrations" · toast "integration-updated" · toast "repaired-successfully" · toast "Some channels were not connected. Retry to connect the remaining channels." · toast "please-try-again" · toast "Ticket config created" · toast "integration-added" · toast "failed-to-edit-messenger" · toast "Fill in the config step" · atomWithStorage "STORAGE_KEYS.SETUP_STEP" · atomWithStorage "settedIntegrationDetail" · atomWithStorage "STORAGE_KEYS.APPEARANCE" · atomWithStorage "STORAGE_KEYS.GREETING" · atomWithStorage "STORAGE_KEYS.INTRO" · atomWithStorage "STORAGE_KEYS.HOURS" · atomWithStorage "STORAGE_KEYS.SETTINGS" · atomWithStorage "STORAGE_KEYS.CONFIG" · toast "Allow popups and try connecting again." · toast "failed-to-add-integration" · usePanelFormDraft "{ form, recordKey, values: values ?? initial.current, drafts" · toast "Integration could not be saved. Please try again." · toast "please-allow-popups" · toast "authorization-cancelled" · toast "failed-to-remove-integration" · confirm "confirm-remove-integration" · toast "integration-removed" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: INTEGRATI" · toast "mail-integration-updated" · toast "copied" · toast "failed" · confirm "disconnectPrompt" · toast "disconnected" · useMultiQueryState "['searchValue', 'categoryId', 'status']" · toast "upload-failed" · usePanelFormDraft "{ form, recordKey, values: confirmedValues ?? values, drafts" · confirm "{ message: discardMessage }" · useQueryState "pipeline" · useQueryState "statusId" · toast "something-went-wrong" · useQueryState "aiReply" · useQueryState "botId" · useQueryState "facebookBotId" · toast "Save successful" · toast "Uh oh! Something went wrong."
- [x] `/frontline/:id/pipelines/:pipelineId` (PipelineLayoutPage) → `ui/src/pipelines/PipelineLayout.tsx` at `/frontline/settings/channels/:id/pipelines/:pipelineId`, the pipeline's name over General, Ticket statuses and SLA tabs. Decision: each tab is its own page with a link instead of a side panel record path, and each loads on first visit `frontline_ui/src/modules/channels/components/settings/Settings.tsx:189`
- [x] `/frontline/:id/pipelines/:pipelineId` (PipelineDetailPage) → `ui/src/pipelines/PipelineGeneralPage.tsx`, name, description, ticket number format with today's preview, and ticket name format, kept as a draft until saved. Decision: the attribution toast is gone, since the field trims what it saves; the mail section comes back with mail `frontline_ui/src/modules/channels/components/settings/Settings.tsx:193`
- [ ] `/frontline/:id/pipelines/:pipelineId/configs` (PipelineConfigsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:198`
  - files: 51, 8 only here: `modules/pipelines/components/configs/components/ConfigDetails.tsx`, `modules/pipelines/components/configs/components/ConfigList.tsx`, `modules/pipelines/components/configs/components/CreateConfig.tsx`, `modules/pipelines/components/configs/graphql/queries/getTicketConfigBetPipelineId.ts`, `modules/pipelines/components/configs/hooks/useGetTicketConfigByPipelineId.ts`, `modules/pipelines/components/configs/hooks/useRemoveTicketConfig.ts`, `modules/pipelines/components/configs/states.ts`, `pages/PipelineConfigsPage.tsx`
  - calls: ticket: `addTicketStatus`, `getAccessibleTicketStatuses`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `ticketConfig`, `ticketConfigDetail`, `ticketConfigs`, `ticketRemoveConfig`, `ticketSaveConfig`, `updateTicket`
  - ui-modules: `currentUserState`, `IField`, `SelectTags`, `useFieldGroups`, `useFields`, `usePermissionCheck`, `useSidePanel`
  - keeps: useSidePanel · useConfirm · confirm "Are you sure you want to remove this configuration?" · usePanelFormDraft "{ form: methods, recordKey: config?.id ?? `new~${channelId ?" · toast "Tickets config saved successfully" · confirm "This configuration has changed since you started editing. Replace the latest configuration with your draft?" · toast "Ticket config removed successfully" · confirm "{ message: discardMessage }" · useQueryState "statusId"
- [ ] `/frontline/:id/pipelines/:pipelineId/permissions` (PipelinePermissionsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:202`
  - files: 24, 6 only here: `modules/pipelines/components/permissions/components/PermissionRule.tsx`, `modules/pipelines/components/permissions/components/PipelinePermissionsList.tsx`, `modules/pipelines/components/permissions/components/PipelineVisibility.tsx`, `modules/pipelines/components/permissions/components/StatusPermissionControl.tsx`, `modules/pipelines/components/permissions/constant.ts`, `pages/PipelinePermissionsPage.tsx`
  - calls: ticket: `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `updatePipeline`, `updateTicketStatus`
  - ui-modules: `SelectMember`
  - keeps: toast "Pipeline updated successfully" · toast "Update failed: {{message}}"
- [ ] `/frontline/:id/pipelines/:pipelineId/properties` (PipelinePropertiesPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:206`
  - files: 13, 7 only here: `modules/pipelines/components/PipelineCreateFormLayout.tsx`, `modules/pipelines/components/TicketCreateFormChrome.tsx`, `modules/pipelines/components/TicketLayoutFieldsPanel.tsx`, `modules/pipelines/graphql/mutations/ticketFormFieldMutations.ts`, `modules/pipelines/graphql/queries/ticketSystemFieldRules.ts`, `modules/pipelines/hooks/useTicketLayoutFields.ts`, `pages/PipelinePropertiesPage.tsx`
  - calls: core: `fieldEdit`, `propertySystemFieldEdit`, `propertySystemFields`; ticket: `getTicketPipeline`, `updatePipeline`
  - ui-modules: `FIELD_TYPES`, `ILayoutAsideApi`, `ILayoutItem`, `LayoutEditor`, `PropertyAddSheet`, `useFields`
  - keeps: toast "Pipeline updated successfully"
- [ ] `/frontline/:id/pipelines/:pipelineId/mail` (PipelineMailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:210`
  - files: 49, 3 only here: `modules/integrations/mail/components/PipelineForwardVerification.tsx`, `modules/integrations/mail/components/PipelineMailSettings.tsx`, `pages/PipelineMailPage.tsx`
  - calls: inbox: `integrationDetail`, `integrationsCreateExternalIntegration`; integrations: `mailPipelineConnect`, `mailPipelineDisconnect`, `mailPipelineForwardVerified`, `mailPipelineIntegration`, `mailPipelineUpdate`, `mailSendingReadiness`; ticket: `addTicketStatus`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `updateTicket`
  - ui-modules: `currentUserState`, `SelectBrand`, `usePermissionCheck`, `useSidePanel`
  - keeps: useSidePanel · toast "integration-added" · toast "failed-to-add-integration" · usePanelFormDraft "{ form, recordKey, values: values ?? initial.current, drafts" · toast "copied" · usePanelFormDraft "{ form, recordKey, values, draftsState: pipelineMailPanelDra" · useConfirm · confirm "Mail sent to this address will stop opening tickets and the address is released. Mail already on tickets stays." · confirm "{ message: discardMessage }" · useQueryState "statusId"
- [ ] `/frontline/calls/dashboard` (CallDashboardIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:131`
  - files: 8, 1 only here: `pages/CallIndexPage.tsx`
  - calls: integrations: `callQueueList`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: atomWithStorage "config:call_integrations" · atomWithStorage "config:call_enabled_integrations" · atomWithStorage "callInfo"
- [ ] `/frontline/calls/dashboard/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:132`
  - files: 10, 4 only here: `modules/integrations/call/hooks/useCallDuration.ts`, `modules/integrations/call/hooks/useCallQueueInitialList.ts`, `modules/integrations/call/states/callStates.ts`, `pages/CallDetailPage.tsx`
  - calls: core: `callSessionUpdated`, `conversationMessageInserted`; integrations: `callGetAgentStatus`, `callQueueInitialList`, `callsCustomerDetail`, `callsGetConfigs`, `callsIntegrationDetail`, `callUserIntegrations`, `queueRealtimeUpdate`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: toast "something-went-wrong-getting-user-integrations" · atomWithStorage "callHistoryId" · useSubscription "QUEUE_REALTIME_UPDATE"
- [ ] `/frontline/calls/statistics` (CallStatisticsIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:136`
  - files: 8, 1 only here: `pages/CallStatisticsIndexPage.tsx`
  - calls: integrations: `callQueueList`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: atomWithStorage "config:call_integrations" · atomWithStorage "config:call_enabled_integrations" · atomWithStorage "callInfo"
- [ ] `/frontline/calls/statistics/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:137`
  - files: 10, 4 only here: `modules/integrations/call/hooks/useCallDuration.ts`, `modules/integrations/call/hooks/useCallQueueInitialList.ts`, `modules/integrations/call/states/callStates.ts`, `pages/CallDetailPage.tsx`
  - calls: core: `callSessionUpdated`, `conversationMessageInserted`; integrations: `callGetAgentStatus`, `callQueueInitialList`, `callsCustomerDetail`, `callsGetConfigs`, `callsIntegrationDetail`, `callUserIntegrations`, `queueRealtimeUpdate`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: toast "something-went-wrong-getting-user-integrations" · atomWithStorage "callHistoryId" · useSubscription "QUEUE_REALTIME_UPDATE"
- [ ] `/frontline/calls/:id` (CallDashboardDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:143`
  - files: 10, 4 only here: `modules/integrations/call/hooks/useCallDuration.ts`, `modules/integrations/call/hooks/useCallQueueInitialList.ts`, `modules/integrations/call/states/callStates.ts`, `pages/CallDetailPage.tsx`
  - calls: core: `callSessionUpdated`, `conversationMessageInserted`; integrations: `callGetAgentStatus`, `callQueueInitialList`, `callsCustomerDetail`, `callsGetConfigs`, `callsIntegrationDetail`, `callUserIntegrations`, `queueRealtimeUpdate`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: toast "something-went-wrong-getting-user-integrations" · atomWithStorage "callHistoryId" · useSubscription "QUEUE_REALTIME_UPDATE"
- [ ] `/frontline/*` (FrontlineAppRoutes) `frontline_ui/src/modules/FrontlineMain.tsx:206`
- [ ] `/frontline/personal-channel` (PageContainer) `frontline_ui/src/modules/FrontlineSettings.tsx:53`
- [ ] `/frontline/` (div) `frontline_ui/src/modules/integrations-config/Settings.tsx:22`
- [ ] `/frontline/` (IntegrationConfigPage) `frontline_ui/src/modules/integrations-config/Settings.tsx:40`
  - files: 32, 24 only here: `modules/integrations/call/components/CallConfigUpdate.tsx`, `modules/integrations/call/constants/callConfigSchema.ts`, `modules/integrations/call/graphql/mutations/callConfigMutations.ts`, `modules/integrations/call/hooks/useCallGetConfigs.ts`, `modules/integrations/call/hooks/useCallUpdateConfigs.ts`, `modules/integrations/components/SecretInput.tsx`, `modules/integrations/facebook/components/FacebookConfigUpdate.tsx`, `modules/integrations/facebook/constants/FbConfigSchema.ts`, `modules/integrations/facebook/graphql/queries/fbConfigQueries.ts`, `modules/integrations/facebook/hooks/useFacebookGetConfigs.tsx`, `modules/integrations/facebook/hooks/useFacebookUpdateConfigs.tsx`, `modules/integrations/instagram/components/InstagramConfigUpdate.tsx`, `modules/integrations/instagram/constants/IgConfigSchema.ts`, `modules/integrations/instagram/graphql/queries/igConfigQueries.ts`, `modules/integrations/instagram/hooks/useInstagramGetConfigs.tsx`, `modules/integrations/instagram/hooks/useInstagramUpdateConfigs.tsx`, `modules/integrations/mail/components/MailConfigUpdate.tsx`, `modules/integrations/mail/graphql/mutations/mailCloudflareMutations.ts`, `modules/integrations/mail/graphql/queries/mailCloudflareQueries.ts`, `modules/integrations/mail/hooks/useMailCloudflareConnection.tsx`, `modules/integrations/mail/hooks/useMailCloudflareSendingQuota.tsx`, `modules/integrations/mail/hooks/useMailCloudflareSetup.tsx`, `modules/integrations/telegram/TelegramConfig.tsx`, `pages/IntegrationConfigPage.tsx`
  - calls: inbox: `integrationsRepair`; integrations: `callGetAgentStatus`, `callQueueInitialList`, `callsCustomerDetail`, `callsGetConfigs`, `callsIntegrationDetail`, `callsUpdateConfigs`, `callUserIntegrations`, `facebookGetConfigs`, `facebookUpdateConfigs`, `instagramGetConfigs`, `instagramRepair`, `instagramUpdateConfigs`, `mailCloudflareConnect`, `mailCloudflareConnection`, `mailCloudflareDisconnect`, `mailCloudflareProvision`, `mailCloudflareSendingQuota`, `mailCloudflareZones`
  - ui-modules: `currentOrganizationState`
  - keeps: toast "call-configs-updated" · toast "something-went-wrong-getting-configs" · toast "secret-copied-to-clipboard" · toast "failed-to-copy-secret" · useConfirm · confirm "confirm-update-facebook-configs" · toast "facebook-configs-updated" · confirm "confirm-update-instagram-configs" · toast "cloudflare-connected" · confirm "confirm-disconnect-cloudflare" · toast "cloudflare-disconnected"
- [x] `/frontline/` (TopicsPage) → `ui/src/knowledgebase/TopicsPage.tsx` at `/frontline/knowledgebase`, which opens the first topic's articles or offers Create Topic. Decision: `?topic=new` opens the new topic panel and `?createTopic=true` still maps to it; the sidebar width stays under `frontline:kb-sidebar-width`. `frontline_ui/src/modules/knowledgebase/Main.tsx:31`
- [x] `/frontline/:topicId/articles` (ArticlesPage) → `ui/src/knowledgebase/ArticlesPage.tsx` at `/frontline/knowledgebase/:topicId/articles`, with search, status and category filters in the query string, paging, bulk status, move and delete. Decision: title and summary are edited in the side panel instead of in their cells; status and category stay editable in the row. `frontline_ui/src/modules/knowledgebase/Main.tsx:33`
- [x] `/frontline/:topicId/categories` (CategoriesPage) → `ui/src/knowledgebase/CategoriesPage.tsx` at `/frontline/knowledgebase/:topicId/categories`, the category tree with article counts that link to the filtered articles; a search lists matches flat. `frontline_ui/src/modules/knowledgebase/Main.tsx:34`

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
- [x] `frontline_api/src/modules/knowledgebase/utils/scheduledPublish.ts` (createMQWorkerWithListeners) → no job: every article read first publishes the scheduled articles whose time has passed, so a lost queue job can't leave one unpublished
- [ ] `frontline_api/src/modules/ticket/utils/slaWorker.ts` (createMQWorkerWithListeners, path) → plugin-owned: a job in the API process
  - note: waits for notifications; tickets keep their SLA due and met times, which the job will read

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
- [x] permission `showChannels` (channel) → `frontline.channel.view` `frontline_api/src/meta/permissions.ts:68`
- [x] permission `showAllChannels` (channel) → `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:74`
- [x] permission `channelAdd` (channel) → `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:79`
- [x] permission `channelUpdate` (channel) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:84`
- [x] permission `channelRemove` (channel) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:89`
- [x] permission `channelManageMembers` (channel) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:94`
- [ ] permission `showIntegrations` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:108`
- [ ] permission `integrationsAdd` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:114`
- [ ] permission `integrationsEdit` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:119`
- [ ] permission `integrationsRemove` (integration) → sdk `manifest.permissions` (frontline.<record>.<verb>; own/team/all reach stays in the plugin) `frontline_api/src/meta/permissions.ts:124`
- [x] permission `showTickets` (ticket) → `frontline.channel.view` and membership of the ticket's channel `frontline_api/src/meta/permissions.ts:142`
- [x] permission `createTicket` (ticket) → `frontline.channel.view` and membership of the channel. Decision: a ticket follows its channel, like its pipeline, so no separate grant `frontline_api/src/meta/permissions.ts:148`
- [x] permission `updateTicket` (ticket) → `frontline.channel.view` and membership of the channel `frontline_api/src/meta/permissions.ts:153`
- [x] permission `removeTicket` (ticket) → channel admins, or `frontline.channel.manage`. Decision: members archive and admins delete `frontline_api/src/meta/permissions.ts:158`
- [x] permission `ticketStatusesManage` (ticket) → channel admins, or `frontline.channel.manage`. Decision: the old grant ignored the channel; a pipeline and its statuses now follow their channel's rights `frontline_api/src/meta/permissions.ts:163`
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
- [x] permission `showResponseTemplates` (responseTemplate) → `frontline.channel.view`, for the template's channel members. Decision: a template belongs to a channel, so the channel's rights decide, with no grant of its own. `frontline_api/src/meta/permissions.ts:296`
- [x] permission `responseTemplatesAdd` (responseTemplate) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:302`
- [x] permission `responseTemplatesEdit` (responseTemplate) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:307`
- [x] permission `responseTemplatesRemove` (responseTemplate) → channel admins, or `frontline.channel.manage` `frontline_api/src/meta/permissions.ts:312`
- [x] permission `showKnowledgeBase` (knowledgeBase) → `frontline.knowledgebase.view`, which every knowledge base read needs `frontline_api/src/meta/permissions.ts:326`
- [x] permission `knowledgeBaseTopicsManage` (knowledgeBase) → `frontline.knowledgebase_topic.manage` `frontline_api/src/meta/permissions.ts:332`
- [x] permission `knowledgeBaseCategoriesManage` (knowledgeBase) → `frontline.knowledgebase_category.manage` `frontline_api/src/meta/permissions.ts:337`
- [x] permission `knowledgeBaseArticlesManage` (knowledgeBase) → `frontline.knowledgebase_article.manage` `frontline_api/src/meta/permissions.ts:342`
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
  - note: waits for automations
- [ ] automation trigger `Ticket status changed` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:159`
  - note: waits for automations
- [ ] automation trigger `Ticket SLA` → sdk `manifest.events` (published with core_publish_event()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:173`
  - note: waits for automations
- [ ] automation action `Create ticket` → sdk `manifest.actions` (POST <api>/automations/actions/<type>, verifyCoreCall()) `frontline_api/src/modules/ticket/meta/automations/ticketAutomationsConstants.ts:189`
  - note: waits for automations
- [x] segment `tickets` → **drop**: the new core has no segments; the plugin filters its own records `frontline_api/src/modules/ticket/meta/segments/configs.ts:13`
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

### Shared UI

- [ ] `useSidePanel` (68 files)
- [ ] `currentUserState` (30 files)
- [ ] `MembersInline` (23 files)
- [ ] `generateAutomationElementId` (19 files)
- [ ] `useAutomationRemoteFormSubmit` (18 files)
- [ ] `AutomationTriggerFormProps` (17 files)
- [ ] `CustomersInline` (17 files)
- [ ] `SelectMember` (16 files)
- [ ] `useFormValidationErrorHandler` (15 files)
- [ ] `splitAutomationNodeType` (14 files)
- [ ] `AutomationActionFormProps` (13 files)
- [ ] `IRecordPanelProps` (12 files)
- [ ] `PageHeader` (12 files)
- [ ] `PanelFormRow` (11 files)
- [ ] `AutomationRemoteEntryProps` (10 files)
- [ ] `AutomationRemoteEntryTypes` (10 files)
- [ ] `createFavoriteBreadcrumb` (10 files)
- [ ] `ActivityLogs` (9 files)
- [ ] `AutomationRemoteEntryWrapper` (9 files)
- [ ] `PanelFormLayout` (9 files)
- [ ] `RecordSidePanel` (9 files)
- [ ] `SelectBrand` (9 files)
- [ ] `getSidePanelRecordPath` (8 files)
- [ ] `IUser` (8 files)
- [ ] `SelectTags` (8 files)
- [ ] `AutomationActionNodeConfigProps` (7 files)
- [ ] `AutomationTriggerConfigProps` (7 files)
- [ ] `IField` (7 files)
- [ ] `useFields` (7 files)
- [ ] `AutomationNodeMetaInfoRow` (6 files)
- [ ] `buildAutomationSeedLink` (6 files)
- [ ] `useSidePanelDraft` (6 files)
- [ ] `AutomationExecutionHistoryNameProps` (5 files)
- [ ] `Can` (5 files)
- [ ] `PANEL_INPUT_CLASS_NAME` (5 files)
- [ ] `PlaceholderInput` (5 files)
- [ ] `TNotification` (5 files)
- [ ] `useUsers` (5 files)
- [ ] `AutomationExecutionActionResultProps` (4 files)
- [ ] `useSelectMemberContext` (4 files)
- [ ] `Export` (3 files)
- [ ] `IContactWidgetProps` (3 files)
- [ ] `IRelationWidgetProps` (3 files)
- [ ] `SelectBrands` (3 files)
- [ ] `sidePanelDraftState` (3 files)
- [ ] `TagsSelect` (3 files)
- [ ] `TAutomationAction` (3 files)
- [ ] `TDashboardWidgetConfig` (3 files)
- [ ] `usePermissionCheck` (3 files)
- [ ] `AssignMemberInEditor` (2 files)
- [ ] `AUTOMATION_UNARY_OPERATORS` (2 files)
- [ ] `AutomationAiKnowledgeSourceSelectorProps` (2 files)
- [ ] `automationReturnLinkSearch` (2 files)
- [ ] `AutomationTemplateRequirementProps` (2 files)
- [ ] `CompaniesInline` (2 files)
- [ ] `ContactWidgetSection` (2 files)
- [ ] `DashboardWidgetEmptyState` (2 files)
- [ ] `EditorMentionItem` (2 files)
- [ ] `EmailTemplate` (2 files)
- [ ] `FIELD_TYPES` (2 files)
- [ ] `getHostContacts` (2 files)
- [ ] `ICustomer` (2 files)
- [ ] `ICustomerInline` (2 files)
- [ ] `NEW_RECORD_ID` (2 files)
- [ ] `SelectBranches` (2 files)
- [ ] `SelectDepartments` (2 files)
- [ ] `SettingsHeader` (2 files)
- [ ] `TagBadge` (2 files)
- [ ] `TPlaceholderInputSuggestion` (2 files)
- [ ] `useComposeEmail` (2 files)
- [ ] `useCustomers` (2 files)
- [ ] `useFieldGroups` (2 files)
- [ ] `ActionResult` (1 files)
- [ ] `ActiveExports` (1 files)
- [ ] `AUTOMATION_CONDITION_OPERATORS` (1 files)
- [ ] `AutomationConditionalField` (1 files)
- [ ] `BranchesInline` (1 files)
- [ ] `CardDetailBadgeItem` (1 files)
- [ ] `CardDetailBadges` (1 files)
- [ ] `ContactRecordChip` (1 files)
- [ ] `ContactWidgetRow` (1 files)
- [ ] `currentOrganizationState` (1 files)
- [ ] `DashboardWidgetCard` (1 files)
- [ ] `DashboardWidgetListSkeleton` (1 files)
- [ ] `DataExtensionCreateFields` (1 files)
- [ ] `DataExtensionRecordSection` (1 files)
- [ ] `DepartmentsInline` (1 files)
- [ ] `EmailTemplatePicker` (1 files)
- [ ] `ExportFieldSelection` (1 files)
- [ ] `FieldsInDetail` (1 files)
- [ ] `FieldsInGroup` (1 files)
- [ ] `formatFieldValue` (1 files)
- [ ] `getRelationWidgetLabel` (1 files)
- [ ] `hasFieldValue` (1 files)
- [ ] `IAutomationHistoryAction` (1 files)
- [ ] `IDashboardWidgetProps` (1 files)
- [ ] `IFieldMutation` (1 files)
- [ ] `ILayoutAsideApi` (1 files)
- [ ] `ILayoutItem` (1 files)
- [ ] `Import` (1 files)
- [ ] `InternalNoteDisplay` (1 files)
- [ ] `IOpenRecordOptions` (1 files)
- [ ] `isFieldVisibleByLogic` (1 files)
- [ ] `ISidePanelDraft` (1 files)
- [ ] `ISystemFieldRules` (1 files)
- [ ] `ITag` (1 files)
- [ ] `LayoutEditor` (1 files)
- [ ] `MentionInEditor` (1 files)
- [ ] `MultipleFieldsInGroup` (1 files)
- [ ] `mutateFunction` (1 files)
- [ ] `PageHeaderStart` (1 files)
- [ ] `PanelDescriptionField` (1 files)
- [ ] `PanelField` (1 files)
- [ ] `PluginSettingsRoutes` (1 files)
- [ ] `PluginSharedSettingsNavigation` (1 files)
- [ ] `PropertiesFilter` (1 files)
- [ ] `PropertyAddSheet` (1 files)
- [ ] `PropertyFormField` (1 files)
- [ ] `PropertyGroupCard` (1 files)
- [ ] `PropertyGroupShell` (1 files)
- [ ] `RelationWidgetEmptyState` (1 files)
- [ ] `RelationWidgetList` (1 files)
- [ ] `SegmentsFilter` (1 files)
- [ ] `SelectCompany` (1 files)
- [ ] `SelectCustomer` (1 files)
- [ ] `TAutomationOptionalConnect` (1 files)
- [ ] `TAutomationTrigger` (1 files)
- [ ] `TEMPLATE_REQUIREMENT_CARD_LIMIT` (1 files)
- [ ] `TemplateRequirementOptions` (1 files)
- [ ] `TOnboardingStepItem` (1 files)
- [ ] `TPlaceholderInputSuggestionsOption` (1 files)
- [ ] `TPlaceholderInputSuggestionType` (1 files)
- [ ] `TVideoTabItem` (1 files)
- [ ] `useAutomationOptionalConnect` (1 files)
- [ ] `useBrands` (1 files)
- [ ] `useBrandsAdd` (1 files)
- [ ] `useExport` (1 files)
- [ ] `useGetTags` (1 files)
- [ ] `useMembersInlineContext` (1 files)
- [ ] `useRelationWidget` (1 files)
- [ ] `useRenderEmailTemplate` (1 files)
- [ ] `useSystemFieldRules` (1 files)
- [ ] `useTags` (1 files)
- [ ] `useTemplateRequirementOptions` (1 files)
- [ ] `WelcomeNotificationContentLayout` (1 files)

## channel

### Tables

- [x] `frontline_channels` from collection `channels` (11 fields, draft `frontlineChannels` in migration/schema-draft.ts) `frontline_api/src/modules/channel/db/definitions/channel.ts:6`. `memberIds` repeated the members table and the counts go stale, so both are gone; `icon` holds a Tabler icon name from erxes-ui's IconPicker; `scope` waits for the personal mailbox.
- [x] `frontline_channel_members` from collection `channel_members` (5 fields, draft `frontlineChannelMembers` in migration/schema-draft.ts) `frontline_api/src/modules/channel/db/definitions/channel.ts:53`. Roles are admin and member; the old `lead` (add members only) folds into admin, and a role check keeps one admin per channel.

### Procedures

- [x] query `getChannel` → `channels.get`, with its members `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [x] query `getChannels` → `channels.list` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [x] query `getMyChannels` → `channels.list` (a member sees their own; `frontline.channel.manage` sees all) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [ ] query `getPersonalChannel` → procedure `personalChannels.get` (returns `Channel`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [x] query `getChannelMembers` → `channels.get` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:51`
- [x] mutation `channelAdd` → `channels.create` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelUpdate` → `channels.update` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelRemove` → `channels.remove` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelAddMembers` → `channels.addMembers` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelRemoveMember` → `channels.removeMembers` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelRemoveMembers` → `channels.removeMembers`, refused when it would leave no admin `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [x] mutation `channelUpdateMember` → `channels.setRole` `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`
- [ ] mutation `channelMoveResources` → procedure `channel.channelMoveResources` (returns `ChannelMoveResourcesResult`) `frontline_api/src/modules/channel/graphql/schemas/channel.ts:59`

### Pages

- [x] `/frontline/:id` (ChannelDetailsPage) → `ui/src/channels/ChannelPage.tsx` at `/frontline/settings/channels/:id`. Decision: the forms, surveys and integrations sections come back with those modules; the pipelines card shows how many the channel has. `frontline_ui/src/modules/channels/components/settings/Settings.tsx:173`
- [x] `/frontline/:id/members` (ChannelMembersPage) → `ui/src/channels/ChannelMembersPage.tsx`. Decision: the role select offers admin and member, since `lead` folds into admin. `frontline_ui/src/modules/channels/components/settings/Settings.tsx:177`
- [ ] `/frontline/:id/forms` (ChannelFormsPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:227`
  - files: 84, 5 only here: `modules/channels/components/settings/channel-details/ChannelFormsSubHeader.tsx`, `modules/forms/components/actions/download-responses.tsx`, `modules/forms/components/actions/toggle-form.tsx`, `modules/forms/components/FormsList.tsx`, `pages/FormsPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`, `frontlineFormFieldConversionCheck`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `ActiveExports`, `Can`, `ExportFieldSelection`, `MembersInline`, `RecordSidePanel`, `SelectTags`, `useExport`
  - keeps: toast "resources-moved-to-channel" · useMultiQueryState "['tagId', 'status', 'searchValue']" · useQueryState "queryKey" · toast "Please try again" · useConfirm · toast "Form ID is missing" · confirm "{ message: title ? t( 'confirm-delete-form-title', 'Are you " · toast "Form deleted successfully" · confirm "confirm-delete-forms" · toast "forms-deleted" · confirm "confirm-change-forms-status" · toast "forms-status-changed" · useQueryState "status" · confirm "leave-unsaved-title" · useMultiQueryState "['searchValue', 'status', 'tagId']" · fetchMore "{ variables: { page }, updateQuery: (previous, { fetchMoreRe" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: FORMS_PER" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'"

### Events

- [ ] `sendNotification` → sdk `notifications.create` (scope notifications:write; kind in manifest.notificationKinds) `frontline_api/src/modules/channel/graphql/resolvers/mutations/channel.ts:77`

## channels

### Pages

- [x] `/frontline/` (ChannelsSettingsIndexPage) → `ui/src/channels/ChannelsPage.tsx` at `/frontline/settings/channels`, where `/frontline` redirects. Decision: the pipelines, forms, templates and integrations columns come back with those modules. `frontline_ui/src/modules/channels/components/settings/Settings.tsx:172`
- [ ] `/frontline/:id/surveys` (ChannelSurveysPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:231`
  - files: 40, 1 only here: `pages/ChannelSurveysPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `conversationsTotalCount`, `integrations`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`
  - keeps: toast "resources-moved-to-channel" · useQueryState "status" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · useConfirm · confirm "confirm-delete-surveys" · toast "Survey removed" · toast "Survey approved" · confirm "confirm-delete-survey-title" · useMultiQueryState "['status', 'searchValue']" · toast "Survey rejected" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.BAC" · atomWithStorage "surveyView"
- [x] `/frontline/channels/*` (ChannelsSettings) → the `settings/channels` routes in `ui/src/Frontline.tsx` `frontline_ui/src/modules/FrontlineSettings.tsx:49`

## customdomain

### Procedures

- [ ] query `frontlineCustomDomain` → procedure `frontlineCustomDomains.get` (returns `FrontlineCustomDomain`) `frontline_api/src/modules/customdomain/graphql/schemas/customDomain.ts:23`
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

- [ ] query `frontlineFields` → procedure `frontlineFields.list` (returns `FrontlineFieldListResponse`) `frontline_api/src/modules/form/graphql/schema/field.ts:167`
- [ ] query `frontlineFormFieldConversionCheck` → procedure `frontlineFormFieldConversionChecks.get` (returns `FrontlineFormConversionCheck!`) `frontline_api/src/modules/form/graphql/schema/field.ts:167`
- [ ] mutation `frontlineFieldsBulkAction` → procedure `form.frontlineFieldsBulkAction` (returns `[FrontlineField]`) `frontline_api/src/modules/form/graphql/schema/field.ts:172`
- [ ] query `formDetail` → procedure `forms.get` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `forms` → procedure `forms.list` (returns `FormListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formsMain` → procedure `formsMains.get` (returns `FormListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formsTotalCount` → procedure `forms.list` (returns `FormsTotalCount`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formSubmissions` → procedure `formSubmissions.list` (returns `SubmissionListResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `formSubmissionDetail` → procedure `formSubmissions.get` (returns `Submission`) `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `cpForms` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] query `cpFormDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:175`
- [ ] mutation `formsAdd` → procedure `forms.create` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsEdit` → procedure `forms.update` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsRemove` → procedure `forms.remove` (returns `[String]`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsToggleStatus` → procedure `form.formsToggleStatus` (returns `Boolean`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formsDuplicate` → procedure `form.formsDuplicate` (returns `Form`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsSave` → procedure `form.formSubmissionsSave` (returns `Boolean`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsRemove` → procedure `formSubmissions.remove` (returns `JSON`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `formSubmissionsEdit` → procedure `formSubmissions.update` (returns `Submission`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `widgetsLeadConnect` → procedure `form.widgetsLeadConnect` (returns `FormConnectResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `widgetsSaveLead` → procedure `form.widgetsSaveLead` (returns `SaveFormResponse`) `frontline_api/src/modules/form/graphql/schema/form.ts:188`
- [ ] mutation `cpWidgetsSaveLead` → **drop**: the new core has no client portal `frontline_api/src/modules/form/graphql/schema/form.ts:188`

### Pages

- [ ] `/frontline/:id/forms/create` (FormCreatePage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:243`
  - files: 61, 2 only here: `modules/forms/components/FormCreate.tsx`, `pages/FormCreatePage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`, `frontlineFormFieldConversionCheck`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `RecordSidePanel`
  - keeps: useConfirm · confirm "leave-unsaved-title" · fetchMore "{ variables: { page }, updateQuery: (previous, { fetchMoreRe" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/:id/forms/:formId` (FormDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:247`
  - files: 61, 0 only here
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`, `frontlineFormFieldConversionCheck`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `RecordSidePanel`
  - keeps: useConfirm · confirm "leave-unsaved-title" · fetchMore "{ variables: { page }, updateQuery: (previous, { fetchMoreRe" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/forms/create` (FormCreatePage) `frontline_ui/src/modules/FrontlineMain.tsx:147`
  - files: 61, 2 only here: `modules/forms/components/FormCreate.tsx`, `pages/FormCreatePage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`, `frontlineFormFieldConversionCheck`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `RecordSidePanel`
  - keeps: useConfirm · confirm "leave-unsaved-title" · fetchMore "{ variables: { page }, updateQuery: (previous, { fetchMoreRe" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/forms/:formId` (FormDetailPage) `frontline_ui/src/modules/FrontlineMain.tsx:148`
  - files: 61, 0 only here
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`, `frontlineFormFieldConversionCheck`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `RecordSidePanel`
  - keeps: useConfirm · confirm "leave-unsaved-title" · fetchMore "{ variables: { page }, updateQuery: (previous, { fetchMoreRe" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/forms/preview` (FormPreviewPage) `frontline_ui/src/modules/FrontlineMain.tsx:154`
  - files: 13, 2 only here: `modules/forms/components/FormPreview.tsx`, `pages/FormPreviewPage.tsx`
  - calls: channel: `getMyChannels`; form: `formDetail`, `forms`, `formsTotalCount`
  - keeps: toast "Form submitted successfully" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "draft" · useQueryState "formId"
- [ ] `/frontline/:`/forms${FrontlinePaths.FormPreview`}` (FormPreviewPage) `frontline_ui/src/modules/FrontlineSettings.tsx:62`
  - files: 13, 2 only here: `modules/forms/components/FormPreview.tsx`, `pages/FormPreviewPage.tsx`
  - calls: channel: `getMyChannels`; form: `formDetail`, `forms`, `formsTotalCount`
  - keeps: toast "Form submitted successfully" · atomWithStorage "`frontline-form:${scope}:${name}`" · useQueryState "draft" · useQueryState "formId"

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
  - files: 21, 13 only here: `modules/forms/components/submissions/components/form-submissions.tsx`, `modules/forms/components/submissions/components/submission-details.tsx`, `modules/forms/components/submissions/components/submissions-filter.tsx`, `modules/forms/components/submissions/components/submissions-sub-header.tsx`, `modules/forms/components/submissions/components/submissions-table.tsx`, `modules/forms/components/submissions/components/submissions-total-count.tsx`, `modules/forms/components/submissions/graphql/queries.ts`, `modules/forms/components/submissions/hooks/useGetFormSubmissionDetails.ts`, `modules/forms/components/submissions/hooks/useGetFormSubmissions.ts`, `modules/forms/components/submissions/hooks/useSubmissionDetailsForm.ts`, `modules/forms/components/submissions/schema.ts`, `modules/forms/components/submissions/types.ts`, `pages/FormSubmissionsPage.tsx`
  - calls: channel: `getMyChannels`; form: `formDetail`, `forms`, `formsTotalCount`, `formSubmissionDetail`, `formSubmissions`
  - ui-modules: `ActivityLogs`, `Can`, `Export`, `getSidePanelRecordPath`, `IRecordPanelProps`, `useSidePanel`
  - keeps: toast "Please try again" · useSidePanel · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: SUBMISSIO"
- [ ] `/frontline/forms` (FormsView) `frontline_ui/src/modules/FrontlineMain.tsx:145`
  - files: 32, 2 only here: `modules/forms/components/form-page/FormPageHeader.tsx`, `modules/forms/components/form-page/FormView.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsTotalCount`; inbox: `integrations`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
  - keeps: useQueryState "channelId" · useQueryState "status" · useMultiQueryState "['tagId', 'status', 'searchValue', 'channelId']" · useMultiQueryState "['channelId', 'tagId', 'status', 'searchValue']" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: FORMS_PER" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/forms` (Forms) `frontline_ui/src/modules/FrontlineMain.tsx:146`
  - files: 48, 3 only here: `modules/forms/components/form-page/form-columns.tsx`, `modules/forms/components/form-page/FormPageList.tsx`, `pages/FormsIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; form: `formDetail`, `forms`, `formsAdd`, `formsEdit`, `formsRemove`, `formsToggleStatus`, `formsTotalCount`, `frontlineFieldsBulkAction`; inbox: `integrations`, `integrationsCreateLeadIntegration`
  - ui-modules: `MembersInline`, `SelectTags`
  - keeps: toast "resources-moved-to-channel" · toast "Please try again" · useConfirm · toast "Form ID is missing" · confirm "{ message: title ? t( 'confirm-delete-form-title', 'Are you " · toast "Form deleted successfully" · confirm "confirm-delete-forms" · toast "forms-deleted" · confirm "confirm-change-forms-status" · toast "forms-status-changed" · useQueryState "channelId" · useQueryState "status" · toast "Form updated successfully" · useMultiQueryState "['tagId', 'status', 'searchValue', 'channelId']" · useMultiQueryState "['channelId', 'tagId', 'status', 'searchValue']" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: FORMS_PER" · useQueryState "queryKey || 'channelId'"
- [ ] `/frontline/forms/submissions/:formId` (FormSubmissionIndexPage) `frontline_ui/src/modules/FrontlineMain.tsx:149`
  - files: 21, 13 only here: `modules/forms/components/submissions/components/form-submissions.tsx`, `modules/forms/components/submissions/components/submission-details.tsx`, `modules/forms/components/submissions/components/submissions-filter.tsx`, `modules/forms/components/submissions/components/submissions-sub-header.tsx`, `modules/forms/components/submissions/components/submissions-table.tsx`, `modules/forms/components/submissions/components/submissions-total-count.tsx`, `modules/forms/components/submissions/graphql/queries.ts`, `modules/forms/components/submissions/hooks/useGetFormSubmissionDetails.ts`, `modules/forms/components/submissions/hooks/useGetFormSubmissions.ts`, `modules/forms/components/submissions/hooks/useSubmissionDetailsForm.ts`, `modules/forms/components/submissions/schema.ts`, `modules/forms/components/submissions/types.ts`, `pages/FormSubmissionsPage.tsx`
  - calls: channel: `getMyChannels`; form: `formDetail`, `forms`, `formsTotalCount`, `formSubmissionDetail`, `formSubmissions`
  - ui-modules: `ActivityLogs`, `Can`, `Export`, `getSidePanelRecordPath`, `IRecordPanelProps`, `useSidePanel`
  - keeps: toast "Please try again" · useSidePanel · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: SUBMISSIO"

## helpcenter

### Tables

- [ ] `frontline_help_center_configs` from collection `frontline_help_center_configs` (28 fields, draft `frontlineHelpCenterConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/helpcenter/db/definitions/helpCenterConfig.ts:78`

### Procedures

- [ ] query `helpCenterConfig` → procedure `helpCenterConfigs.get` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterConfigs` → procedure `helpCenterConfigs.list` (returns `[HelpCenterConfig]`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterConfigsTotalCount` → procedure `helpCenterConfigs.list` (returns `Int`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] query `helpCenterGetConfigByDomain` → procedure `helpCenterGetConfigByDomains.get` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:190`
- [ ] mutation `helpCenterConfigUpdate` → procedure `helpCenterConfigs.update` (returns `HelpCenterConfig`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:197`
- [ ] mutation `helpCenterConfigRemove` → procedure `helpCenterConfigs.remove` (returns `JSON`) `frontline_api/src/modules/helpcenter/graphql/schemas/helpCenterConfig.ts:197`

### Pages

- [ ] `/frontline/helpcenter` (HelpCenter) `frontline_ui/src/modules/FrontlineMain.tsx:160`
  - files: 74, 25 only here: `modules/helpcenter/components/help-center-command-bar/HelpCenterCommandBar.tsx`, `modules/helpcenter/components/help-center-command-bar/HelpCenterDelete.tsx`, `modules/helpcenter/components/help-center-command-bar/index.ts`, `modules/helpcenter/components/HelpCenterColumns.tsx`, `modules/helpcenter/components/HelpCenterFilter.tsx`, `modules/helpcenter/components/HelpCenterMoreColumn.tsx`, `modules/helpcenter/components/HelpCenterRecordTable.tsx`, `modules/helpcenter/components/HelpCenterTotalCount.tsx`, `modules/helpcenter/components/SelectHelpCenterClientPortal.tsx`, `modules/helpcenter/components/SelectHelpCenterTopic.tsx`, `modules/helpcenter/constants/index.ts`, `modules/helpcenter/graphql/mutations/helpCenterConfigUpdate.ts`, `modules/helpcenter/graphql/queries/getHelpCenters.ts`, `modules/helpcenter/graphql/queries/getHelpCenterTopicOptions.ts`, `modules/helpcenter/graphql/queries/getHelpCenterWebsiteOptions.ts`, `modules/helpcenter/hooks/useConfirmRemoveHelpCenter.ts`, `modules/helpcenter/hooks/useEditHelpCenter.ts`, `modules/helpcenter/hooks/useHelpCenters.ts`, `modules/helpcenter/hooks/useRemoveHelpCenters.ts`, `modules/helpcenter/states/helpCenterPanelDraftsState.ts`, `modules/helpcenter/states/helpCentersTotalCountState.ts`, `modules/helpcenter/types/index.ts`, `modules/helpcenter/utils/toHelpCenterConfigInput.ts`, `modules/knowledgebase/shared/hooks/useSearchBrandFilters.ts`, `pages/HelpCenterIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `getClientPortals`; helpcenter: `helpCenterConfig`, `helpCenterConfigRemove`, `helpCenterConfigs`, `helpCenterConfigsTotalCount`, `helpCenterConfigUpdate`; inbox: `integrations`; knowledgebase: `knowledgeBaseTopics`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `updateTicket`
  - ui-modules: `createFavoriteBreadcrumb`, `currentUserState`, `getSidePanelRecordPath`, `PageHeader`, `PanelFormRow`, `SelectBrand`, `SelectMember`, `usePermissionCheck`, `useSidePanel`
  - keeps: useConfirm · confirm "kb-confirm-delete-topics" · toast "Help centers deleted" · useSidePanel · useMultiQueryState "['searchValue', 'brand']" · confirm "kb-confirm-delete-topic" · toast "Help center deleted" · toast "A help center needs a name." · toast "Help center saved" · confirm "{ message: discardMessage }" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "statusId" · useMultiQueryState "['editId', 'panel']"

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
- [ ] query `getColorThemePreview` → procedure `colorThemePreviews.get` (returns `ColorThemePreview`) `frontline_api/src/modules/inbox/graphql/schemas/colorTheme.ts:1`
- [ ] mutation `applyColorThemeToIntegration` → procedure `inbox.applyColorThemeToIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/colorTheme.ts:5`
- [ ] query `conversationMessage` → procedure `conversationMessages.get` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversations` → procedure `conversations.list` (returns `ConversationListResponse`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationMessages` → procedure `conversationMessages.list` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationMessagesTotalCount` → procedure `conversationMessages.list` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationPinnedMessages` → procedure `conversationPinnedMessages.list` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationCounts` → procedure `conversationCounts.list` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsTotalCount` → procedure `conversations.list` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationDetail` → procedure `conversations.get` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsGetLast` → procedure `conversationsGetLasts.get` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `conversationsTotalUnreadCount` → procedure `conversationsTotalUnreadCounts.get` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] query `userConversations` → procedure `userConversations.list` (returns `UserConversationListResponse`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:42`
- [ ] mutation `conversationMessageReact` → procedure `inbox.conversationMessageReact` (returns `Boolean!`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessageAdd` → procedure `conversationMessages.create` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessagePin` → procedure `inbox.conversationMessagePin` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMessageEdit` → procedure `conversationMessages.update` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsAssign` → procedure `inbox.conversationsAssign` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsUnassign` → procedure `inbox.conversationsUnassign` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsChangeStatus` → procedure `inbox.conversationsChangeStatus` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationMarkAsRead` → procedure `inbox.conversationMarkAsRead` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationAgentTyping` → procedure `inbox.conversationAgentTyping` (returns `Boolean`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `changeConversationOperator` → procedure `inbox.changeConversationOperator` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationSetAutomatedReplyControl` → procedure `inbox.conversationSetAutomatedReplyControl` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationsResolve` → procedure `inbox.conversationsResolve` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] mutation `conversationEditCustomFields` → procedure `inbox.conversationEditCustomFields` (returns `Conversation`) `frontline_api/src/modules/inbox/graphql/schemas/conversation.ts:63`
- [ ] query `integrations` → procedure `integrations.list` (returns `IntegrationRespone`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `allLeadIntegrations` → procedure `allLeadIntegrations.list` (returns `[Integration]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsGetUsedTypes` → procedure `integrationsGetUsedTypes.list` (returns `[integrationsGetUsedTypes]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsGetUsedTypesByChannel` → procedure `integrationsGetUsedTypesByChannels.get` (returns `[integrationsGetUsedTypesByChannel]`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationDetail` → procedure `integrations.get` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
- [ ] query `integrationsTotalCount` → procedure `integrations.list` (returns `integrationsTotalCount`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:217`
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
- [ ] mutation `integrationsRemove` → procedure `integrations.remove` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsRemoveAccount` → procedure `inbox.integrationsRemoveAccount` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsRepair` → procedure `inbox.integrationsRepair` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsArchive` → procedure `inbox.integrationsArchive` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCreateLeadIntegration` → procedure `inbox.integrationsCreateLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsEditLeadIntegration` → procedure `inbox.integrationsEditLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsCopyLeadIntegration` → procedure `inbox.integrationsCopyLeadIntegration` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] mutation `integrationsSaveMessengerTicketData` → procedure `inbox.integrationsSaveMessengerTicketData` (returns `Integration`) `frontline_api/src/modules/inbox/graphql/schemas/integration.ts:239`
- [ ] query `widgetsConversations` → procedure `widgetsConversations.list` (returns `[Conversation]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsConversationDetail` → procedure `widgetsConversations.get` (returns `ConversationDetailResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsMessages` → procedure `widgetsMessages.list` (returns `[ConversationMessage]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsUnreadCount` → procedure `widgetsUnreadCounts.get` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsTotalUnreadCount` → procedure `widgetsTotalUnreadCounts.get` (returns `Int`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsMessengerSupporters` → procedure `widgetsMessengerSupporters.list` (returns `MessengerSupportersResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsTicketCustomerDetail` → procedure `widgetsTicketCustomers.get` (returns `Customer`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetsGetTicketTags` → procedure `widgetsGetTicketTags.list` (returns `[Tag]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketCheckProgress` → procedure `widgetTicketCheckProgress.list` (returns `Ticket`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketComments` → procedure `widgetTicketComments.list` (returns `[TicketNote]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketActivityLogs` → procedure `widgetTicketActivityLogs.list` (returns `[TicketActivity]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] query `widgetTicketsByCustomer` → procedure `widgetTicketsByCustomers.get` (returns `[Ticket]`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:49`
- [ ] mutation `widgetsMessengerConnect` → procedure `inbox.widgetsMessengerConnect` (returns `MessengerConnectResponse`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsSaveBrowserInfo` → procedure `inbox.widgetsSaveBrowserInfo` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsInsertMessage` → procedure `inbox.widgetsInsertMessage` (returns `ConversationMessage`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetBotRequest` → procedure `inbox.widgetBotRequest` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsReadConversationMessages` → procedure `inbox.widgetsReadConversationMessages` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetChangeOperatorStatus` → procedure `inbox.widgetChangeOperatorStatus` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetGetBotInitialMessage` → procedure `inbox.widgetGetBotInitialMessage` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsLeadIncreaseViewCount` → procedure `inbox.widgetsLeadIncreaseViewCount` (returns `JSON`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsSendTypingInfo` → procedure `inbox.widgetsSendTypingInfo` (returns `String`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetsTicketCustomersEdit` → procedure `widgetsTicketCustomers.update` (returns `Customer`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCreated` → procedure `inbox.widgetTicketCreated` (returns `Ticket`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCommentAdd` → procedure `widgetTicketComments.create` (returns `TicketNote`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`
- [ ] mutation `widgetTicketCommentRemove` → procedure `widgetTicketComments.remove` (returns `String`) `frontline_api/src/modules/inbox/graphql/schemas/widget.ts:66`

### Pages

- [ ] `/frontline/inbox` (Inbox) `frontline_ui/src/modules/FrontlineMain.tsx:124`
  - files: 342, 268 only here: `assets/sound/notify.mp3`, `modules/inbox/components/InboxLayout.tsx`, `modules/inbox/components/InboxMessagesContainer.tsx`, `modules/inbox/components/InboxMessagesSkeleton.tsx`, `modules/inbox/constants/automationStatusFilters.ts`, `modules/inbox/constants/conversationsConstants.tsx`, `modules/inbox/constants/messengerConstants.ts`, `modules/inbox/conversation-messages/components/cards/ForwardedMessageCard.tsx`, `modules/inbox/conversation-messages/components/cards/PostMediaCard.tsx`, `modules/inbox/conversation-messages/components/cards/SocialCards.tsx`, `modules/inbox/conversation-messages/components/ConversationFormDisplay.tsx`, `modules/inbox/conversation-messages/components/ConversationMessages.tsx`, `modules/inbox/conversation-messages/components/CopyAttachmentAction.tsx`, `modules/inbox/conversation-messages/components/CopyTextAction.tsx`, `modules/inbox/conversation-messages/components/FormWidgetMessage.tsx`, `modules/inbox/conversation-messages/components/ForwardMessageDialog.tsx`, `modules/inbox/conversation-messages/components/MessageActionButton.tsx`, `modules/inbox/conversation-messages/components/MessageActions.tsx`, `modules/inbox/conversation-messages/components/MessageAuthorHeader.tsx`, `modules/inbox/conversation-messages/components/MessageContent.tsx`, `modules/inbox/conversation-messages/components/MessageCopyAction.tsx`, `modules/inbox/conversation-messages/components/MessageCopyActions.tsx`, `modules/inbox/conversation-messages/components/MessageEmbeds.tsx`, `modules/inbox/conversation-messages/components/MessageItem.tsx`, `modules/inbox/conversation-messages/components/MessageItemContent.tsx`, `modules/inbox/conversation-messages/components/MessageItemDetails.tsx`, `modules/inbox/conversation-messages/components/MessageItemHelpers.tsx`, `modules/inbox/conversation-messages/components/MessagePoll.tsx`, `modules/inbox/conversation-messages/components/MessageReactionMenu.tsx`, `modules/inbox/conversation-messages/components/messages/MessageTextBubble.tsx`, `modules/inbox/conversation-messages/components/MessageWrapper.tsx`, `modules/inbox/conversation-messages/components/pinned/PinnedMessagesBar.tsx`, `modules/inbox/conversation-messages/components/stickers/LottieSticker.tsx`, `modules/inbox/conversation-messages/components/stickers/StickerCard.tsx`, `modules/inbox/conversation-messages/components/TypingIndicator.tsx`, `modules/inbox/conversation-messages/constants/messageActions.ts`, `modules/inbox/conversation-messages/graphql/queries/getDiscordStickerAnimation.ts`, `modules/inbox/conversation-messages/hooks/useConversationMessages.tsx`, `modules/inbox/conversation-messages/hooks/useConversationPinnedMessages.ts`, `modules/inbox/conversation-messages/hooks/useConversationTypingStatus.tsx`, `modules/inbox/conversation-messages/hooks/useCopyAttachment.ts`, `modules/inbox/conversation-messages/hooks/useCopyMessageImage.ts`, `modules/inbox/conversation-messages/hooks/useForwardMessage.ts`, `modules/inbox/conversation-messages/hooks/useMessageNavigation.ts`, `modules/inbox/conversation-messages/hooks/useMessagePresentation.ts`, `modules/inbox/conversation-messages/hooks/useMessageReaction.ts`, `modules/inbox/conversation-messages/hooks/useMessageReactions.ts`, `modules/inbox/conversation-messages/hooks/useReactionTarget.ts`, `modules/inbox/conversation-messages/types/forwardMessage.ts`, `modules/inbox/conversation-messages/types/MessagePresentation.ts`, `modules/inbox/conversation-messages/utils/copyAttachment.ts`, `modules/inbox/conversation-messages/utils/formWidget.ts`, `modules/inbox/conversation-messages/utils/forwardMessage.ts`, `modules/inbox/conversation-messages/utils/message.ts`, `modules/inbox/conversation-messages/utils/messageActionText.ts`, `modules/inbox/conversation-messages/utils/messageDisplay.ts`, `modules/inbox/conversation-messages/utils/messageNavigation.ts`, `modules/inbox/conversation-messages/utils/messagePresentation.ts`, `modules/inbox/conversation-messages/utils/stickerImage.ts`, `modules/inbox/conversation-messages/utils/toMessage.ts`, `modules/inbox/conversations/components/AutomationStatusFilter.tsx`, `modules/inbox/conversations/components/ConversationActions.tsx`, `modules/inbox/conversations/components/ConversationChannelSection.tsx`, `modules/inbox/conversations/components/ConversationCountValue.tsx`, `modules/inbox/conversations/components/ConversationDisplay.tsx`, `modules/inbox/conversations/components/ConversationIdleIndicator.tsx`, `modules/inbox/conversations/components/ConversationItem.tsx`, `modules/inbox/conversations/components/ConversationRefetch.tsx`, `modules/inbox/conversations/components/Conversations.tsx`, `modules/inbox/conversations/components/ConversationsFilter.tsx`, `modules/inbox/conversations/components/ConversationsHeader.tsx`, `modules/inbox/conversations/components/ConversationsLoading.tsx`, `modules/inbox/conversations/components/ConversationTag.tsx`, `modules/inbox/conversations/components/ReplaceAssignee.tsx`, `modules/inbox/conversations/components/ResolveAll.tsx`, `modules/inbox/conversations/constants/useConversations.ts`, `modules/inbox/conversations/context/ConversationContext.tsx`, `modules/inbox/conversations/context/ConversationIdleClockContext.tsx`, `modules/inbox/conversations/context/ConversationListContext.tsx`, `modules/inbox/conversations/context/ConversationMessageContext.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerEditor.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerGalleries.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerGallery.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerPreviews.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerReplyPreview.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerShell.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerToolbar.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/PendingAttachmentItem.tsx`, `modules/inbox/conversations/conversation-detail/components/ComposerAttachment.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationActions.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationDetail.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationDetailLayout.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationHeader.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationMarkAsReadEffect.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationProperties.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationSharedEmail.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationSideWidget.tsx`, `modules/inbox/conversations/conversation-detail/components/MessageInput.tsx`, `modules/inbox/conversations/conversation-detail/components/NoConversationSelected.tsx`, `modules/inbox/conversations/conversation-detail/components/SendSurveyDialog.tsx`, `modules/inbox/conversations/conversation-detail/graphql/mutations/addConversationMessage.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/conversationAgentTyping.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/conversationMessageReact.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/markAsReadConversation.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationDetail.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationMessages.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationPinnedMessages.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getCustomersSharingEmail.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerAttachments.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerDraft.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerEditorKeyDown.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerGallery.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerPanelResize.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerSend.ts`, `modules/inbox/conversations/conversation-detail/hooks/useConversationContext.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationDetail.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMarkAsRead.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMessageContext.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationResolveAll.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useCustomersSharingEmail.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useDiscordComposer.ts`, `modules/inbox/conversations/conversation-detail/states/isInternalState.ts`, `modules/inbox/conversations/conversation-detail/states/messageExtraInfoState.ts`, `modules/inbox/conversations/conversation-detail/states/messageReplyState.ts`, `modules/inbox/conversations/conversation-detail/utils/composerAttachment.ts`, `modules/inbox/conversations/conversation-detail/utils/handleComposerAttachmentDelete.ts`, `modules/inbox/conversations/graphql/mutations/conversationAssign.ts`, `modules/inbox/conversations/graphql/mutations/conversationAutomatedReplyControl.ts`, `modules/inbox/conversations/graphql/mutations/conversationChangeStatus.ts`, `modules/inbox/conversations/graphql/mutations/conversationEditCustomFields.ts`, `modules/inbox/conversations/graphql/mutations/conversationResolve.tsx`, `modules/inbox/conversations/graphql/queries/getConversationCounts.ts`, `modules/inbox/conversations/graphql/queries/getConversations.ts`, `modules/inbox/conversations/graphql/subscriptions/inboxSubscriptions.ts`, `modules/inbox/conversations/hooks/useAssignConversations.tsx`, `modules/inbox/conversations/hooks/useChangeConversationStatus.tsx`, `modules/inbox/conversations/hooks/useConversationAutomatedReplyControl.tsx`, `modules/inbox/conversations/hooks/useConversationContext.tsx`, `modules/inbox/conversations/hooks/useConversationCounts.tsx`, `modules/inbox/conversations/hooks/useConversationCustomFieldEdit.tsx`, `modules/inbox/conversations/hooks/useConversationListChannels.ts`, `modules/inbox/conversations/hooks/useConversationListContext.tsx`, `modules/inbox/conversations/hooks/useConversations.tsx`, `modules/inbox/conversations/hooks/useNotificationSound.ts`, `modules/inbox/conversations/idleTranslations.ts`, `modules/inbox/conversations/states/activeConversationState.ts`, `modules/inbox/conversations/states/conversationsContainerScrollState.ts`, `modules/inbox/conversations/states/newMessagesCountState.ts`, `modules/inbox/conversations/states/refetchConversationState.ts`, `modules/inbox/conversations/states/selectConversationsState.ts`, `modules/inbox/conversations/translations.ts`, `modules/inbox/conversations/types/conversationListChannels.ts`, `modules/inbox/conversations/types/useConversations.ts`, `modules/inbox/conversations/utils/channelGroups.ts`, `modules/inbox/conversations/utils/conversationContext.ts`, `modules/inbox/conversations/utils/conversationCounts.ts`, `modules/inbox/conversations/utils/conversationDisplay.ts`, `modules/inbox/conversations/utils/conversationIdle.ts`, `modules/inbox/conversations/utils/conversationMessagePreview.ts`, `modules/inbox/conversations/utils/useConversations.ts`, `modules/inbox/hooks/useCompactWidth.tsx`, `modules/inbox/hooks/useConversationListVisibility.tsx`, `modules/inbox/hooks/useInboxLayout.tsx`, `modules/inbox/states/conversationListHiddenState.ts`, `modules/inbox/states/inboxLayoutContext.ts`, `modules/inbox/states/inboxLayoutState.ts`, `modules/inbox/types/FormWidget.ts`, `modules/integrations/call/components/CallConversationDetail.tsx`, `modules/integrations/call/components/CallConversationNotes.tsx`, `modules/integrations/call/components/InternalNotes.tsx`, `modules/integrations/call/context/conversationNoteContext.tsx`, `modules/integrations/call/graphql/mutations/callMutations.ts`, `modules/integrations/call/graphql/queries/callConversationNoteQueries.ts`, `modules/integrations/call/graphql/queries/callHistoryDetailQuery.ts`, `modules/integrations/call/hooks/useCallConversationDetail.ts`, `modules/integrations/call/hooks/useCallConversationNotes.ts`, `modules/integrations/call/hooks/useCallSyncAudioRecord.ts`, `modules/integrations/call/utils/callContentUtils.ts`, `modules/integrations/callpro/components/CallProConversationDetail.tsx`, `modules/integrations/callpro/components/CallProCustomerSelect.tsx`, `modules/integrations/callpro/graphql/mutations/callProMutations.ts`, `modules/integrations/callpro/hooks/useCallProCustomersByPhone.ts`, `modules/integrations/callpro/hooks/useCallProCustomerSelect.ts`, `modules/integrations/callpro/types/callProTypes.ts`, `modules/integrations/components/ConversationIntegrationDetail.tsx`, `modules/integrations/components/IntegrationActions.tsx`, `modules/integrations/components/IntegrationTypeFilter.tsx`, `modules/integrations/components/MessageInputIntegrationWrapper.tsx`, `modules/integrations/constants/context/SelectIntegrationTypeContext.tsx`, `modules/integrations/constants/integrationImages.ts`, `modules/integrations/discord/components/DiscordChannelFilterBar.tsx`, `modules/integrations/discord/components/DiscordMessageActions.tsx`, `modules/integrations/discord/graphql/mutations.ts`, `modules/integrations/discord/types/messageActions.ts`, `modules/integrations/discord/utils/messageActions.ts`, `modules/integrations/facebook/components/FacebookConversationMessages.tsx`, `modules/integrations/facebook/components/FacebookMessageInputWrapper.tsx`, `modules/integrations/facebook/components/FacebookMessageRelationNotice.tsx`, `modules/integrations/facebook/components/FacebookMessageRow.tsx`, `modules/integrations/facebook/components/FacebookPostTrigger.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/BotAuthorBadge.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotButtonTemplateBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotCarouselBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotFileBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotMessageBlocks.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotMessageItem.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotQuickRepliesBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotTextBlock.tsx`, `modules/integrations/facebook/components/FbMessengerMessageAttachments.tsx`, `modules/integrations/facebook/components/FbMessengerMessages.tsx`, `modules/integrations/facebook/components/FbPostConversationDetail.tsx`, `modules/integrations/facebook/constants/conversationMessages.ts`, `modules/integrations/facebook/constants/FbMessageWindow.ts`, `modules/integrations/facebook/contexts/FacebookReplyWindowContext.ts`, `modules/integrations/facebook/contexts/FbMessengerMessageContext.tsx`, `modules/integrations/facebook/graphql/queries/fbConversationQueries.ts`, `modules/integrations/facebook/graphql/queries/fbPostQueries.ts`, `modules/integrations/facebook/hooks/useFacebookConversationMessages.tsx`, `modules/integrations/facebook/hooks/useFacebookPost.tsx`, `modules/integrations/facebook/types/FacebookMessageRow.ts`, `modules/integrations/facebook/types/FacebookReplyDelivery.ts`, `modules/integrations/facebook/types/FacebookTypes.ts`, `modules/integrations/facebook/utils/messageAttachments.ts`, `modules/integrations/hooks/useUsedIntegrationTypes.tsx`, `modules/integrations/instagram/components/IgPostConversationDetail.tsx`, `modules/integrations/instagram/components/IgPostTrigger.tsx`, `modules/integrations/instagram/components/InstagramConversationMessages.tsx`, `modules/integrations/instagram/graphql/queries/copyInstagramImage.ts`, `modules/integrations/instagram/graphql/queries/igConversationQueries.ts`, `modules/integrations/instagram/graphql/queries/igPostQueries.ts`, `modules/integrations/instagram/hooks/useIgPost.tsx`, `modules/integrations/instagram/hooks/useInstagramConversationMessages.tsx`, `modules/integrations/instagram/types/InstagramTypes.ts`, `modules/integrations/instagram/utils/instagramErrorFeedback.ts`, `modules/integrations/instagram/utils/instagramReactionError.ts`, `modules/integrations/instagram/utils/instagramReplyDelivery.ts`, `modules/integrations/instagram/utils/instagramSendError.ts`, `modules/integrations/instagram/utils/messageIdentity.ts`, `modules/integrations/mail/components/MailConversationDetail.tsx`, `modules/integrations/mail/components/MailDraftCard.tsx`, `modules/integrations/mail/components/MailDraftEditForm.tsx`, `modules/integrations/mail/components/MailDrafts.tsx`, `modules/integrations/mail/components/MailInternalNotes.tsx`, `modules/integrations/mail/components/MailMessageActions.tsx`, `modules/integrations/mail/components/MailReactionMenu.tsx`, `modules/integrations/mail/components/MailThread.tsx`, `modules/integrations/mail/components/MailThreadCompose.tsx`, `modules/integrations/mail/components/MailThreadMessage.tsx`, `modules/integrations/mail/components/MailThreadNotices.tsx`, `modules/integrations/mail/composer/constants/directMailComposer.ts`, `modules/integrations/mail/graphql/queries/mailQueries.ts`, `modules/integrations/mail/hooks/useMailConversationDetail.tsx`, `modules/integrations/mail/hooks/useMailDrafts.tsx`, `modules/integrations/mail/hooks/useMailThreadActions.ts`, `modules/integrations/mail/hooks/useMailThreadData.ts`, `modules/integrations/mail/types/mailDelivery.ts`, `modules/integrations/mail/types/mailDraft.ts`, `modules/integrations/mail/types/MailInternalNotesProps.ts`, `modules/integrations/mail/types/mailThread.ts`, `modules/integrations/mail/utils/directMailComposer.ts`, `modules/integrations/mail/utils/mailInternalNotes.ts`, `modules/integrations/mail/utils/mailReactions.ts`, `modules/integrations/mail/utils/mailThread.ts`, `modules/integrations/telegram/TelegramMessageContent.tsx`, `modules/integrations/telegram/TelegramMessageDetails.tsx`, `modules/integrations/telegram/useTelegramChats.ts`, `pages/InboxIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `brandDetail`, `callSessionUpdated`, `conversationChanged`, `conversationClientMessageInserted`, `conversationClientTypingStatusChanged`, `conversationMessageInserted`, `conversationMessageUpdated`, `conversationUnreadCountChanged`, `customers`, `mailDraftChanged`, `members`, `status`, `truncated`; inbox: `conversationAgentTyping`, `conversationCounts`, `conversationDetail`, `conversationEditCustomFields`, `conversationMarkAsRead`, `conversationMessageAdd`, `conversationMessagePin`, `conversationMessageReact`, `conversationMessages`, `conversationMessagesTotalCount`, `conversationPinnedMessages`, `conversations`, `conversationsAssign`, `conversationsChangeStatus`, `conversationSetAutomatedReplyControl`, `conversationsResolve`, `conversationsTotalCount`, `integrationDetail`, `integrations`, `integrationsGetUsedTypes`, `integrationsGetUsedTypesByChannel`; integrations: `callAddCustomer`, `callConversationNotes`, `callHistoryDetail`, `callProConfig`, `callProCustomersByPhone`, `callProCustomerSelect`, `callProIntegrationDetail`, `callsPauseAgent`, `callSyncRecordFile`, `callTransfer`, `discordBotChannels`, `discordBots`, `discordChannelMembers`, `discordConnectedServers`, `discordConversationChannel`, `discordConversationChannels`, `discordConversationParticipants`, `discordDeleteMessage`, `discordEditMessage`, `discordGuildChannels`, `discordGuilds`, `discordNamePresets`, `discordServers`, `discordStickerAnimation`, `discordTakenChannels`, `discordValidateToken`, `facebookConversationMessages`, `facebookConversationMessagesCount`, `facebookGetPost`, `frontlineInstagramCopyImage`, `instagramConversationMessages`, `instagramConversationMessagesCount`, `instagramGetPost`, `mailCheckConnection`, `mailConversationDetail`, `mailConversationDrafts`, `mailConversationInternalNotes`, `mailConversationInternalNotesCount`, `mailDraftApprove`, `mailDraftRemove`, `mailDraftSave`, `mailMessageRetry`, `mailSendMail`, `mailSendReaction`, `queueRealtimeUpdate`, `telegramAddBot`, `telegramBots`, `telegramBotWebhookInfo`, `telegramConversationChats`, `telegramDisconnectBot`, `telegramMessageLinkPreviews`, `telegramSetWebhook`, `telegramUpdateBot`; response: `responseTemplates`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`
  - ui-modules: `AssignMemberInEditor`, `createFavoriteBreadcrumb`, `currentUserState`, `CustomersInline`, `EditorMentionItem`, `FieldsInDetail`, `getRelationWidgetLabel`, `ICustomer`, `ICustomerInline`, `IUser`, `MembersInline`, `MentionInEditor`, `PageHeader`, `SelectMember`, `SelectTags`, `TagsSelect`, `useComposeEmail`, `useCustomers`, `useRelationWidget`, `useSidePanel`
  - keeps: useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · useQueryState "conversationId" · fetchMore · toast "Message unpinned" · toast "Failed to unpin message" · fetchMore "{ variables: { skip, limit: 50, }, updateQuery: (prev, { fet" · subscribeToMore "{ document: CONVERSATION_MESSAGE_INSERTED, variables: { _id:" · subscribeToMore "{ document: CONVERSATION_MESSAGE_UPDATED, variables: { _id: " · useSubscription "CONVERSATION_CLIENT_TYPING_STATUS_CHANGED" · toast "could-not-copy-attachment" · toast "image-unavailable-for-copying" · toast "message-forwarded" · toast "forward-failed" · toast "Message is no longer available" · toast "Could not load the message" · useQueryState "automationStatus" · useMultiQueryState "['conversationId']" · useMultiQueryState "[ 'status', 'unassigned', 'awaitingResponse', 'automationSta" · useQueryState "integrationId" · useQueryState "brandId" · useQueryState "status" · toast "Tag updated" · toast "Failed to update tags" · toast "assignees-updated" · toast "Conversations resolved" · useQueryState "relatedConversationId" · toast "Assignees updated" · useSubscription "CONVERSATION_MESSAGE_INSERTED" · useSidePanel · useScopedHotkeys "mod+enter" · toast "Add a question and at least 2 options" · toast "Survey sent" · toast "Failed to send survey" · toast "Attachment removed" · toast "Failed to upload gallery images" · toast "Images added to gallery" · toast "Could not send message" · toast "Poll sent!" · toast "Failed to send poll" · subscribeToMore "{ document: CONVERSATION_CHANGED, variables: { _id: conversa" · toast "{{name}} exceeds the {{size}} MB attachment limit" · toast "Telegram attachments must total 50 MB or less per message" · toast "You can attach up to 10 files to one message" · toast "Upload failed" · toast "File uploaded successfully!" · toast "Failed to insert template" · useSubscription "CONVERSATION_CLIENT_MESSAGE_INSERTED" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.FOR" · toast "Uh oh! Something went wrong." · atomWithStorage "inboxLayoutState" · toast "something-went-wrong" · fetchMore "{ variables: { skip: callConversationNotes.length, }, update" · useSubscription "CALL_CONVERSATION_NOTE_INSERTED" · toast "callpro-customer-selected" · toast "callpro-customer-select-failed" · useQueryState "integrationType" · useConfirm · toast "Message link unavailable" · toast "Message updated" · confirm "Delete this message from Discord? This cannot be undone." · confirm "Deleting removes the message from Discord for everyone." · toast "Message deleted" · toast "Failed to copy" · useMultiQueryState "['conversationId', 'messageId']" · useQueryState "messageId" · fetchMore "{ variables: { skip: loadedCount, }, updateQuery: (prev, { f" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: INTEGRATI" · confirm "Delete this draft? The reply will not be sent." · toast "error-loading-data" · toast "mail-email-address-copied" · toast "mail-copy-email-address-failed" · toast "enter-at-least-one-recipient" · toast "message-body-cannot-be-empty" · toast "mail-already-reacted-with" · toast "email-bounced-for" · toast "email-not-delivered" · toast "email-sent-successfully" · toast "failed-to-send-email" · useSubscription "MAIL_DRAFT_CHANGED_SUBSCRIPTION" · toast "Draft saved" · toast "Draft deleted" · useSubscription "MAIL_MESSAGE_INSERTED_SUBSCRIPTION" · useSubscription "TELEGRAM_CHAT_MESSAGE_INSERTED" · fetchMore "{ variables: { filter: { ...baseFilter, cursor: pageInfo?.en" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.BAC"
- [ ] `/frontline/` (Inbox) `frontline_ui/src/modules/inbox/InboxMain.tsx:15`
  - files: 342, 268 only here: `assets/sound/notify.mp3`, `modules/inbox/components/InboxLayout.tsx`, `modules/inbox/components/InboxMessagesContainer.tsx`, `modules/inbox/components/InboxMessagesSkeleton.tsx`, `modules/inbox/constants/automationStatusFilters.ts`, `modules/inbox/constants/conversationsConstants.tsx`, `modules/inbox/constants/messengerConstants.ts`, `modules/inbox/conversation-messages/components/cards/ForwardedMessageCard.tsx`, `modules/inbox/conversation-messages/components/cards/PostMediaCard.tsx`, `modules/inbox/conversation-messages/components/cards/SocialCards.tsx`, `modules/inbox/conversation-messages/components/ConversationFormDisplay.tsx`, `modules/inbox/conversation-messages/components/ConversationMessages.tsx`, `modules/inbox/conversation-messages/components/CopyAttachmentAction.tsx`, `modules/inbox/conversation-messages/components/CopyTextAction.tsx`, `modules/inbox/conversation-messages/components/FormWidgetMessage.tsx`, `modules/inbox/conversation-messages/components/ForwardMessageDialog.tsx`, `modules/inbox/conversation-messages/components/MessageActionButton.tsx`, `modules/inbox/conversation-messages/components/MessageActions.tsx`, `modules/inbox/conversation-messages/components/MessageAuthorHeader.tsx`, `modules/inbox/conversation-messages/components/MessageContent.tsx`, `modules/inbox/conversation-messages/components/MessageCopyAction.tsx`, `modules/inbox/conversation-messages/components/MessageCopyActions.tsx`, `modules/inbox/conversation-messages/components/MessageEmbeds.tsx`, `modules/inbox/conversation-messages/components/MessageItem.tsx`, `modules/inbox/conversation-messages/components/MessageItemContent.tsx`, `modules/inbox/conversation-messages/components/MessageItemDetails.tsx`, `modules/inbox/conversation-messages/components/MessageItemHelpers.tsx`, `modules/inbox/conversation-messages/components/MessagePoll.tsx`, `modules/inbox/conversation-messages/components/MessageReactionMenu.tsx`, `modules/inbox/conversation-messages/components/messages/MessageTextBubble.tsx`, `modules/inbox/conversation-messages/components/MessageWrapper.tsx`, `modules/inbox/conversation-messages/components/pinned/PinnedMessagesBar.tsx`, `modules/inbox/conversation-messages/components/stickers/LottieSticker.tsx`, `modules/inbox/conversation-messages/components/stickers/StickerCard.tsx`, `modules/inbox/conversation-messages/components/TypingIndicator.tsx`, `modules/inbox/conversation-messages/constants/messageActions.ts`, `modules/inbox/conversation-messages/graphql/queries/getDiscordStickerAnimation.ts`, `modules/inbox/conversation-messages/hooks/useConversationMessages.tsx`, `modules/inbox/conversation-messages/hooks/useConversationPinnedMessages.ts`, `modules/inbox/conversation-messages/hooks/useConversationTypingStatus.tsx`, `modules/inbox/conversation-messages/hooks/useCopyAttachment.ts`, `modules/inbox/conversation-messages/hooks/useCopyMessageImage.ts`, `modules/inbox/conversation-messages/hooks/useForwardMessage.ts`, `modules/inbox/conversation-messages/hooks/useMessageNavigation.ts`, `modules/inbox/conversation-messages/hooks/useMessagePresentation.ts`, `modules/inbox/conversation-messages/hooks/useMessageReaction.ts`, `modules/inbox/conversation-messages/hooks/useMessageReactions.ts`, `modules/inbox/conversation-messages/hooks/useReactionTarget.ts`, `modules/inbox/conversation-messages/types/forwardMessage.ts`, `modules/inbox/conversation-messages/types/MessagePresentation.ts`, `modules/inbox/conversation-messages/utils/copyAttachment.ts`, `modules/inbox/conversation-messages/utils/formWidget.ts`, `modules/inbox/conversation-messages/utils/forwardMessage.ts`, `modules/inbox/conversation-messages/utils/message.ts`, `modules/inbox/conversation-messages/utils/messageActionText.ts`, `modules/inbox/conversation-messages/utils/messageDisplay.ts`, `modules/inbox/conversation-messages/utils/messageNavigation.ts`, `modules/inbox/conversation-messages/utils/messagePresentation.ts`, `modules/inbox/conversation-messages/utils/stickerImage.ts`, `modules/inbox/conversation-messages/utils/toMessage.ts`, `modules/inbox/conversations/components/AutomationStatusFilter.tsx`, `modules/inbox/conversations/components/ConversationActions.tsx`, `modules/inbox/conversations/components/ConversationChannelSection.tsx`, `modules/inbox/conversations/components/ConversationCountValue.tsx`, `modules/inbox/conversations/components/ConversationDisplay.tsx`, `modules/inbox/conversations/components/ConversationIdleIndicator.tsx`, `modules/inbox/conversations/components/ConversationItem.tsx`, `modules/inbox/conversations/components/ConversationRefetch.tsx`, `modules/inbox/conversations/components/Conversations.tsx`, `modules/inbox/conversations/components/ConversationsFilter.tsx`, `modules/inbox/conversations/components/ConversationsHeader.tsx`, `modules/inbox/conversations/components/ConversationsLoading.tsx`, `modules/inbox/conversations/components/ConversationTag.tsx`, `modules/inbox/conversations/components/ReplaceAssignee.tsx`, `modules/inbox/conversations/components/ResolveAll.tsx`, `modules/inbox/conversations/constants/useConversations.ts`, `modules/inbox/conversations/context/ConversationContext.tsx`, `modules/inbox/conversations/context/ConversationIdleClockContext.tsx`, `modules/inbox/conversations/context/ConversationListContext.tsx`, `modules/inbox/conversations/context/ConversationMessageContext.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerEditor.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerGalleries.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerGallery.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerPreviews.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerReplyPreview.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerShell.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/ComposerToolbar.tsx`, `modules/inbox/conversations/conversation-detail/components/composer/PendingAttachmentItem.tsx`, `modules/inbox/conversations/conversation-detail/components/ComposerAttachment.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationActions.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationDetail.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationDetailLayout.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationHeader.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationMarkAsReadEffect.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationProperties.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationSharedEmail.tsx`, `modules/inbox/conversations/conversation-detail/components/ConversationSideWidget.tsx`, `modules/inbox/conversations/conversation-detail/components/MessageInput.tsx`, `modules/inbox/conversations/conversation-detail/components/NoConversationSelected.tsx`, `modules/inbox/conversations/conversation-detail/components/SendSurveyDialog.tsx`, `modules/inbox/conversations/conversation-detail/graphql/mutations/addConversationMessage.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/conversationAgentTyping.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/conversationMessageReact.ts`, `modules/inbox/conversations/conversation-detail/graphql/mutations/markAsReadConversation.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationDetail.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationMessages.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getConversationPinnedMessages.ts`, `modules/inbox/conversations/conversation-detail/graphql/queries/getCustomersSharingEmail.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerAttachments.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerDraft.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerEditorKeyDown.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerGallery.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerPanelResize.ts`, `modules/inbox/conversations/conversation-detail/hooks/composer/useComposerSend.ts`, `modules/inbox/conversations/conversation-detail/hooks/useConversationContext.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationDetail.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMarkAsRead.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationMessageContext.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useConversationResolveAll.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useCustomersSharingEmail.tsx`, `modules/inbox/conversations/conversation-detail/hooks/useDiscordComposer.ts`, `modules/inbox/conversations/conversation-detail/states/isInternalState.ts`, `modules/inbox/conversations/conversation-detail/states/messageExtraInfoState.ts`, `modules/inbox/conversations/conversation-detail/states/messageReplyState.ts`, `modules/inbox/conversations/conversation-detail/utils/composerAttachment.ts`, `modules/inbox/conversations/conversation-detail/utils/handleComposerAttachmentDelete.ts`, `modules/inbox/conversations/graphql/mutations/conversationAssign.ts`, `modules/inbox/conversations/graphql/mutations/conversationAutomatedReplyControl.ts`, `modules/inbox/conversations/graphql/mutations/conversationChangeStatus.ts`, `modules/inbox/conversations/graphql/mutations/conversationEditCustomFields.ts`, `modules/inbox/conversations/graphql/mutations/conversationResolve.tsx`, `modules/inbox/conversations/graphql/queries/getConversationCounts.ts`, `modules/inbox/conversations/graphql/queries/getConversations.ts`, `modules/inbox/conversations/graphql/subscriptions/inboxSubscriptions.ts`, `modules/inbox/conversations/hooks/useAssignConversations.tsx`, `modules/inbox/conversations/hooks/useChangeConversationStatus.tsx`, `modules/inbox/conversations/hooks/useConversationAutomatedReplyControl.tsx`, `modules/inbox/conversations/hooks/useConversationContext.tsx`, `modules/inbox/conversations/hooks/useConversationCounts.tsx`, `modules/inbox/conversations/hooks/useConversationCustomFieldEdit.tsx`, `modules/inbox/conversations/hooks/useConversationListChannels.ts`, `modules/inbox/conversations/hooks/useConversationListContext.tsx`, `modules/inbox/conversations/hooks/useConversations.tsx`, `modules/inbox/conversations/hooks/useNotificationSound.ts`, `modules/inbox/conversations/idleTranslations.ts`, `modules/inbox/conversations/states/activeConversationState.ts`, `modules/inbox/conversations/states/conversationsContainerScrollState.ts`, `modules/inbox/conversations/states/newMessagesCountState.ts`, `modules/inbox/conversations/states/refetchConversationState.ts`, `modules/inbox/conversations/states/selectConversationsState.ts`, `modules/inbox/conversations/translations.ts`, `modules/inbox/conversations/types/conversationListChannels.ts`, `modules/inbox/conversations/types/useConversations.ts`, `modules/inbox/conversations/utils/channelGroups.ts`, `modules/inbox/conversations/utils/conversationContext.ts`, `modules/inbox/conversations/utils/conversationCounts.ts`, `modules/inbox/conversations/utils/conversationDisplay.ts`, `modules/inbox/conversations/utils/conversationIdle.ts`, `modules/inbox/conversations/utils/conversationMessagePreview.ts`, `modules/inbox/conversations/utils/useConversations.ts`, `modules/inbox/hooks/useCompactWidth.tsx`, `modules/inbox/hooks/useConversationListVisibility.tsx`, `modules/inbox/hooks/useInboxLayout.tsx`, `modules/inbox/states/conversationListHiddenState.ts`, `modules/inbox/states/inboxLayoutContext.ts`, `modules/inbox/states/inboxLayoutState.ts`, `modules/inbox/types/FormWidget.ts`, `modules/integrations/call/components/CallConversationDetail.tsx`, `modules/integrations/call/components/CallConversationNotes.tsx`, `modules/integrations/call/components/InternalNotes.tsx`, `modules/integrations/call/context/conversationNoteContext.tsx`, `modules/integrations/call/graphql/mutations/callMutations.ts`, `modules/integrations/call/graphql/queries/callConversationNoteQueries.ts`, `modules/integrations/call/graphql/queries/callHistoryDetailQuery.ts`, `modules/integrations/call/hooks/useCallConversationDetail.ts`, `modules/integrations/call/hooks/useCallConversationNotes.ts`, `modules/integrations/call/hooks/useCallSyncAudioRecord.ts`, `modules/integrations/call/utils/callContentUtils.ts`, `modules/integrations/callpro/components/CallProConversationDetail.tsx`, `modules/integrations/callpro/components/CallProCustomerSelect.tsx`, `modules/integrations/callpro/graphql/mutations/callProMutations.ts`, `modules/integrations/callpro/hooks/useCallProCustomersByPhone.ts`, `modules/integrations/callpro/hooks/useCallProCustomerSelect.ts`, `modules/integrations/callpro/types/callProTypes.ts`, `modules/integrations/components/ConversationIntegrationDetail.tsx`, `modules/integrations/components/IntegrationActions.tsx`, `modules/integrations/components/IntegrationTypeFilter.tsx`, `modules/integrations/components/MessageInputIntegrationWrapper.tsx`, `modules/integrations/constants/context/SelectIntegrationTypeContext.tsx`, `modules/integrations/constants/integrationImages.ts`, `modules/integrations/discord/components/DiscordChannelFilterBar.tsx`, `modules/integrations/discord/components/DiscordMessageActions.tsx`, `modules/integrations/discord/graphql/mutations.ts`, `modules/integrations/discord/types/messageActions.ts`, `modules/integrations/discord/utils/messageActions.ts`, `modules/integrations/facebook/components/FacebookConversationMessages.tsx`, `modules/integrations/facebook/components/FacebookMessageInputWrapper.tsx`, `modules/integrations/facebook/components/FacebookMessageRelationNotice.tsx`, `modules/integrations/facebook/components/FacebookMessageRow.tsx`, `modules/integrations/facebook/components/FacebookPostTrigger.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/BotAuthorBadge.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotButtonTemplateBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotCarouselBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotFileBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotMessageBlocks.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotMessageItem.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotQuickRepliesBlock.tsx`, `modules/integrations/facebook/components/FbMessengerBotMessageBlocks/FbMessengerBotTextBlock.tsx`, `modules/integrations/facebook/components/FbMessengerMessageAttachments.tsx`, `modules/integrations/facebook/components/FbMessengerMessages.tsx`, `modules/integrations/facebook/components/FbPostConversationDetail.tsx`, `modules/integrations/facebook/constants/conversationMessages.ts`, `modules/integrations/facebook/constants/FbMessageWindow.ts`, `modules/integrations/facebook/contexts/FacebookReplyWindowContext.ts`, `modules/integrations/facebook/contexts/FbMessengerMessageContext.tsx`, `modules/integrations/facebook/graphql/queries/fbConversationQueries.ts`, `modules/integrations/facebook/graphql/queries/fbPostQueries.ts`, `modules/integrations/facebook/hooks/useFacebookConversationMessages.tsx`, `modules/integrations/facebook/hooks/useFacebookPost.tsx`, `modules/integrations/facebook/types/FacebookMessageRow.ts`, `modules/integrations/facebook/types/FacebookReplyDelivery.ts`, `modules/integrations/facebook/types/FacebookTypes.ts`, `modules/integrations/facebook/utils/messageAttachments.ts`, `modules/integrations/hooks/useUsedIntegrationTypes.tsx`, `modules/integrations/instagram/components/IgPostConversationDetail.tsx`, `modules/integrations/instagram/components/IgPostTrigger.tsx`, `modules/integrations/instagram/components/InstagramConversationMessages.tsx`, `modules/integrations/instagram/graphql/queries/copyInstagramImage.ts`, `modules/integrations/instagram/graphql/queries/igConversationQueries.ts`, `modules/integrations/instagram/graphql/queries/igPostQueries.ts`, `modules/integrations/instagram/hooks/useIgPost.tsx`, `modules/integrations/instagram/hooks/useInstagramConversationMessages.tsx`, `modules/integrations/instagram/types/InstagramTypes.ts`, `modules/integrations/instagram/utils/instagramErrorFeedback.ts`, `modules/integrations/instagram/utils/instagramReactionError.ts`, `modules/integrations/instagram/utils/instagramReplyDelivery.ts`, `modules/integrations/instagram/utils/instagramSendError.ts`, `modules/integrations/instagram/utils/messageIdentity.ts`, `modules/integrations/mail/components/MailConversationDetail.tsx`, `modules/integrations/mail/components/MailDraftCard.tsx`, `modules/integrations/mail/components/MailDraftEditForm.tsx`, `modules/integrations/mail/components/MailDrafts.tsx`, `modules/integrations/mail/components/MailInternalNotes.tsx`, `modules/integrations/mail/components/MailMessageActions.tsx`, `modules/integrations/mail/components/MailReactionMenu.tsx`, `modules/integrations/mail/components/MailThread.tsx`, `modules/integrations/mail/components/MailThreadCompose.tsx`, `modules/integrations/mail/components/MailThreadMessage.tsx`, `modules/integrations/mail/components/MailThreadNotices.tsx`, `modules/integrations/mail/composer/constants/directMailComposer.ts`, `modules/integrations/mail/graphql/queries/mailQueries.ts`, `modules/integrations/mail/hooks/useMailConversationDetail.tsx`, `modules/integrations/mail/hooks/useMailDrafts.tsx`, `modules/integrations/mail/hooks/useMailThreadActions.ts`, `modules/integrations/mail/hooks/useMailThreadData.ts`, `modules/integrations/mail/types/mailDelivery.ts`, `modules/integrations/mail/types/mailDraft.ts`, `modules/integrations/mail/types/MailInternalNotesProps.ts`, `modules/integrations/mail/types/mailThread.ts`, `modules/integrations/mail/utils/directMailComposer.ts`, `modules/integrations/mail/utils/mailInternalNotes.ts`, `modules/integrations/mail/utils/mailReactions.ts`, `modules/integrations/mail/utils/mailThread.ts`, `modules/integrations/telegram/TelegramMessageContent.tsx`, `modules/integrations/telegram/TelegramMessageDetails.tsx`, `modules/integrations/telegram/useTelegramChats.ts`, `pages/InboxIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `brandDetail`, `callSessionUpdated`, `conversationChanged`, `conversationClientMessageInserted`, `conversationClientTypingStatusChanged`, `conversationMessageInserted`, `conversationMessageUpdated`, `conversationUnreadCountChanged`, `customers`, `mailDraftChanged`, `members`, `status`, `truncated`; inbox: `conversationAgentTyping`, `conversationCounts`, `conversationDetail`, `conversationEditCustomFields`, `conversationMarkAsRead`, `conversationMessageAdd`, `conversationMessagePin`, `conversationMessageReact`, `conversationMessages`, `conversationMessagesTotalCount`, `conversationPinnedMessages`, `conversations`, `conversationsAssign`, `conversationsChangeStatus`, `conversationSetAutomatedReplyControl`, `conversationsResolve`, `conversationsTotalCount`, `integrationDetail`, `integrations`, `integrationsGetUsedTypes`, `integrationsGetUsedTypesByChannel`; integrations: `callAddCustomer`, `callConversationNotes`, `callHistoryDetail`, `callProConfig`, `callProCustomersByPhone`, `callProCustomerSelect`, `callProIntegrationDetail`, `callsPauseAgent`, `callSyncRecordFile`, `callTransfer`, `discordBotChannels`, `discordBots`, `discordChannelMembers`, `discordConnectedServers`, `discordConversationChannel`, `discordConversationChannels`, `discordConversationParticipants`, `discordDeleteMessage`, `discordEditMessage`, `discordGuildChannels`, `discordGuilds`, `discordNamePresets`, `discordServers`, `discordStickerAnimation`, `discordTakenChannels`, `discordValidateToken`, `facebookConversationMessages`, `facebookConversationMessagesCount`, `facebookGetPost`, `frontlineInstagramCopyImage`, `instagramConversationMessages`, `instagramConversationMessagesCount`, `instagramGetPost`, `mailCheckConnection`, `mailConversationDetail`, `mailConversationDrafts`, `mailConversationInternalNotes`, `mailConversationInternalNotesCount`, `mailDraftApprove`, `mailDraftRemove`, `mailDraftSave`, `mailMessageRetry`, `mailSendMail`, `mailSendReaction`, `queueRealtimeUpdate`, `telegramAddBot`, `telegramBots`, `telegramBotWebhookInfo`, `telegramConversationChats`, `telegramDisconnectBot`, `telegramMessageLinkPreviews`, `telegramSetWebhook`, `telegramUpdateBot`; response: `responseTemplates`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`
  - ui-modules: `AssignMemberInEditor`, `createFavoriteBreadcrumb`, `currentUserState`, `CustomersInline`, `EditorMentionItem`, `FieldsInDetail`, `getRelationWidgetLabel`, `ICustomer`, `ICustomerInline`, `IUser`, `MembersInline`, `MentionInEditor`, `PageHeader`, `SelectMember`, `SelectTags`, `TagsSelect`, `useComposeEmail`, `useCustomers`, `useRelationWidget`, `useSidePanel`
  - keeps: useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · useQueryState "conversationId" · fetchMore · toast "Message unpinned" · toast "Failed to unpin message" · fetchMore "{ variables: { skip, limit: 50, }, updateQuery: (prev, { fet" · subscribeToMore "{ document: CONVERSATION_MESSAGE_INSERTED, variables: { _id:" · subscribeToMore "{ document: CONVERSATION_MESSAGE_UPDATED, variables: { _id: " · useSubscription "CONVERSATION_CLIENT_TYPING_STATUS_CHANGED" · toast "could-not-copy-attachment" · toast "image-unavailable-for-copying" · toast "message-forwarded" · toast "forward-failed" · toast "Message is no longer available" · toast "Could not load the message" · useQueryState "automationStatus" · useMultiQueryState "['conversationId']" · useMultiQueryState "[ 'status', 'unassigned', 'awaitingResponse', 'automationSta" · useQueryState "integrationId" · useQueryState "brandId" · useQueryState "status" · toast "Tag updated" · toast "Failed to update tags" · toast "assignees-updated" · toast "Conversations resolved" · useQueryState "relatedConversationId" · toast "Assignees updated" · useSubscription "CONVERSATION_MESSAGE_INSERTED" · useSidePanel · useScopedHotkeys "mod+enter" · toast "Add a question and at least 2 options" · toast "Survey sent" · toast "Failed to send survey" · toast "Attachment removed" · toast "Failed to upload gallery images" · toast "Images added to gallery" · toast "Could not send message" · toast "Poll sent!" · toast "Failed to send poll" · subscribeToMore "{ document: CONVERSATION_CHANGED, variables: { _id: conversa" · toast "{{name}} exceeds the {{size}} MB attachment limit" · toast "Telegram attachments must total 50 MB or less per message" · toast "You can attach up to 10 files to one message" · toast "Upload failed" · toast "File uploaded successfully!" · toast "Failed to insert template" · useSubscription "CONVERSATION_CLIENT_MESSAGE_INSERTED" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.FOR" · toast "Uh oh! Something went wrong." · atomWithStorage "inboxLayoutState" · toast "something-went-wrong" · fetchMore "{ variables: { skip: callConversationNotes.length, }, update" · useSubscription "CALL_CONVERSATION_NOTE_INSERTED" · toast "callpro-customer-selected" · toast "callpro-customer-select-failed" · useQueryState "integrationType" · useConfirm · toast "Message link unavailable" · toast "Message updated" · confirm "Delete this message from Discord? This cannot be undone." · confirm "Deleting removes the message from Discord for everyone." · toast "Message deleted" · toast "Failed to copy" · useMultiQueryState "['conversationId', 'messageId']" · useQueryState "messageId" · fetchMore "{ variables: { skip: loadedCount, }, updateQuery: (prev, { f" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: INTEGRATI" · confirm "Delete this draft? The reply will not be sent." · toast "error-loading-data" · toast "mail-email-address-copied" · toast "mail-copy-email-address-failed" · toast "enter-at-least-one-recipient" · toast "message-body-cannot-be-empty" · toast "mail-already-reacted-with" · toast "email-bounced-for" · toast "email-not-delivered" · toast "email-sent-successfully" · toast "failed-to-send-email" · useSubscription "MAIL_DRAFT_CHANGED_SUBSCRIPTION" · toast "Draft saved" · toast "Draft deleted" · useSubscription "MAIL_MESSAGE_INSERTED_SUBSCRIPTION" · useSubscription "TELEGRAM_CHAT_MESSAGE_INSERTED" · fetchMore "{ variables: { filter: { ...baseFilter, cursor: pageInfo?.en" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.BAC"

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

- [ ] query `callQueueInitialList` → procedure `callQueueInitialLists.get` (returns `user`) `frontline_api/src/modules/integrations/call/graphql/resolvers/queries.ts:213`
- [ ] subscription `sessionTerminateRequested` → procedure `integrations.sessionTerminateRequested` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] subscription `queueRealtimeUpdate` → procedure `queueRealtimes.update` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] subscription `callStatistic` → procedure `integrations.callStatistic` (returns `CallStatistic`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:260`
- [ ] query `callsIntegrationDetail` → procedure `callsIntegrations.get` (returns `CallsIntegrationDetailResponse`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callUserIntegrations` → procedure `callUserIntegrations.list` (returns `[CallsIntegrationDetailResponse]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callsCustomerDetail` → procedure `callsCustomers.get` (returns `Customer`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistories` → procedure `callHistories.list` (returns `[CallHistory]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistoriesTotalCount` → procedure `callHistories.list` (returns `Int`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callsGetConfigs` → procedure `callsGetConfigs.list` (returns `[CallConfig]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callGetAgentStatus` → procedure `callGetAgentStatuses.get` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callExtensionList` → procedure `callExtensionLists.get` (returns `[CallExtension]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callQueueList` → procedure `callQueueLists.get` (returns `[CallQueueStatistic]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callQueueInitialList` → procedure `callQueueInitialLists.get` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callConversationNotes` → procedure `callConversationNotes.list` (returns `[CallConversationNotes]`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] query `callHistoryDetail` → procedure `callHistories.get` (returns `CallHistory`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:281`
- [ ] mutation `callsIntegrationUpdate` → procedure `callsIntegrations.update` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callAddCustomer` → procedure `integrations.callAddCustomer` (returns `CallConversationDetail`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callsUpdateConfigs` → procedure `integrations.callsUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callsPauseAgent` → procedure `integrations.callsPauseAgent` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callTransfer` → procedure `integrations.callTransfer` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] mutation `callSyncRecordFile` → procedure `integrations.callSyncRecordFile` (returns `String`) `frontline_api/src/modules/integrations/call/graphql/schema/call.ts:297`
- [ ] query `callProConfig` → procedure `callProConfigs.get` (returns `CallProConfig`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] query `callProIntegrationDetail` → procedure `callProIntegrations.get` (returns `CallProIntegrationDetail`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] query `callProCustomersByPhone` → procedure `callProCustomersByPhones.get` (returns `[Customer]`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:13`
- [ ] mutation `callProCustomerSelect` → procedure `integrations.callProCustomerSelect` (returns `Conversation`) `frontline_api/src/modules/integrations/callpro/graphql/schema/callpro.ts:19`
- [ ] query `discordStickerAnimation` → procedure `discordStickerAnimations.get` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBots` → procedure `discordBots.list` (returns `[DiscordBot]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBot` → procedure `discordBots.get` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBotsTotalCount` → procedure `discordBots.list` (returns `Int`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordValidateToken` → procedure `discordValidateTokens.get` (returns `DiscordTokenValidation`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordGuilds` → procedure `discordGuilds.list` (returns `[FrontlineDiscordGuild]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordGuildChannels` → procedure `discordGuildChannels.list` (returns `[DiscordChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordBotChannels` → procedure `discordBotChannels.list` (returns `[DiscordChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationChannel` → procedure `discordConversationChannels.get` (returns `DiscordConversationChannel`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationChannels` → procedure `discordConversationChannels.list` (returns `[DiscordConversationChannel]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConversationParticipants` → procedure `discordConversationParticipants.list` (returns `[DiscordParticipant]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordChannelMembers` → procedure `discordChannelMembers.list` (returns `DiscordChannelMembersResult`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordServers` → procedure `discordServers.list` (returns `[DiscordServer]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordConnectedServers` → procedure `discordConnectedServers.list` (returns `[DiscordConnectedServer]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordTakenChannels` → procedure `discordTakenChannels.list` (returns `[String]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] query `discordNamePresets` → procedure `discordNamePresets.list` (returns `[String]`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:131`
- [ ] mutation `discordAddBot` → procedure `integrations.discordAddBot` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordUpdateBot` → procedure `integrations.discordUpdateBot` (returns `DiscordBot`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordRemoveBot` → procedure `integrations.discordRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordEditMessage` → procedure `integrations.discordEditMessage` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] mutation `discordDeleteMessage` → procedure `integrations.discordDeleteMessage` (returns `JSON`) `frontline_api/src/modules/integrations/discord/graphql/schema/discord.ts:150`
- [ ] query `facebookGetAccounts` → procedure `facebookGetAccounts.list` (returns `[FacebookAccount]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetIntegrations` → procedure `facebookGetIntegrations.list` (returns `[FacebookIntegrationRecord]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetIntegrationDetail` → procedure `facebookGetIntegrations.get` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetConfigs` → procedure `facebookGetConfigs.list` (returns `[FacebookConfig]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetComments` → procedure `facebookGetComments.list` (returns `[FacebookPostMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetCommentCount` → procedure `facebookGetCommentCounts.get` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPages` → procedure `facebookGetPages.list` (returns `[FacebookPage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationDetail` → procedure `facebookConversations.get` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationMessages` → procedure `facebookConversationMessages.list` (returns `[FacebookConversationMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookConversationMessagesCount` → procedure `facebookConversationMessagesCounts.get` (returns `Int`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPost` → procedure `facebookGetPosts.get` (returns `FacebookPost`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetPosts` → procedure `facebookGetPosts.list` (returns `[FacebookPosts!]!`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookHasTaggedMessages` → procedure `facebookHasTaggedMessages.list` (returns `Boolean`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookPostMessages` → procedure `facebookPostMessages.list` (returns `[FacebookPostMessage]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotsTotalCount` → procedure `facebookMessengerBots.list` (returns `Int`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBots` → procedure `facebookMessengerBots.list` (returns `[FacebookMessengerBot]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBot` → procedure `facebookMessengerBots.get` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotDelivery` → procedure `facebookMessengerBotDeliveries.get` (returns `FacebookBotDelivery`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookMessengerBotCommentReplyStats` → procedure `facebookMessengerBotCommentReplyStats.list` (returns `[FacebookBotCommentReplyStat]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetBotPosts` → procedure `facebookGetBotPosts.list` (returns `[FacebookPosts]`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] query `facebookGetBotPost` → procedure `facebookGetBotPosts.get` (returns `FacebookPosts`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:250`
- [ ] mutation `facebookUpdateConfigs` → procedure `integrations.facebookUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookRepair` → procedure `integrations.facebookRepair` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookReplyToComment` → procedure `integrations.facebookReplyToComment` (returns `FacebookComment`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookCreatePost` → procedure `integrations.facebookCreatePost` (returns `FacebookCreatePostResult`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerAddBot` → procedure `integrations.facebookMessengerAddBot` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerUpdateBot` → procedure `integrations.facebookMessengerUpdateBot` (returns `FacebookMessengerBot`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerRemoveBot` → procedure `integrations.facebookMessengerRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] mutation `facebookMessengerRepairBot` → procedure `integrations.facebookMessengerRepairBot` (returns `JSON`) `frontline_api/src/modules/integrations/facebook/graphql/schema/facebook.ts:275`
- [ ] query `frontlineInstagramCopyImage` → procedure `frontlineInstagramCopyImages.get` (returns `String!`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetAccounts` → procedure `instagramGetAccounts.list` (returns `[InstagramAccount]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetIntegrations` → procedure `instagramGetIntegrations.list` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetIntegrationDetail` → procedure `instagramGetIntegrations.get` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetConfigs` → procedure `instagramGetConfigs.list` (returns `[InstagramConfig]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetComments` → procedure `instagramGetComments.list` (returns `[InstagramPostMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetCommentCount` → procedure `instagramGetCommentCounts.get` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPages` → procedure `instagramGetPages.list` (returns `[InstagramPage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationDetail` → procedure `instagramConversations.get` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationMessages` → procedure `instagramConversationMessages.list` (returns `[InstagramConversationMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramConversationMessagesCount` → procedure `instagramConversationMessagesCounts.get` (returns `Int`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPost` → procedure `instagramGetPosts.get` (returns `InstagramPost`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetPosts` → procedure `instagramGetPosts.list` (returns `[InstagramPosts]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramHasTaggedMessages` → procedure `instagramHasTaggedMessages.list` (returns `Boolean`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramPostMessages` → procedure `instagramPostMessages.list` (returns `[InstagramPostMessage]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBotsTotalCount` → procedure `instagramMessengerBots.list` (returns `Int`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBots` → procedure `instagramMessengerBots.list` (returns `[InstagramMessengerBot]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramMessengerBot` → procedure `instagramMessengerBots.get` (returns `InstagramMessengerBot`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetBotPosts` → procedure `instagramGetBotPosts.list` (returns `[InstagramPosts]`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] query `instagramGetBotPost` → procedure `instagramGetBotPosts.get` (returns `InstagramPosts`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:172`
- [ ] mutation `instagramUpdateConfigs` → procedure `integrations.instagramUpdateConfigs` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramRepair` → procedure `integrations.instagramRepair` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramReplyToComment` → procedure `integrations.instagramReplyToComment` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramResolveComment` → procedure `integrations.instagramResolveComment` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerAddBot` → procedure `integrations.instagramMessengerAddBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerUpdateBot` → procedure `integrations.instagramMessengerUpdateBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerRemoveBot` → procedure `integrations.instagramMessengerRemoveBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] mutation `instagramMessengerRepairBot` → procedure `integrations.instagramMessengerRepairBot` (returns `JSON`) `frontline_api/src/modules/integrations/instagram/graphql/schema/instagram.ts:196`
- [ ] query `mailVerifiedContacts` → procedure `mailVerifiedContacts.list` (returns `MailVerifiedContacts!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationDetail` → procedure `mailConversations.get` (returns `MailConversationMessages`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationInternalNotes` → procedure `mailConversationInternalNotes.list` (returns `[ConversationMessage!]!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationInternalNotesCount` → procedure `mailConversationInternalNotesCounts.get` (returns `Int!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailSendingReadiness` → procedure `mailSendingReadiness.list` (returns `MailSendingReadiness`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailConversationDrafts` → procedure `mailConversationDrafts.list` (returns `[MailDraft]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailInboxes` → procedure `mailInboxes.list` (returns `[MailInbox]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailPipelineIntegration` → procedure `mailPipelineIntegrations.get` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailSenders` → procedure `mailSenders.list` (returns `[MailSender!]!`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailTicketReplyTarget` → procedure `mailTicketReplyTargets.get` (returns `MailTicketReplyTarget`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareConnection` → procedure `mailCloudflareConnections.get` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareSendingQuota` → procedure `mailCloudflareSendingQuotas.get` (returns `MailCloudflareSendingQuota`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] query `mailCloudflareZones` → procedure `mailCloudflareZones.list` (returns `[MailCloudflareZone]`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:223`
- [ ] mutation `mailSendMail` → procedure `integrations.mailSendMail` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailSendReaction` → procedure `integrations.mailSendReaction` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineConnect` → procedure `integrations.mailPipelineConnect` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineUpdate` → procedure `mailPipelines.update` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineForwardVerified` → procedure `integrations.mailPipelineForwardVerified` (returns `MailPipelineIntegration`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailPipelineDisconnect` → procedure `integrations.mailPipelineDisconnect` (returns `Boolean`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailTicketNoteRetry` → procedure `integrations.mailTicketNoteRetry` (returns `TicketNote`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailMessageRetry` → procedure `integrations.mailMessageRetry` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftSave` → procedure `integrations.mailDraftSave` (returns `MailDraft`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftApprove` → procedure `integrations.mailDraftApprove` (returns `MailDeliveryOutcome`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailDraftRemove` → procedure `mailDrafts.remove` (returns `MailDraft`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCheckConnection` → procedure `integrations.mailCheckConnection` (returns `MailConnectionCheck`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareConnect` → procedure `integrations.mailCloudflareConnect` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareProvision` → procedure `integrations.mailCloudflareProvision` (returns `MailCloudflareConnection`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] mutation `mailCloudflareDisconnect` → procedure `integrations.mailCloudflareDisconnect` (returns `Boolean`) `frontline_api/src/modules/integrations/mail/graphql/schema/mail.ts:247`
- [ ] query `telegramMessageLinkPreviews` → procedure `telegramMessageLinkPreviews.list` (returns `[TelegramLinkPreview!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramConversationChats` → procedure `telegramConversationChats.list` (returns `[TelegramConversationChat!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBots` → procedure `telegramBots.list` (returns `[TelegramBot!]!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBot` → procedure `telegramBots.get` (returns `TelegramBot!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramValidateToken` → procedure `telegramValidateTokens.get` (returns `TelegramTokenValidation!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
- [ ] query `telegramBotWebhookInfo` → procedure `telegramBotWebhookInfos.get` (returns `TelegramWebhookInfo!`) `frontline_api/src/modules/integrations/telegram/graphql/schema/telegram.ts:64`
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

- [x] `frontline_knowledgebase_articles` from collection `knowledgebase_articles` (23 fields, draft `frontlineKnowledgebaseArticles` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/article.ts:13`. Decision: `topicId`, `code`, `forms`, `reactionCounts`, `publishedUserId`, `modifiedBy`, `modifiedDate` and `createdDate` are gone; the category gives the topic, and deleting the category deletes its articles. `scheduledDate` is `scheduled_at`.
- [x] `frontline_knowledgebase_categories` from collection `knowledgebase_categories` (11 fields, draft `frontlineKnowledgebaseCategories` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/category.ts:4`. Decision: `parentCategoryId` is `parent_id`, a foreign key that lifts children to the top when their parent goes; a category's `code`, like a topic's, is unique in its organisation.
- [x] `frontline_knowledgebase_topics` from collection `knowledgebase_topics` (13 fields, draft `frontlineKnowledgebaseTopics` in migration/schema-draft.ts) `frontline_api/src/modules/knowledgebase/db/definitions/topic.ts:4`. Decision: `brandId` goes with brands, `notificationSegmentId` with segments, and `categoryIds` repeated the categories table. Deleting a topic deletes its categories and articles.

### Procedures

- [x] query `knowledgeBaseTopics` → `knowledgebase.topics.list`, every topic by title with what the caller may change `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseTopicDetail` → `knowledgebase.topics.get` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseTopicsTotalCount` → folded into `knowledgebase.topics.list`, which returns them all `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseCategories` → `knowledgebase.categories.list`, a topic's categories, each counting the articles in it and under it `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseCategoryDetail` → `knowledgebase.categories.get` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseCategoriesTotalCount` → folded into `knowledgebase.categories.list`, which returns them all `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseCategoriesGetLast` → dropped: no screen called it, and it read the newest category of any topic `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseArticles` → `knowledgebase.articles.list`, newest first by cursor, filtered by category subtree, status and search `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `knowledgeBaseArticleDetail` → `knowledgebase.articles.get` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [ ] query `knowledgeBaseArticleDetailAndIncViewCount` → procedure `knowledgeBaseArticleDetailAndIncViewCounts.get` (returns `KnowledgeBaseArticle`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
  - note: waits for public routes, since only the published site reads it
- [x] query `knowledgeBaseArticlesTotalCount` → folded into `knowledgebase.articles.list` as `totalCount` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] query `cpKnowledgeBaseTopicDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:147`
- [x] mutation `knowledgeBaseTopicsAdd` → `knowledgebase.topics.create` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseTopicsEdit` → `knowledgebase.topics.update`, changing only the fields sent `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseTopicsRemove` → `knowledgebase.topics.remove`, taking its categories and articles with it `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseCategoriesAdd` → `knowledgebase.categories.create` `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseCategoriesEdit` → `knowledgebase.categories.update`, which refuses a cycle and moves the subtree with a new topic `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseCategoriesRemove` → `knowledgebase.categories.remove`, taking several ids `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseArticlesAdd` → `knowledgebase.articles.create`; `knowledgebase.articles.duplicate` copies one as a draft `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseArticlesEdit` → `knowledgebase.articles.update` for one, `knowledgebase.articles.bulkUpdate` for a status or category on many `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [x] mutation `knowledgeBaseArticlesRemove` → `knowledgebase.articles.remove`, taking several ids `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
- [ ] mutation `knowledgeBaseArticlesIncrementViewCount` → procedure `knowledgebase.knowledgeBaseArticlesIncrementViewCount` (returns `JSON`) `frontline_api/src/modules/knowledgebase/graphql/schemas/knowledgeBaseTypeDefs.ts:165`
  - note: waits for public routes, since only the published site counts views

### Pages

- [x] `/frontline/knowledgebase/*` (KnowledgeBase) → `ui/src/knowledgebase/KnowledgeBaseLayout.tsx`, the topic sidebar beside the open page, every page lazy. Decision: the embed script panel and its toasts "Script copied to clipboard" and "Could not copy the script" wait for public routes, since the script loads the public site; the brand select goes with brands; old `?editId=` and `?createTopic=true` links open the new `?article=`, `?category=` and `?topic=new` panels. `frontline_ui/src/modules/FrontlineMain.tsx:159`

## pipelines

### Pages

- [x] `/frontline/:id/pipelines` (ChannelPipelinesPage) → `ui/src/pipelines/PipelinesPage.tsx` at `/frontline/settings/channels/:id/pipelines`, newest first, created in a side panel, moved to another channel or deleted after typing "delete" `frontline_ui/src/modules/channels/components/settings/Settings.tsx:185`
- [x] `/frontline/:id/pipelines/:pipelineId/sla` (PipelineSlaPage) → `ui/src/pipelines/PipelineSlaPage.tsx`, hours to first response and to resolution per priority, and how early to warn. Decision: the job that rechecks due times comes back with tickets `frontline_ui/src/modules/channels/components/settings/Settings.tsx:214`

## report

### Pages

- [ ] `/frontline/reports/*` (Report) `frontline_ui/src/modules/FrontlineMain.tsx:144`
  - files: 161, 1 only here: `modules/ticket/components/ticket-selects/SelectStateTicket.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `integrations`; reports: `callCarrierBreakdown`, `callGetAgentStats`, `callGetQueueStats`, `callHeatmap`, `callHeatmapDaily`, `callHistoryList`, `callKpiScorecard`, `callReportIntegrations`, `callSlaReport`, `callTopNumbers`, `callVolumeSeries`, `getCallbackStats`, `reportChartAdd`, `reportChartRemove`, `reportCharts`, `reportConversationClosed`, `reportConversationExport`, `reportConversationList`, `reportConversationOpen`, `reportConversationOpenDate`, `reportConversationResolved`, `reportConversationResolvedDate`, `reportConversationResponses`, `reportConversationSources`, `reportConversationTags`, `reportFacebookActivity`, `reportFacebookBots`, `reportFacebookPages`, `reportFacebookPosts`, `reportFacebookSummary`, `reportFacebookSyncPostStats`, `reportTicketCustomProperties`, `reportTicketDate`, `reportTicketExport`, `reportTicketList`, `reportTicketOpen`, `reportTicketPriority`, `reportTicketSource`, `reportTicketStatusSummary`, `reportTicketTags`, `reportTicketTotalCount`; ticket: `addTicketStatus`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `updateTicket`
  - ui-modules: `CompaniesInline`, `createFavoriteBreadcrumb`, `currentUserState`, `CustomersInline`, `IField`, `IUser`, `MembersInline`, `PageHeader`, `SelectCompany`, `SelectCustomer`, `SelectMember`, `SelectTags`, `TagBadge`, `useFields`, `usePermissionCheck`, `useSelectMemberContext`, `useUsers`
  - keeps: toast "call-history-export-narrow" · toast "call-history-export-empty" · toast "call-history-export-done" · toast "Uh oh! Something went wrong." · toast "sla-export-narrow" · toast "Chart deleted" · toast "Chart saved" · toast "Failed to refresh reports" · useQueryState "reportModule" · useQueryState "assignee" · useQueryState "priority" · useQueryState "state" · useQueryState "statusId"

## reports

### Tables

- [ ] `frontline_report_charts` from collection `frontline_report_charts` (7 fields, draft `frontlineReportCharts` in migration/schema-draft.ts) `frontline_api/src/modules/reports/db/definitions/chart.ts:45`
- [ ] `reportChartFiltersSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/reports/db/definitions/chart.ts:13`

### Procedures

- [ ] query `callReportIntegrations` → procedure `callReportIntegrations.list` (returns `[CallReportIntegration!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetQueueStats` → procedure `callGetQueueStats.list` (returns `[QueueStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetAgentStats` → procedure `callGetAgentStats.list` (returns `[AgentStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `getCallbackStats` → procedure `callbackStats.list` (returns `[CallbackStats!]!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callKpiScorecard` → procedure `callKpiScorecards.get` (returns `CallKeyStatistics`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callVolumeSeries` → procedure `callVolumeSeries.list` (returns `[CallVolumePoint]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCarrierBreakdown` → procedure `callCarrierBreakdowns.get` (returns `[CarrierSlice]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHeatmap` → procedure `callHeatmaps.get` (returns `[HeatCell]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHeatmapDaily` → procedure `callHeatmapDailies.get` (returns `[CallDayHourCell]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callTopNumbers` → procedure `callTopNumbers.list` (returns `[TopNumber]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callTodayStatistics` → procedure `callTodayStatistics.list` (returns `CallKeyStatistics`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateServiceLevel` → procedure `callCalculateServiceLevels.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateFirstCallResolution` → procedure `callCalculateFirstCallResolutions.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAbandonmentRate` → procedure `callCalculateAbandonmentRates.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAverageSpeedOfAnswer` → procedure `callCalculateAverageSpeedOfAnswers.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateAverageHandlingTime` → procedure `callCalculateAverageHandlingTimes.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callCalculateOccupancyRate` → procedure `callCalculateOccupancyRates.get` (returns `Float`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callGetOperatorStats` → procedure `callGetOperatorStats.list` (returns `[OperatorStat]`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callSlaReport` → procedure `callSlaReports.get` (returns `CallSlaReport!`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `callHistoryList` → procedure `callHistoryLists.get` (returns `CallHistoryPage`) `frontline_api/src/modules/reports/graphql/schema/call.ts:212`
- [ ] query `reportCharts` → procedure `reportCharts.list` (returns `[ReportChart]`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:52`
- [ ] query `reportChartDetail` → procedure `reportCharts.get` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:52`
- [ ] mutation `reportChartAdd` → procedure `reportCharts.create` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] mutation `reportChartEdit` → procedure `reportCharts.update` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] mutation `reportChartRemove` → procedure `reportCharts.remove` (returns `ReportChart`) `frontline_api/src/modules/reports/graphql/schema/chart.ts:57`
- [ ] query `reportFacebookPages` → procedure `reportFacebookPages.list` (returns `[ReportFacebookPage]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookSummary` → procedure `reportFacebookSummaries.get` (returns `ReportFacebookSummary`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookActivity` → procedure `reportFacebookActivities.get` (returns `[ReportFacebookActivityPoint]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookPosts` → procedure `reportFacebookPosts.list` (returns `ReportFacebookPostResult`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] query `reportFacebookBots` → procedure `reportFacebookBots.list` (returns `[ReportFacebookBot]`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:82`
- [ ] mutation `reportFacebookSyncPostStats` → procedure `reports.reportFacebookSyncPostStats` (returns `ReportFacebookSyncResult`) `frontline_api/src/modules/reports/graphql/schema/facebook.ts:90`
- [ ] query `conversationProgressChart` → procedure `conversationProgressCharts.get` (returns `ConversationProgressChart`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationMemberProgress` → procedure `conversationMemberProgress.list` (returns `[ConversationMemberProgress]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationSourceProgress` → procedure `conversationSourceProgress.list` (returns `ConversationSourceProgress`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `conversationTagProgress` → procedure `conversationTagProgress.list` (returns `ConversationTagProgress`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationOpenDate` → procedure `reportConversationOpenDates.get` (returns `[ConversationDateStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResolvedDate` → procedure `reportConversationResolvedDates.get` (returns `[ConversationDateStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationList` → procedure `reportConversationLists.get` (returns `ConversationListResult`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResponses` → procedure `reportConversationResponses.list` (returns `[ConversationUserMessageStat]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationOpen` → procedure `reportConversationOpens.get` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationClosed` → procedure `reportConversationCloseds.get` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationResolved` → procedure `reportConversationResolveds.get` (returns `ReportMetric`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationTags` → procedure `reportConversationTags.list` (returns `[ReportTag]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationSources` → procedure `reportConversationSources.list` (returns `[ReportSource]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportConversationExport` → procedure `reportConversationExports.get` (returns `[ConversationExportItem]`) `frontline_api/src/modules/reports/graphql/schema/inbox.ts:122`
- [ ] query `reportTicketSource` → procedure `reportTicketSources.get` (returns `[ReportTicketSource]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketDate` → procedure `reportTicketDates.get` (returns `[TicketDateStat]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketOpen` → procedure `reportTicketOpens.get` (returns `ReportTicketMetric`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketList` → procedure `reportTicketLists.get` (returns `TicketListResult`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketTags` → procedure `reportTicketTags.list` (returns `[ReportTicketTag]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketCustomProperties` → procedure `reportTicketCustomProperties.list` (returns `[ReportTicketCustomProperty]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketTotalCount` → procedure `reportTickets.list` (returns `Int`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketStatusSummary` → procedure `reportTicketStatusSummaries.get` (returns `[ReportTicketStatusSummary]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketPriority` → procedure `reportTicketPriorities.get` (returns `[ReportTicketPriority]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`
- [ ] query `reportTicketExport` → procedure `reportTicketExports.get` (returns `[TicketExportItem]`) `frontline_api/src/modules/reports/graphql/schema/ticket.ts:131`

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

- [x] `frontline_response_templates` from collection `response_templates` (8 fields, draft `frontlineResponseTemplates` in migration/schema-draft.ts) `frontline_api/src/modules/response/db/definitions/responseTemplates.ts:6`. Decision: `files` is gone, since no screen set it. Deleting a channel deletes its templates.

### Procedures

- [x] query `responseTemplates` → `responseTemplates.list`, newest first by cursor, searching name and content `frontline_api/src/modules/response/graphql/schema.ts:29`
- [x] query `responseTemplate` → `responseTemplates.get` `frontline_api/src/modules/response/graphql/schema.ts:29`
- [x] mutation `responseTemplatesAdd` → `responseTemplates.create` `frontline_api/src/modules/response/graphql/schema.ts:38`
- [x] mutation `responseTemplatesEdit` → `responseTemplates.update`, which also moves a template between channels the caller is an admin of `frontline_api/src/modules/response/graphql/schema.ts:38`
- [x] mutation `responseTemplatesRemove` → `responseTemplates.remove` `frontline_api/src/modules/response/graphql/schema.ts:38`

### Pages

- [x] `/frontline/:id/response` (ChannelResponsePage) → `ui/src/responseTemplates/ResponseTemplatesPage.tsx` at `/frontline/settings/channels/:id/response`, with create and edit in a side panel `frontline_ui/src/modules/channels/components/settings/Settings.tsx:219`
- [x] `/frontline/:id/response/:responseId` (ResponseDetailPage) → opens the template in the list's panel, as the old page did `frontline_ui/src/modules/channels/components/settings/Settings.tsx:223`

## settings

### Pages

- [ ] `/frontline/settings/*` (FrontlineSettingsLayout) `frontline_ui/src/modules/FrontlineMain.tsx:191`
  - files: 77, 10 only here: `modules/inbox/conversations/components/ConversationCountValue.tsx`, `modules/inbox/conversations/graphql/queries/getConversationCounts.ts`, `modules/inbox/conversations/graphql/subscriptions/inboxSubscriptions.ts`, `modules/inbox/conversations/hooks/useConversationCounts.tsx`, `modules/inbox/conversations/utils/channelGroups.ts`, `modules/inbox/conversations/utils/conversationCounts.ts`, `modules/inbox/conversations/utils/conversationDisplay.ts`, `modules/integrations/constants/integrationImages.ts`, `modules/integrations/hooks/useUsedIntegrationTypes.tsx`, `modules/ticket/graphql/subscriptions/ticketListChanged.ts`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `conversationChanged`, `conversationClientMessageInserted`, `conversationClientTypingStatusChanged`, `conversationMessageInserted`, `conversationMessageUpdated`, `conversationUnreadCountChanged`, `members`, `status`, `ticketListChanged`, `truncated`; form: `formDetail`, `forms`, `formsTotalCount`; inbox: `conversationCounts`, `conversationsTotalCount`, `integrationDetail`, `integrations`, `integrationsGetUsedTypes`, `integrationsGetUsedTypesByChannel`; integrations: `discordBotChannels`, `discordBots`, `discordChannelMembers`, `discordConnectedServers`, `discordConversationChannel`, `discordConversationChannels`, `discordConversationParticipants`, `discordGuildChannels`, `discordGuilds`, `discordNamePresets`, `discordServers`, `discordTakenChannels`, `discordValidateToken`, `facebookCreatePost`; survey: `surveyDetail`, `surveyList`, `surveyTotalCount`; ticket: `getTicketPipelines`
  - ui-modules: `Can`, `currentUserState`, `getSidePanelRecordPath`, `ICustomerInline`, `ITag`, `IUser`, `MembersInline`, `PluginSharedSettingsNavigation`, `useBrands`, `useBrandsAdd`, `useSidePanel`, `useTags`
  - keeps: useSidePanel · useScopedHotkeys "c" · useQueryState "tagId" · useMultiQueryState "['channelId', 'tagId', 'status', 'searchValue']" · useQueryState "brandId" · useQueryState "channelId" · useMultiQueryState "INBOX_NAVIGATION_FILTER_KEYS" · toast "Brand created" · useMultiQueryState "INBOX_TARGET_KEYS" · useMultiQueryState "[ 'channelId', ]" · useSubscription "CONVERSATION_CLIENT_MESSAGE_INSERTED" · useSubscription "CONVERSATION_UNREAD_COUNT_CHANGED" · useQueryState "integrationId" · toast "post-images-still-uploading" · toast "post-images-or-link" · toast "post-published" · toast "post-images-upload-failed" · fetchMore "{ variables: { cursor: pageInfo?.endCursor, limit: INTEGRATI" · useConfirm · confirm "{ message: discardMessage }" · useSubscription "TICKET_LIST_CHANGED" · useQueryState "pipelineId" · useQueryState "inPreview"
- [x] `/frontline/:topicId/kbsettings` (TopicSettingsPage) → `ui/src/knowledgebase/TopicSettingsPage.tsx` at `/frontline/knowledgebase/:topicId/kbsettings`: the topic's fields, then its deletion behind a typed "delete". Decision: the embed script and its toasts "Script copied to clipboard" and "Could not copy the script" wait for public routes; members without the topics permission read the topic. `frontline_ui/src/modules/knowledgebase/Main.tsx:35`

## status

### Pages

- [x] `/frontline/:id/pipelines/:pipelineId/statuses` (TicketStatusesPage) → `ui/src/pipelines/PipelineStatusesPage.tsx`, the six stages with their statuses, added and edited in a side panel, dragged or moved by keyboard into a new order, deleted after a confirm. Decision: "Automation created" goes until tickets publish a status change for core's automations to trigger on; the visibility checklist comes back with the permissions tab `frontline_ui/src/modules/channels/components/settings/Settings.tsx:194`

## survey

### Tables

- [ ] `frontline_surveys` from collection `frontline_surveys` (15 fields, draft `frontlineSurveys` in migration/schema-draft.ts) `frontline_api/src/modules/survey/db/definitions/surveys.ts:71`
- [ ] `frontline_survey_votes` from collection `frontline_survey_votes` (9 fields, draft `frontlineSurveyVotes` in migration/schema-draft.ts) `frontline_api/src/modules/survey/db/definitions/surveys.ts:106`

### Procedures

- [ ] query `surveyList` → procedure `surveyLists.get` (returns `SurveyListResponse`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `surveyDetail` → procedure `surveys.get` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `surveyTotalCount` → procedure `surveys.list` (returns `SurveyTotalCount`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveys` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyRequests` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyDetail` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] query `cpSurveyVotes` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:170`
- [ ] mutation `surveyAdd` → procedure `surveys.create` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyEdit` → procedure `surveys.update` (returns `Survey`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyRemove` → procedure `surveys.remove` (returns `[String]`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveyToggleStatus` → procedure `survey.surveyToggleStatus` (returns `Boolean`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `surveySendToConversation` → procedure `survey.surveySendToConversation` (returns `ConversationMessage`) `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveySubmit` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyAdd` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyEdit` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`
- [ ] mutation `cpSurveyRemove` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/schema/survey.ts:180`

### Pages

- [ ] `/frontline/:id/surveys/create` (SurveyCreatePage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:235`
  - files: 62, 2 only here: `modules/survey/components/SurveyCreate.tsx`, `pages/SurveyCreatePage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `conversationsTotalCount`, `integrations`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`; ticket: `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`
  - ui-modules: `ICustomerInline`, `SelectBrands`
  - keeps: useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · atomWithStorage "SURVEY_STORAGE_KEYS.STEP" · atomWithStorage "SURVEY_STORAGE_KEYS.GENERAL" · atomWithStorage "SURVEY_STORAGE_KEYS.CONTENT" · atomWithStorage "SURVEY_STORAGE_KEYS.CONFIRMATION" · atomWithStorage "SURVEY_STORAGE_KEYS.SETTED_DETAIL" · useQueryState "pipeline"
- [ ] `/frontline/:id/surveys/:surveyId` (SurveyDetailPage) `frontline_ui/src/modules/channels/components/settings/Settings.tsx:239`
  - files: 63, 2 only here: `modules/survey/components/SurveyEdit.tsx`, `pages/SurveyDetailPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `conversationsTotalCount`, `integrations`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`; ticket: `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`
  - ui-modules: `ICustomerInline`, `SelectBrands`
  - keeps: useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · atomWithStorage "SURVEY_STORAGE_KEYS.STEP" · atomWithStorage "SURVEY_STORAGE_KEYS.GENERAL" · atomWithStorage "SURVEY_STORAGE_KEYS.CONTENT" · atomWithStorage "SURVEY_STORAGE_KEYS.CONFIRMATION" · atomWithStorage "SURVEY_STORAGE_KEYS.SETTED_DETAIL" · useQueryState "pipeline"
- [ ] `/frontline/surveys` (SurveysView) `frontline_ui/src/modules/FrontlineMain.tsx:155`
  - files: 4, 2 only here: `modules/survey/components/survey-page/SurveyPageHeader.tsx`, `modules/survey/components/survey-page/SurveyView.tsx`
  - ui-modules: `createFavoriteBreadcrumb`, `PageHeader`
- [ ] `/frontline/surveys` (Surveys) `frontline_ui/src/modules/FrontlineMain.tsx:156`
  - files: 42, 2 only here: `modules/survey/components/survey-results/SurveyResultsBoard.tsx`, `pages/SurveysIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `conversationsTotalCount`, `integrations`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`
  - keeps: toast "resources-moved-to-channel" · useQueryState "status" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · useConfirm · confirm "confirm-delete-surveys" · toast "Survey removed" · toast "Survey approved" · confirm "confirm-delete-survey-title" · useMultiQueryState "['status', 'searchValue']" · toast "Survey rejected" · useMultiQueryState "['status', 'searchValue', 'channelId']" · fetchMore "{ variables: { cursor: direction === EnumCursorDirection.BAC" · atomWithStorage "surveyView"
- [ ] `/frontline/surveys/create` (SurveyCreatePage) `frontline_ui/src/modules/FrontlineMain.tsx:157`
  - files: 62, 2 only here: `modules/survey/components/SurveyCreate.tsx`, `pages/SurveyCreatePage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; inbox: `conversationsTotalCount`, `integrations`; survey: `surveyAdd`, `surveyDetail`, `surveyEdit`, `surveyList`, `surveyRemove`, `surveySendToConversation`, `surveyToggleStatus`, `surveyTotalCount`; ticket: `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipelines`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`
  - ui-modules: `ICustomerInline`, `SelectBrands`
  - keeps: useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · atomWithStorage "SURVEY_STORAGE_KEYS.STEP" · atomWithStorage "SURVEY_STORAGE_KEYS.GENERAL" · atomWithStorage "SURVEY_STORAGE_KEYS.CONTENT" · atomWithStorage "SURVEY_STORAGE_KEYS.CONFIRMATION" · atomWithStorage "SURVEY_STORAGE_KEYS.SETTED_DETAIL" · useQueryState "pipeline"

### Core calls

- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/customResolvers/survey.ts:24`
- [ ] core `customers.findOne` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:55`
- [ ] core `customers.getWidgetCustomer` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:78`
- [ ] core `customers.createMessengerCustomer` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/graphql/resolvers/mutations/clientPortal.ts:96`
- [ ] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/notifications.ts:37`
- [ ] core `cpNotifications.create` → **drop**: the new core has no client portal `frontline_api/src/modules/survey/notifications.ts:51`

## ticket

### Tables

- [x] `frontline_tickets_pipeline` from collection `frontline_tickets_pipeline` (24 fields, draft `frontlineTicketsPipeline` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`. Decision: the table is `frontline_pipelines`; deleting a channel deletes its pipelines. `numberSize` is an integer from 1 to 8 and `slaPolicy` is parsed. `order`, `state`, `isHideName` and `tagId` are gone, since no screen set them. The permission, layout and counter fields stay in the import map for their ports
- [x] `frontline_tickets_pipeline_status` from collection `frontline_tickets_pipeline_status` (14 fields, draft `frontlineTicketsPipelineStatus` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/status.ts:4`. Decision: the table is `frontline_pipeline_statuses`, `type` is checked to 1 to 6 and deleting a pipeline deletes its statuses. `state` and `probability` are gone; the visibility fields stay in the import map for the permissions port
- [x] `frontline_tickets` from collection `frontline_tickets` (33 fields, draft `frontlineTickets` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`. Decision: a ticket keeps its channel, and its pipeline and status are foreign keys, so a status in use can't go and deleting a channel deletes its tickets. `number` is unique per pipeline, `priority` is checked to 0 to 4, the SLA times are columns. Assigned members, tags, properties, teams, contacts and survey stay in the import map for their ports
- [ ] `frontline_ticket_activities` from collection `frontline_ticket_activities` (5 fields, draft `frontlineTicketActivities` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/activity.ts:26`
- [ ] `frontline_tickets_notes` from collection `frontline_tickets_notes` (8 fields, draft `frontlineTicketsNotes` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/note.ts:9`
- [ ] `frontline_ticket_configs` from collection `frontline_ticket_configs` (7 fields, draft `frontlineTicketConfigs` in migration/schema-draft.ts) `frontline_api/src/modules/ticket/db/definitions/ticketConfig.ts:36`
- [ ] `ticketPipelineSchema.isCheckDepartment` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.isCheckBranch` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `ticketPipelineSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22`
- [ ] `statusSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/status.ts:4`
- [ ] `ticketSchema.branchId` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`
  - note: waits for teams; the import map keeps the column for it
- [ ] `ticketSchema.departmentId` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/definitions/ticket.ts:35`
  - note: waits for teams; the import map keeps the column for it
- [ ] `ticketPipelineSchema.isCheckDepartment` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.isCheckBranch` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `ticketPipelineSchema.branchIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/pipeline.ts:14`
- [ ] `statusSchema.departmentIds` → plugin-owned: ids in `frontline_teams`, unchanged by the import `frontline_api/src/modules/ticket/db/status.ts:9`

### Procedures

- [ ] query `getTicketActivities` → procedure `ticketActivities.list` (returns `TicketActivityListResponse`) `frontline_api/src/modules/ticket/graphql/schemas/activity.ts:48`
- [ ] query `ticketGetNote` → procedure `ticketGetNotes.get` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [ ] query `ticketGetNotes` → procedure `ticketGetNotes.list` (returns `[TicketNote]`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [x] query `cpTicketGetNotes` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/note.ts:37`
- [ ] mutation `ticketCreateNote` → procedure `ticket.ticketCreateNote` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] mutation `ticketUpdateNote` → procedure `ticket.ticketUpdateNote` (returns `TicketNote`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [ ] mutation `ticketDeleteNote` → procedure `ticket.ticketDeleteNote` (returns `JSON`) `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [x] mutation `cpTicketCreateNote` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/note.ts:43`
- [x] query `getTicketPipeline` → `pipelines.get`, for the members of the pipeline's channel `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [x] query `getTicketPipelines` → `pipelines.list`, a channel's pipelines newest first by cursor, with the total. Decision: the `order` column is gone, since no screen set it `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [x] query `cpGetTicketPipelines` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:98`
- [x] mutation `createPipeline` → `pipelines.create`, which adds the six default statuses in the same transaction `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [x] mutation `updatePipeline` → `pipelines.update`, which saves the general and SLA tabs and moves a pipeline between channels the caller is an admin of `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [x] mutation `removePipeline` → `pipelines.remove`; its statuses go with it. It refuses while tickets use the pipeline, and `pipelines.statuses.remove` while tickets use the status `frontline_api/src/modules/ticket/graphql/schemas/pipeline.ts:125`
- [x] query `getTicketStatus` → folded into `pipelines.statuses.list`, which the status panel reads from `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [ ] query `getAccessibleTicketStatuses` → procedure `accessibleTicketStatuses.list` (returns `[TicketStatusChoice!]!`) `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
  - note: waits for the permissions tab, which limits statuses by department; until then a member moves to any status of the pipeline
- [x] query `getTicketStatusesChoicesPipeline` → folded into `pipelines.statuses.list` `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [x] query `getTicketStatusesByType` → `pipelines.statuses.list`, a pipeline's statuses by type and order in one call instead of one per type `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [x] query `cpGetTicketStatus` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/status.ts:42`
- [x] mutation `addTicketStatus` → `pipelines.statuses.create`, placed last in its stage while the channel is locked, so two adds never share a place `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [x] mutation `updateTicketStatus` → `pipelines.statuses.update` for name, description and colour, and `pipelines.statuses.reorder`, a stage's whole order in one call that refuses a stale list `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [x] mutation `deleteTicketStatus` → `pipelines.statuses.remove`, after the page confirms `frontline_api/src/modules/ticket/graphql/schemas/status.ts:60`
- [x] query `getTicket` → `tickets.get`, for the members of the ticket's channel `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [x] query `getTickets` → `tickets.list`, the tickets of the caller's channels by cursor with the total, filtered by core's filter rules on name, number, channel, pipeline, status, priority, assignee, state, both SLA states, creator and five dates, sorted by created or updated time either way `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [x] query `cpGetTickets` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [x] query `cpGetTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [x] query `cpGetTicketTotalCount` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:203`
- [x] mutation `createTicket` → `tickets.create`, numbered and given its SLA due times in the same transaction. Decision: numbers count per pipeline under a lock, and a pipeline without a number size leaves `number` empty instead of a timestamp `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [x] mutation `updateTicket` → `tickets.update` for the fields, archive and another status of its pipeline, and `tickets.bulkUpdate` for the selection's bar, which also moves to another pipeline, each one transaction `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [x] mutation `removeTicket` → `tickets.bulkRemove`, one ticket or many in one transaction. Decision: only the channel's admins delete `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [x] mutation `cpCreateTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [x] mutation `cpUpdateTicket` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/graphql/schemas/ticket.ts:212`
- [ ] query `ticketConfigs` → procedure `ticketConfigs.list` (returns `[TicketConfig]`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
  - note: waits for the configs tab, a port of its own
- [ ] query `ticketConfigDetail` → procedure `ticketConfigs.get` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
  - note: waits for the configs tab, a port of its own
- [ ] query `ticketConfig` → procedure `ticketConfigs.get` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:88`
  - note: waits for the configs tab, a port of its own
- [ ] mutation `ticketSaveConfig` → procedure `ticket.ticketSaveConfig` (returns `TicketConfig!`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:94`
  - note: waits for the configs tab, a port of its own
- [ ] mutation `ticketRemoveConfig` → procedure `ticket.ticketRemoveConfig` (returns `TicketConfig`) `frontline_api/src/modules/ticket/graphql/schemas/ticketConfig.ts:94`
  - note: waits for the configs tab, a port of its own

### Pages

- [x] `/frontline/tickets` (Ticket) → `ui/src/modules/tickets/TicketsPage.tsx` on core's list screen: core's filter bar on every field the old page filtered by plus SLA state and dates, a sort menu, and Display for the list grouped by status, the board and the table. A ticket is `frontline:ticket` in core's side panel; Create ticket and each status's "+" draft one there, and the selection's bar assigns, sets priority or status, moves to a pipeline, archives and deletes. Decision: filters and sort live in the address, delete shows only to the channel's admins. Assigned members, tags, properties, segments, branches, departments, export, import and live updates wait for their ports `frontline_ui/src/modules/FrontlineMain.tsx:125`
  - files: 99, 33 only here: `modules/ticket/components/add-ticket/AddTicketSheet.tsx`, `modules/ticket/components/ticket-command-bar/TicketActions.tsx`, `modules/ticket/components/ticket-command-bar/TicketCommandbar.tsx`, `modules/ticket/components/ticket-command-bar/TicketsArchive.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignedMembers.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignTo.tsx`, `modules/ticket/components/ticket-command-bar/TicketsDelete.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditPriority.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditStatus.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditTags.tsx`, `modules/ticket/components/ticket-command-bar/TicketsMoveToPipeline.tsx`, `modules/ticket/components/ticket-detail/TicketDetailLink.tsx`, `modules/ticket/components/ticket-selects/SelectStateTicket.tsx`, `modules/ticket/components/TicketCard.tsx`, `modules/ticket/components/TicketCardProperties.tsx`, `modules/ticket/components/TicketPageEffect.tsx`, `modules/ticket/components/TicketPipelineFallback.tsx`, `modules/ticket/components/TicketsBoard.tsx`, `modules/ticket/components/TicketsColumn.tsx`, `modules/ticket/components/TicketsFilter.tsx`, `modules/ticket/components/TicketsMoreColumn.tsx`, `modules/ticket/components/TicketsRecordTable.tsx`, `modules/ticket/components/TicketsSortControl.tsx`, `modules/ticket/components/TicketsTotalCount.tsx`, `modules/ticket/components/TicketsView.tsx`, `modules/ticket/constants/index.ts`, `modules/ticket/graphql/subscriptions/ticketListChanged.ts`, `modules/ticket/hooks/useCreateTicketRecord.ts`, `modules/ticket/hooks/useGetTickets.tsx`, `modules/ticket/hooks/useTicketDetailSheet.ts`, `modules/ticket/states/ticketSortState.ts`, `modules/ticket/states/ticketViewState.ts`, `pages/TicketIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `ticketListChanged`; inbox: `integrations`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketPipelines`, `getTickets`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `removeTicket`, `updateTicket`
  - ui-modules: `Can`, `CardDetailBadgeItem`, `CardDetailBadges`, `createFavoriteBreadcrumb`, `currentUserState`, `Export`, `formatFieldValue`, `getSidePanelRecordPath`, `hasFieldValue`, `IField`, `Import`, `IOpenRecordOptions`, `IUser`, `MembersInline`, `NEW_RECORD_ID`, `PageHeader`, `PanelFormRow`, `PropertiesFilter`, `SegmentsFilter`, `SelectBranches`, `SelectDepartments`, `SelectMember`, `TagsSelect`, `useFields`, `useGetTags`, `usePermissionCheck`, `useSelectMemberContext`, `useSidePanel`, `useUsers`
  - keeps: useScopedHotkeys "c" · useQueryState "pipelineId" · useConfirm · confirm "Are you sure you want to delete the {{count}} selected tickets?" · toast "Ticket deleted successfully" · useMultiQueryState "[ TICKETS_DETAIL_QUERY_KEY, 'panel', ]" · useQueryState "assignee" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "priority" · useQueryState "state" · useQueryState "statusId" · useSidePanel · useQueryState "channelId" · toast "You do not have permission to move tickets out of this status" · toast "You do not have permission to move tickets to this status" · useMultiQueryState "[ 'searchValue', 'assignee', 'priority', 'statusId', 'pipeli" · toast "Ticket ID is missing" · confirm "Are you sure you want to delete this ticket?" · subscribeToMore "{ document: TICKET_LIST_CHANGED, variables: { filter: variab" · fetchMore "{ variables: { filter: { ...variables, cursor: direction ===" · atomWithStorage "ticketSort" · atomWithStorage "ticketSortDirection" · atomWithStorage "ticketView"
- [ ] `/frontline/tickets/:ticketId` (TicketDetail) `frontline_ui/src/modules/FrontlineMain.tsx:126`
  - files: 161, 54 only here: `modules/activity/components/ActivityAssignee.tsx`, `modules/activity/components/ActivityAuthor.tsx`, `modules/activity/components/ActivityDate.tsx`, `modules/activity/components/ActivityDescription.tsx`, `modules/activity/components/ActivityFormSubmission.tsx`, `modules/activity/components/ActivityItem.tsx`, `modules/activity/components/ActivityItemWrapper.tsx`, `modules/activity/components/ActivityList.tsx`, `modules/activity/components/ActivityNote.tsx`, `modules/activity/components/ActivityPriority.tsx`, `modules/activity/components/ActivityStatus.tsx`, `modules/activity/components/ActivityTimelineItem.tsx`, `modules/activity/components/CreatorInfo.tsx`, `modules/activity/components/Name.tsx`, `modules/activity/components/NoteAttachments.tsx`, `modules/activity/components/NoteAudienceHint.tsx`, `modules/activity/components/NoteInput.tsx`, `modules/activity/components/NoteInputReadOnly.tsx`, `modules/activity/components/NoteInputToolbar.tsx`, `modules/activity/constants.ts`, `modules/activity/context/ActivityListContext.tsx`, `modules/activity/graphql/mutations/createTicketNote.ts`, `modules/activity/graphql/mutations/retryTicketNoteMail.ts`, `modules/activity/graphql/queries/getActivityLogs.ts`, `modules/activity/graphql/queries/getTicketNote.ts`, `modules/activity/graphql/queries/getTicketReplyTarget.ts`, `modules/activity/graphql/subscriptions/activityChanged.ts`, `modules/activity/hooks/useActivities.tsx`, `modules/activity/hooks/useCreateTicketNote.tsx`, `modules/activity/hooks/useGetTicketNote.tsx`, `modules/activity/hooks/useNoteAttachments.tsx`, `modules/activity/hooks/useNoteTemplateSuggestions.tsx`, `modules/activity/hooks/useRetryTicketNoteMail.tsx`, `modules/activity/hooks/useTicketReplyTarget.tsx`, `modules/activity/types.ts`, `modules/activity/utils/mailBody.ts`, `modules/activity/utils/noteBlocks.ts`, `modules/activity/utils/noteKind.ts`, `modules/ticket/components/attachments/AttachmentUploader.tsx`, `modules/ticket/components/attachments/TicketAttachments.tsx`, `modules/ticket/components/attachments/UnverifiedAttachmentCover.tsx`, `modules/ticket/components/ticket-detail/TicketDetailActions.tsx`, `modules/ticket/components/ticket-detail/TicketPipelineProperties.tsx`, `modules/ticket/graphql/queries/getTicket.ts`, `modules/ticket/graphql/subscriptions/ticketChanged.ts`, `modules/ticket/hooks/useGetTicket.tsx`, `modules/ticket/hooks/useTicketCustomFieldEdit.tsx`, `modules/ticket/hooks/useTicketDetailPermissions.ts`, `modules/ticket/hooks/useUnverifiedAttachments.ts`, `modules/ticket/states/ticketAttachmentOperationsState.ts`, `modules/ticket/types/attachments.ts`, `modules/ticket/utils/ticketAttachments.ts`, `pages/TicketDetailPage.tsx`, `widgets/record-panel/TicketPanelDetail.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `ticketActivityChanged`, `ticketChanged`; inbox: `integrations`; integrations: `mailTicketNoteRetry`, `mailTicketReplyTarget`; response: `responseTemplates`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicket`, `getTicketActivities`, `getTicketPipeline`, `getTicketPipelines`, `getTickets`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `removeTicket`, `ticketCreateNote`, `ticketGetNote`, `updateTicket`
  - ui-modules: `AssignMemberInEditor`, `ContactRecordChip`, `currentUserState`, `CustomersInline`, `EditorMentionItem`, `FieldsInGroup`, `IFieldMutation`, `IUser`, `MembersInline`, `MultipleFieldsInGroup`, `mutateFunction`, `PageHeader`, `PanelDescriptionField`, `PanelField`, `PanelFormRow`, `PropertyGroupCard`, `PropertyGroupShell`, `RecordSidePanel`, `SelectBranches`, `SelectDepartments`, `SelectMember`, `TagsSelect`, `useFieldGroups`, `useFields`, `usePermissionCheck`, `useSelectMemberContext`, `useSidePanel`, `useUsers`
  - keeps: toast "The reply was saved, but the email was not delivered" · useScopedHotkeys "mod+enter" · useSubscription "ACTIVITY_CHANGED" · toast "uploading-file" · toast "file-uploaded-successfully" · toast "attachment-removed" · toast "failed-to-insert-template" · toast "Email sent" · toast "Not delivered" · useQueryState "channelId" · useQueryState "queryKey || 'channelId'" · toast "Add a question and at least 2 options" · toast "{{name}} exceeds the {{size}} MB attachment limit" · toast "Telegram attachments must total 50 MB or less per message" · toast "You can attach up to 10 files to one message" · toast "Upload failed" · toast "File uploaded successfully!" · toast "Attachment removed" · toast "Failed to insert template" · fetchMore "{ variables: { filter: { ...baseFilter, cursor: pageInfo?.en" · useConfirm · toast "upload-failed" · confirm "{ message: `Are you sure you want to delete "${attachment.na" · confirm "confirm-delete-ticket" · toast "ticket-deleted-successfully" · useQueryState "assignee" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "priority" · useQueryState "statusId" · subscribeToMore "{ document: TICKET_CHANGED, variables: { _id: ticketId }, up" · useQueryState "state" · useQueryState "tab" · useSidePanel
- [x] `/frontline/` (Ticket) → redirects to `/frontline/tickets` `frontline_ui/src/modules/ticket-legacy/Main.tsx:14`
  - files: 99, 33 only here: `modules/ticket/components/add-ticket/AddTicketSheet.tsx`, `modules/ticket/components/ticket-command-bar/TicketActions.tsx`, `modules/ticket/components/ticket-command-bar/TicketCommandbar.tsx`, `modules/ticket/components/ticket-command-bar/TicketsArchive.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignedMembers.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignTo.tsx`, `modules/ticket/components/ticket-command-bar/TicketsDelete.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditPriority.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditStatus.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditTags.tsx`, `modules/ticket/components/ticket-command-bar/TicketsMoveToPipeline.tsx`, `modules/ticket/components/ticket-detail/TicketDetailLink.tsx`, `modules/ticket/components/ticket-selects/SelectStateTicket.tsx`, `modules/ticket/components/TicketCard.tsx`, `modules/ticket/components/TicketCardProperties.tsx`, `modules/ticket/components/TicketPageEffect.tsx`, `modules/ticket/components/TicketPipelineFallback.tsx`, `modules/ticket/components/TicketsBoard.tsx`, `modules/ticket/components/TicketsColumn.tsx`, `modules/ticket/components/TicketsFilter.tsx`, `modules/ticket/components/TicketsMoreColumn.tsx`, `modules/ticket/components/TicketsRecordTable.tsx`, `modules/ticket/components/TicketsSortControl.tsx`, `modules/ticket/components/TicketsTotalCount.tsx`, `modules/ticket/components/TicketsView.tsx`, `modules/ticket/constants/index.ts`, `modules/ticket/graphql/subscriptions/ticketListChanged.ts`, `modules/ticket/hooks/useCreateTicketRecord.ts`, `modules/ticket/hooks/useGetTickets.tsx`, `modules/ticket/hooks/useTicketDetailSheet.ts`, `modules/ticket/states/ticketSortState.ts`, `modules/ticket/states/ticketViewState.ts`, `pages/TicketIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `ticketListChanged`; inbox: `integrations`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketPipelines`, `getTickets`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `removeTicket`, `updateTicket`
  - ui-modules: `Can`, `CardDetailBadgeItem`, `CardDetailBadges`, `createFavoriteBreadcrumb`, `currentUserState`, `Export`, `formatFieldValue`, `getSidePanelRecordPath`, `hasFieldValue`, `IField`, `Import`, `IOpenRecordOptions`, `IUser`, `MembersInline`, `NEW_RECORD_ID`, `PageHeader`, `PanelFormRow`, `PropertiesFilter`, `SegmentsFilter`, `SelectBranches`, `SelectDepartments`, `SelectMember`, `TagsSelect`, `useFields`, `useGetTags`, `usePermissionCheck`, `useSelectMemberContext`, `useSidePanel`, `useUsers`
  - keeps: useScopedHotkeys "c" · useQueryState "pipelineId" · useConfirm · confirm "Are you sure you want to delete the {{count}} selected tickets?" · toast "Ticket deleted successfully" · useMultiQueryState "[ TICKETS_DETAIL_QUERY_KEY, 'panel', ]" · useQueryState "assignee" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "priority" · useQueryState "state" · useQueryState "statusId" · useSidePanel · useQueryState "channelId" · toast "You do not have permission to move tickets out of this status" · toast "You do not have permission to move tickets to this status" · useMultiQueryState "[ 'searchValue', 'assignee', 'priority', 'statusId', 'pipeli" · toast "Ticket ID is missing" · confirm "Are you sure you want to delete this ticket?" · subscribeToMore "{ document: TICKET_LIST_CHANGED, variables: { filter: variab" · fetchMore "{ variables: { filter: { ...variables, cursor: direction ===" · atomWithStorage "ticketSort" · atomWithStorage "ticketSortDirection" · atomWithStorage "ticketView"
- [x] `/frontline/` (Ticket) → the same redirect to `/frontline/tickets` `frontline_ui/src/modules/ticket/Main.tsx:14`
  - files: 99, 33 only here: `modules/ticket/components/add-ticket/AddTicketSheet.tsx`, `modules/ticket/components/ticket-command-bar/TicketActions.tsx`, `modules/ticket/components/ticket-command-bar/TicketCommandbar.tsx`, `modules/ticket/components/ticket-command-bar/TicketsArchive.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignedMembers.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignTo.tsx`, `modules/ticket/components/ticket-command-bar/TicketsDelete.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditPriority.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditStatus.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditTags.tsx`, `modules/ticket/components/ticket-command-bar/TicketsMoveToPipeline.tsx`, `modules/ticket/components/ticket-detail/TicketDetailLink.tsx`, `modules/ticket/components/ticket-selects/SelectStateTicket.tsx`, `modules/ticket/components/TicketCard.tsx`, `modules/ticket/components/TicketCardProperties.tsx`, `modules/ticket/components/TicketPageEffect.tsx`, `modules/ticket/components/TicketPipelineFallback.tsx`, `modules/ticket/components/TicketsBoard.tsx`, `modules/ticket/components/TicketsColumn.tsx`, `modules/ticket/components/TicketsFilter.tsx`, `modules/ticket/components/TicketsMoreColumn.tsx`, `modules/ticket/components/TicketsRecordTable.tsx`, `modules/ticket/components/TicketsSortControl.tsx`, `modules/ticket/components/TicketsTotalCount.tsx`, `modules/ticket/components/TicketsView.tsx`, `modules/ticket/constants/index.ts`, `modules/ticket/graphql/subscriptions/ticketListChanged.ts`, `modules/ticket/hooks/useCreateTicketRecord.ts`, `modules/ticket/hooks/useGetTickets.tsx`, `modules/ticket/hooks/useTicketDetailSheet.ts`, `modules/ticket/states/ticketSortState.ts`, `modules/ticket/states/ticketViewState.ts`, `pages/TicketIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `ticketListChanged`; inbox: `integrations`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketPipelines`, `getTickets`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `removeTicket`, `updateTicket`
  - ui-modules: `Can`, `CardDetailBadgeItem`, `CardDetailBadges`, `createFavoriteBreadcrumb`, `currentUserState`, `Export`, `formatFieldValue`, `getSidePanelRecordPath`, `hasFieldValue`, `IField`, `Import`, `IOpenRecordOptions`, `IUser`, `MembersInline`, `NEW_RECORD_ID`, `PageHeader`, `PanelFormRow`, `PropertiesFilter`, `SegmentsFilter`, `SelectBranches`, `SelectDepartments`, `SelectMember`, `TagsSelect`, `useFields`, `useGetTags`, `usePermissionCheck`, `useSelectMemberContext`, `useSidePanel`, `useUsers`
  - keeps: useScopedHotkeys "c" · useQueryState "pipelineId" · useConfirm · confirm "Are you sure you want to delete the {{count}} selected tickets?" · toast "Ticket deleted successfully" · useMultiQueryState "[ TICKETS_DETAIL_QUERY_KEY, 'panel', ]" · useQueryState "assignee" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "priority" · useQueryState "state" · useQueryState "statusId" · useSidePanel · useQueryState "channelId" · toast "You do not have permission to move tickets out of this status" · toast "You do not have permission to move tickets to this status" · useMultiQueryState "[ 'searchValue', 'assignee', 'priority', 'statusId', 'pipeli" · toast "Ticket ID is missing" · confirm "Are you sure you want to delete this ticket?" · subscribeToMore "{ document: TICKET_LIST_CHANGED, variables: { filter: variab" · fetchMore "{ variables: { filter: { ...variables, cursor: direction ===" · atomWithStorage "ticketSort" · atomWithStorage "ticketSortDirection" · atomWithStorage "ticketView"
- [x] `/frontline/tickets` (Ticket) → `ui/src/modules/tickets/TicketsPage.tsx`, as above `frontline_ui/src/modules/ticket/Main.tsx:15`
  - files: 99, 33 only here: `modules/ticket/components/add-ticket/AddTicketSheet.tsx`, `modules/ticket/components/ticket-command-bar/TicketActions.tsx`, `modules/ticket/components/ticket-command-bar/TicketCommandbar.tsx`, `modules/ticket/components/ticket-command-bar/TicketsArchive.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignedMembers.tsx`, `modules/ticket/components/ticket-command-bar/TicketsAssignTo.tsx`, `modules/ticket/components/ticket-command-bar/TicketsDelete.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditPriority.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditStatus.tsx`, `modules/ticket/components/ticket-command-bar/TicketsEditTags.tsx`, `modules/ticket/components/ticket-command-bar/TicketsMoveToPipeline.tsx`, `modules/ticket/components/ticket-detail/TicketDetailLink.tsx`, `modules/ticket/components/ticket-selects/SelectStateTicket.tsx`, `modules/ticket/components/TicketCard.tsx`, `modules/ticket/components/TicketCardProperties.tsx`, `modules/ticket/components/TicketPageEffect.tsx`, `modules/ticket/components/TicketPipelineFallback.tsx`, `modules/ticket/components/TicketsBoard.tsx`, `modules/ticket/components/TicketsColumn.tsx`, `modules/ticket/components/TicketsFilter.tsx`, `modules/ticket/components/TicketsMoreColumn.tsx`, `modules/ticket/components/TicketsRecordTable.tsx`, `modules/ticket/components/TicketsSortControl.tsx`, `modules/ticket/components/TicketsTotalCount.tsx`, `modules/ticket/components/TicketsView.tsx`, `modules/ticket/constants/index.ts`, `modules/ticket/graphql/subscriptions/ticketListChanged.ts`, `modules/ticket/hooks/useCreateTicketRecord.ts`, `modules/ticket/hooks/useGetTickets.tsx`, `modules/ticket/hooks/useTicketDetailSheet.ts`, `modules/ticket/states/ticketSortState.ts`, `modules/ticket/states/ticketViewState.ts`, `pages/TicketIndexPage.tsx`
  - calls: channel: `channelAdd`, `channelAddMembers`, `channelMoveResources`, `channelRemove`, `channelRemoveMember`, `channelUpdate`, `channelUpdateMember`, `getChannel`, `getChannelMembers`, `getChannels`, `getMyChannels`, `getPersonalChannel`; core: `ticketListChanged`; inbox: `integrations`; ticket: `addTicketStatus`, `createPipeline`, `getAccessibleTicketStatuses`, `getTicketPipeline`, `getTicketPipelines`, `getTickets`, `getTicketStatus`, `getTicketStatusesByType`, `getTicketStatusesChoicesPipeline`, `removeTicket`, `updateTicket`
  - ui-modules: `Can`, `CardDetailBadgeItem`, `CardDetailBadges`, `createFavoriteBreadcrumb`, `currentUserState`, `Export`, `formatFieldValue`, `getSidePanelRecordPath`, `hasFieldValue`, `IField`, `Import`, `IOpenRecordOptions`, `IUser`, `MembersInline`, `NEW_RECORD_ID`, `PageHeader`, `PanelFormRow`, `PropertiesFilter`, `SegmentsFilter`, `SelectBranches`, `SelectDepartments`, `SelectMember`, `TagsSelect`, `useFields`, `useGetTags`, `usePermissionCheck`, `useSelectMemberContext`, `useSidePanel`, `useUsers`
  - keeps: useScopedHotkeys "c" · useQueryState "pipelineId" · useConfirm · confirm "Are you sure you want to delete the {{count}} selected tickets?" · toast "Ticket deleted successfully" · useMultiQueryState "[ TICKETS_DETAIL_QUERY_KEY, 'panel', ]" · useQueryState "assignee" · useQueryState "channel" · useQueryState "pipeline" · useQueryState "priority" · useQueryState "state" · useQueryState "statusId" · useSidePanel · useQueryState "channelId" · toast "You do not have permission to move tickets out of this status" · toast "You do not have permission to move tickets to this status" · useMultiQueryState "[ 'searchValue', 'assignee', 'priority', 'statusId', 'pipeli" · toast "Ticket ID is missing" · confirm "Are you sure you want to delete this ticket?" · subscribeToMore "{ document: TICKET_LIST_CHANGED, variables: { filter: variab" · fetchMore "{ variables: { filter: { ...variables, cursor: direction ===" · atomWithStorage "ticketSort" · atomWithStorage "ticketSortDirection" · atomWithStorage "ticketView"

### Core calls

- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/db/models/Ticket.ts:205`
  - note: waits for custom properties; zod checks every field tickets have now
- [x] core `users.findOne` → contract: the pipelines list names the creator with `MemberInline` over `memberQueries`, so the API needs no `users:read` `frontline_api/src/modules/ticket/graphql/resolvers/customResolvers/pipeline.ts:11`
- [ ] core `users.findOne` → sdk `users.get` (scope users:read) `frontline_api/src/modules/ticket/graphql/resolvers/customResolvers/status.ts:24`
  - note: waits for the permissions tab, which names a status's members
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/graphql/resolvers/mutations/ticket.ts:26`
  - note: waits for custom properties; zod checks every field tickets have now
- [ ] core `users.find` → sdk `users.list` (scope users:read; search, ids, isActive, role) `frontline_api/src/modules/ticket/meta/automations/actions/createTicketAction.ts:212`
  - note: waits for automations
- [ ] core `fields.validateFieldValues` → plugin-owned `zod in the procedure input` `frontline_api/src/modules/ticket/meta/automations/actions/createTicketAction.ts:311`
  - note: waits for automations
- [ ] core `tags.find` → plugin-owned `frontline_tags` (core's tags are for customers and companies (decision 9)) `frontline_api/src/modules/ticket/meta/fields/fieldUtils.ts:253`
  - note: waits for tags; the import map keeps `tag_ids`
- [x] core `cpUsers.get` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/utils/cpNotifications.ts:80`
- [x] core `cpNotifications.create` → **drop**: the new core has no client portal `frontline_api/src/modules/ticket/utils/cpNotifications.ts:116`
- [ ] core `customers.find` → sdk `customers.list` (scope customers:read; search, ids, state, tagIds, companyId, filter) `frontline_api/src/modules/ticket/utils/nameAndNumber.ts:84`
  - note: waits for customers and companies on tickets; the import map keeps `customer_id`
- [ ] core `companies.find` → sdk `companies.list` (scope customers:read) `frontline_api/src/modules/ticket/utils/nameAndNumber.ts:100`
  - note: waits for customers and companies on tickets; the import map keeps `company_id`
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/ticket/utils/pipelineProperties.ts:15`
  - note: waits for custom properties
- [ ] core `branches.findOne` → plugin-owned `frontline_teams` (the plugin's departments and branches; members in frontline_team_members, names from users.list (users:read)) `frontline_api/src/modules/ticket/utils/slaCalendar.ts:26`
  - note: waits for teams; until then SLA due times count calendar hours, not a branch's working hours
- [ ] core `<module>.findWithChild` → **gap**: not in migration/core-map.ts yet `frontline_api/src/modules/ticket/utils/teamMemberRestriction.ts:29`
  - note: waits for teams
- [ ] core `configs.getConfigs` → plugin-owned `frontline_settings` (country and currency: organizations.current (sdk)) `frontline_api/src/modules/ticket/utils/teamMemberRestriction.ts:50`
  - note: waits for teams
- [ ] core `fields.find` → plugin-owned `frontline_fields` (core custom fields cover customers, companies and products) `frontline_api/src/modules/ticket/utils/ticketConfig.ts:30`
  - note: waits for the configs tab
- [ ] core `departments.findWithChild` → plugin-owned `frontline_teams` (the plugin's departments and branches; members in frontline_team_members, names from users.list (users:read)) `frontline_api/src/modules/ticket/utils/ticketVisibility.ts:107`
  - note: waits for teams and the permissions tab; until then a channel's members see all its tickets

### Events

- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:165`
  - note: waits for audit events across the plugin
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:333`
  - note: waits for audit events across the plugin
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:386`
  - note: waits for audit events across the plugin
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:418`
  - note: waits for audit events across the plugin
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:461`
  - note: waits for audit events across the plugin
- [ ] `sendDbEventLog` → sdk `core_record_audit() in the same transaction` (or audit.record (audit:write)) `frontline_api/src/modules/ticket/db/models/Ticket.ts:476`
  - note: waits for audit events across the plugin
