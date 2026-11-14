// Draft tables for frontline, written by migration/checklist.ts from the Mongoose
// schemas. Nothing imports this file: move a table into api/src/db/schema.ts when
// you port its module, pick real types (integer, enums, foreign keys), then run
// `pnpm db:generate` and add its core_enable_tenant_rls line (schema-change skill).
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { table } from '../api/src/db/table.ts';

/** From `frontline_tickets_pipeline` (frontline_api/src/modules/ticket/db/definitions/pipeline.ts:22). */
export const frontlineTicketsPipeline = table(
  'tickets_pipeline',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(), // String
    userId: text(), // String
    description: text(), // String
    channelId: text().notNull(), // String
    order: doublePrecision(), // Number
    state: text(), // String
    isCheckDate: boolean(), // Boolean
    isCheckUser: boolean(), // Boolean
    isCheckDepartment: boolean(), // Boolean
    isCheckBranch: boolean(), // Boolean
    isHideName: boolean(), // Boolean
    excludeCheckUserIds: text().array(), // [String]
    numberConfig: text(), // String
    numberSize: text(), // String
    nameConfig: text(), // String
    lastNum: text(), // String
    departmentIds: text().array(), // [String]
    branchIds: text().array(), // [String]
    tagId: text(), // String
    visibility: text(), // String
    memberIds: text().array(), // [String]
    createLayout: jsonb(), // [[String]]
    slaPolicy: jsonb(), // slaPolicySchema
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_tickets_pipeline_org_idx').on(t.orgId)],
);

/** From `frontline_tickets_pipeline_status` (frontline_api/src/modules/ticket/db/definitions/status.ts:4). */
export const frontlineTicketsPipelineStatus = table(
  'tickets_pipeline_status',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(), // String
    description: text(), // String
    pipelineId: text().notNull(), // String
    color: text(), // String
    type: doublePrecision().notNull(), // Number
    order: doublePrecision().notNull(), // Number
    visibilityType: text(), // String
    memberIds: text().array(), // [String]
    canMoveMemberIds: text().array(), // [String]
    canEditMemberIds: text().array(), // [String]
    departmentIds: text().array(), // [String]
    state: text(), // String
    probability: doublePrecision(), // Number
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_tickets_pipeline_status_org_idx').on(t.orgId)],
);

/** From `frontline_tickets` (frontline_api/src/modules/ticket/db/definitions/ticket.ts:35). */
export const frontlineTickets = table(
  'tickets',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text(), // String
    channelId: text(), // String
    stageId: text(), // String
    pipelineId: text(), // String
    statusId: text(), // String
    state: text(), // String
    description: text(), // String
    type: text(), // String
    priority: doublePrecision(), // Number
    branchId: text(), // String
    departmentId: text(), // String
    assigneeId: text(), // String
    assignedMembers: text().array(), // [String]
    createdBy: text(), // String
    updatedBy: text(), // String
    statusChangedBy: text(), // String
    attachments: jsonb(), // [attachmentSchema]
    labelIds: text().array(), // [String]
    tagIds: text().array(), // [String]
    userId: text(), // String
    statusChangedDate: timestamp({ withTimezone: true }), // Date
    startDate: timestamp({ withTimezone: true }), // Date
    targetDate: timestamp({ withTimezone: true }), // Date
    number: text(), // String
    statusType: doublePrecision(), // Number
    subscribedUserIds: text().array(), // [String]
    propertiesData: jsonb(), // Mixed
    customerId: text(), // String
    companyId: text(), // String
    customerFieldData: jsonb(), // Mixed
    sourceSurvey: jsonb(), // ticketSourceSurveySchema
    sla: jsonb(), // ticketSlaSchema
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_tickets_org_idx').on(t.orgId)],
);

/** From `frontline_ticket_activities` (frontline_api/src/modules/ticket/db/definitions/activity.ts:26). */
export const frontlineTicketActivities = table(
  'ticket_activities',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    action: text().notNull(), // String
    contentId: text().notNull(), // String
    module: text().notNull(), // String
    metadata: jsonb(), // metadataSchema
    createdBy: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_ticket_activities_org_idx').on(t.orgId)],
);

/** From `frontline_tickets_notes` (frontline_api/src/modules/ticket/db/definitions/note.ts:9). */
export const frontlineTicketsNotes = table(
  'tickets_notes',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    content: text().notNull(), // String
    contentId: text().notNull(), // String
    createdBy: text().notNull(), // String
    mentions: text().array(), // [String]
    attachments: jsonb(), // [attachmentSchema]
    isInternal: boolean(), // Boolean
    statusId: text(), // String
    mailMessageId: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_tickets_notes_org_idx').on(t.orgId)],
);

/** From `frontline_ticket_configs` (frontline_api/src/modules/ticket/db/definitions/ticketConfig.ts:36). */
export const frontlineTicketConfigs = table(
  'ticket_configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(), // String
    pipelineId: text(), // String
    channelId: text(), // String
    selectedStatusId: text(), // String
    parentId: text().notNull(), // String
    formFields: jsonb(), // object
    propertyFields: jsonb(), // [TicketPropertyFieldSchema]
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_ticket_configs_org_idx').on(t.orgId)],
);

/** From `integrations` (frontline_api/src/modules/inbox/db/definitions/integrations.ts:310). */
export const frontlineIntegrations = table(
  'integrations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    createdUserId: text(), // String
    channelId: text(), // String
    brandId: text(), // String
    kind: text(), // String
    createdAt: jsonb(), // 'Date'
    name: text(), // String
    tagIds: text().array(), // [String]
    formId: text(), // String
    isActive: boolean(), // Boolean
    isConnected: boolean(), // Boolean
    webhookData: jsonb(), // webhookDataSchema
    formData: jsonb(), // leadDataSchema
    messengerData: jsonb(), // messengerDataSchema
    uiOptions: jsonb(), // uiOptionsSchema
    ticketConfigIds: text().array(), // [String]
  },
  (t) => [index('frontline_integrations_org_idx').on(t.orgId)],
);

/** From `conversations` (frontline_api/src/modules/inbox/db/definitions/conversations.ts:111). */
export const frontlineConversations = table(
  'conversations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    // Spread in the old schema, list its fields here: ...conversationSchemaOptions
    propertiesData: jsonb(), // Mixed
  },
  (t) => [index('frontline_conversations_org_idx').on(t.orgId)],
);

/** From `conversation_messages` (frontline_api/src/modules/inbox/db/definitions/conversationMessages.ts:60). */
export const frontlineConversationMessages = table(
  'conversation_messages',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    content: text(), // String
    attachments: jsonb(), // [attachmentSchema]
    mentionedUserIds: text().array(), // [String]
    conversationId: text(), // String
    internal: boolean(), // Boolean
    customerId: text(), // String
    visitorId: text(), // String
    fromBot: boolean(), // Boolean
    getStarted: boolean(), // Boolean
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    isCustomerRead: boolean(), // Boolean
    botData: jsonb(), // Object
    formWidgetData: jsonb(), // Object
    messengerAppData: jsonb(), // Object
    extraData: jsonb(), // Object
    messageKind: text(), // String
    providerData: jsonb(), // providerDataSchema
    replyTo: jsonb(), // replyToSchema
    reactions: jsonb(), // [reactionSchema]
    deliveryStatus: text(), // String
    expiresAt: timestamp({ withTimezone: true }), // Date
    engageData: jsonb(), // engageDataSchema
    contentType: text(), // String
    botId: text(), // String
    responseTemplateId: text(), // String
  },
  (t) => [index('frontline_conversation_messages_org_idx').on(t.orgId)],
);

/** From `facebook_accounts` (frontline_api/src/modules/integrations/facebook/db/definitions/accounts.ts:6). */
export const frontlineFacebookAccounts = table(
  'facebook_accounts',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text(), // String
    token: text(), // String
    tokenSecret: text(), // String
    scope: text(), // String
    expireDate: text(), // String
    name: text(), // String
    uid: text(), // String
    appId: text(), // String
  },
  (t) => [index('frontline_facebook_accounts_org_idx').on(t.orgId)],
);

/** From `customers_facebooks` (frontline_api/src/modules/integrations/facebook/db/definitions/customers.ts:4). */
export const frontlineCustomersFacebooks = table(
  'customers_facebooks',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    userId: text(), // String
    erxesApiId: text(), // String
    firstName: text(), // String
    lastName: text(), // String
    profilePic: text(), // String
    integrationId: text(), // String
  },
  (t) => [index('frontline_customers_facebooks_org_idx').on(t.orgId)],
);

/** From `conversations_facebooks` (frontline_api/src/modules/integrations/facebook/db/definitions/conversations.ts:5). */
export const frontlineConversationsFacebooks = table(
  'conversations_facebooks',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    timestamp: timestamp({ withTimezone: true }), // Date
    senderId: text(), // String
    recipientId: text(), // String
    integrationId: text(), // String
    content: text(), // String
    isBot: boolean(), // Boolean
    botId: text(), // String
    inputWait: jsonb(), // object
  },
  (t) => [index('frontline_conversations_facebooks_org_idx').on(t.orgId)],
);

/** From `conversation_messages_facebooks` (frontline_api/src/modules/integrations/facebook/db/definitions/conversationMessages.ts:5). */
export const frontlineConversationMessagesFacebooks = table(
  'conversation_messages_facebooks',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    content: text(), // String
    attachments: jsonb(), // [attachmentSchema]
    conversationId: text(), // String
    customerId: text(), // String
    visitorId: text(), // String
    fromBot: boolean(), // Boolean
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    isCustomerRead: boolean(), // Boolean
    internal: boolean(), // Boolean
    botId: text(), // String
    botData: jsonb(), // Object
    source: jsonb(), // Object
    messageKind: text(), // String
    providerData: jsonb(), // Mixed
    replyTo: jsonb(), // Mixed
    expiresAt: timestamp({ withTimezone: true }), // Date
    reactions: jsonb(), // [Mixed]
  },
  (t) => [index('frontline_conversation_messages_facebooks_org_idx').on(t.orgId)],
);

/** From `comment_conversations_facebook` (frontline_api/src/modules/integrations/facebook/db/definitions/comment_conversations.ts:5). */
export const frontlineCommentConversationsFacebook = table(
  'comment_conversations_facebook',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    postId: text(), // String
    comment_id: text(), // String
    recipientId: text(), // String
    senderId: text(), // String
    content: text(), // String
    erxesApiId: text(), // String
    customerId: text(), // String
    parentId: text(), // String
    integrationId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    attachments: jsonb(), // [attachmentSchema]
  },
  (t) => [index('frontline_comment_conversations_facebook_org_idx').on(t.orgId)],
);

/** From `comment_conversations_reply_facebook` (frontline_api/src/modules/integrations/facebook/db/definitions/comment_conversations_reply.ts:4). */
export const frontlineCommentConversationsReplyFacebook = table(
  'comment_conversations_reply_facebook',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    comment_id: text(), // String
    parentId: text(), // String
    postId: text(), // String
    recipientId: text(), // String
    senderId: text(), // String
    content: text(), // String
    customerId: text(), // String
    integrationId: text(), // String
    erxesApiId: text(), // String
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    attachments: jsonb(), // [attachmentSchema]
    isResolved: boolean(), // Boolean
  },
  (t) => [index('frontline_comment_conversations_reply_facebook_org_idx').on(t.orgId)],
);

/** From `comment_outbox_facebook` (frontline_api/src/modules/integrations/facebook/db/definitions/comment_outbox.ts:36). */
export const frontlineCommentOutboxFacebook = table(
  'comment_outbox_facebook',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    executionId: text().notNull(), // String
    actionId: text().notNull(), // String
    jobId: text().notNull(), // String
    pageId: text().notNull(), // String
    postId: text(), // String
    commentId: text().notNull(), // String
    senderId: text().notNull(), // String
    integrationId: text().notNull(), // String
    text: text(), // String
    attachments: jsonb(), // [Object]
    mentionSender: boolean(), // Boolean
    status: text(), // String
    sendAfter: timestamp({ withTimezone: true }).notNull(), // Date
    attempts: doublePrecision(), // Number
    sentAt: timestamp({ withTimezone: true }), // Date
    error: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_comment_outbox_facebook_org_idx').on(t.orgId)],
);

/** From `facebook_integrations` (frontline_api/src/modules/integrations/facebook/db/definitions/integrations.ts:4). */
export const frontlineFacebookIntegrations = table(
  'facebook_integrations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text(), // String
    accountId: text(), // String
    erxesApiId: text(), // String
    emailScope: text(), // String
    facebookPageIds: text().array(), // [String]
    email: text(), // String
    expiration: text(), // String
    facebookPageTokensMap: jsonb(), // Object
    healthStatus: text(), // String
    error: text(), // String
  },
  (t) => [index('frontline_facebook_integrations_org_idx').on(t.orgId)],
);

/** From `facebook_logs` (frontline_api/src/modules/integrations/facebook/db/definitions/logs.ts:4). */
export const frontlineFacebookLogs = table(
  'facebook_logs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    type: text(), // String
    value: jsonb(), // Object
    specialValue: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_facebook_logs_org_idx').on(t.orgId)],
);

/** From `posts_conversations_facebooks` (frontline_api/src/modules/integrations/facebook/db/definitions/postConversations.ts:3). */
export const frontlinePostsConversationsFacebooks = table(
  'posts_conversations_facebooks',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    postId: text(), // String
    timestamp: timestamp({ withTimezone: true }), // Date
    senderId: text(), // String
    recipientId: text(), // String
    integrationId: text(), // String
    content: text(), // String
    customerId: text(), // String
    permalink_url: text(), // String
    attachments: text().array(), // [String]
    metaCommentCount: doublePrecision(), // Number
    metaReactionCount: doublePrecision(), // Number
    metaShareCount: doublePrecision(), // Number
    metaSyncedAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_posts_conversations_facebooks_org_idx').on(t.orgId)],
);

/** From `facebook_configs` (frontline_api/src/modules/integrations/facebook/db/definitions/config.ts:4). */
export const frontlineFacebookConfigs = table(
  'facebook_configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    code: text(), // String
    value: jsonb(), // Object
  },
  (t) => [index('frontline_facebook_configs_org_idx').on(t.orgId)],
);

/** From `instagram_integrations` (frontline_api/src/modules/integrations/instagram/db/definitions/integrations.ts:4). */
export const frontlineInstagramIntegrations = table(
  'instagram_integrations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text(), // String
    accountId: text(), // String
    erxesApiId: text(), // String
    emailScope: text(), // String
    instagramPageId: text(), // String
    facebookPageId: text(), // String
    email: text(), // String
    expiration: text(), // String
    facebookPageTokensMap: jsonb(), // Object
    healthStatus: text(), // String
    error: text(), // String
  },
  (t) => [index('frontline_instagram_integrations_org_idx').on(t.orgId)],
);

/** From `instagram_accounts` (frontline_api/src/modules/integrations/instagram/db/definitions/accounts.ts:5). */
export const frontlineInstagramAccounts = table(
  'instagram_accounts',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text(), // String
    token: text(), // String
    tokenSecret: text(), // String
    scope: text(), // String
    expireDate: text(), // String
    name: text(), // String
    uid: text(), // String
  },
  (t) => [index('frontline_instagram_accounts_org_idx').on(t.orgId)],
);

/** From `instagram_customers` (frontline_api/src/modules/integrations/instagram/db/definitions/customers.ts:4). */
export const frontlineInstagramCustomers = table(
  'instagram_customers',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    userId: text(), // String
    erxesApiId: text(), // String
    firstName: text(), // String
    lastName: text(), // String
    profilePic: text(), // String
    integrationId: text(), // String
  },
  (t) => [index('frontline_instagram_customers_org_idx').on(t.orgId)],
);

/** From `instagram_conversations` (frontline_api/src/modules/integrations/instagram/db/definitions/conversations.ts:5). */
export const frontlineInstagramConversations = table(
  'instagram_conversations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    timestamp: timestamp({ withTimezone: true }), // Date
    senderId: text(), // String
    recipientId: text(), // String
    integrationId: text(), // String
    content: text(), // String
    isBot: boolean(), // Boolean
    botId: text(), // String
  },
  (t) => [index('frontline_instagram_conversations_org_idx').on(t.orgId)],
);

/** From `instagram_conversation_messages` (frontline_api/src/modules/integrations/instagram/db/definitions/conversationMessages.ts:11). */
export const frontlineInstagramConversationMessages = table(
  'instagram_conversation_messages',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    inboxSyncPending: boolean(), // Boolean
    processingToken: text(), // String
    processingUntil: timestamp({ withTimezone: true }), // Date
    content: text(), // String
    attachments: jsonb(), // [attachmentSchema]
    conversationId: text(), // String
    customerId: text(), // String
    visitorId: text(), // String
    fromBot: boolean(), // Boolean
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    isCustomerRead: boolean(), // Boolean
    internal: boolean(), // Boolean
    botId: text(), // String
    botData: jsonb(), // Object
    extraData: jsonb(), // Object
    messageKind: text(), // String
    providerData: jsonb(), // providerDataSchema
    replyTo: jsonb(), // replyToSchema
    reactions: jsonb(), // [Mixed]
    deliveryStatus: text(), // String
    expiresAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_instagram_conversation_messages_org_idx').on(t.orgId)],
);

/** From `instagram_comment_conversations` (frontline_api/src/modules/integrations/instagram/db/definitions/comment_conversations.ts:6). */
export const frontlineInstagramCommentConversations = table(
  'instagram_comment_conversations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    postId: text(), // String
    comment_id: text(), // String
    parentId: text(), // String
    recipientId: text(), // String
    senderId: text(), // String
    content: text(), // String
    erxesApiId: text(), // String
    inboxSyncPending: boolean(), // Boolean
    processingToken: text(), // String
    processingUntil: timestamp({ withTimezone: true }), // Date
    customerId: text(), // String
    isResolved: boolean(), // Boolean
    timestamp: timestamp({ withTimezone: true }), // Date
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    attachments: jsonb(), // [attachmentSchema]
  },
  (t) => [index('frontline_instagram_comment_conversations_org_idx').on(t.orgId)],
);

/** From `instagram_comment_conversations_reply` (frontline_api/src/modules/integrations/instagram/db/definitions/comment_conversations_reply.ts:6). */
export const frontlineInstagramCommentConversationsReply = table(
  'instagram_comment_conversations_reply',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    mid: text(), // String
    comment_id: text(), // String
    inboxSyncPending: boolean(), // Boolean
    processingToken: text(), // String
    processingUntil: timestamp({ withTimezone: true }), // Date
    parentId: text(), // String
    recipientId: text(), // String
    senderId: text(), // String
    content: text(), // String
    customerId: text(), // String
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    attachments: jsonb(), // [attachmentSchema]
    isResolved: boolean(), // Boolean
  },
  (t) => [index('frontline_instagram_comment_conversations_reply_org_idx').on(t.orgId)],
);

/** From `instagram_post_conversations` (frontline_api/src/modules/integrations/instagram/db/definitions/postConversations.ts:5). */
export const frontlineInstagramPostConversations = table(
  'instagram_post_conversations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    postId: text(), // String
    timestamp: timestamp({ withTimezone: true }), // Date
    senderId: text(), // String
    recipientId: text(), // String
    integrationId: text(), // String
    content: text(), // String
    customerId: text(), // String
    permalink_url: text(), // String
    metadataPending: boolean(), // Boolean
    attachments: text().array(), // [String]
  },
  (t) => [index('frontline_instagram_post_conversations_org_idx').on(t.orgId)],
);

/** From `instagram_logs` (frontline_api/src/modules/integrations/instagram/db/definitions/logs.ts:6). */
export const frontlineInstagramLogs = table(
  'instagram_logs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    type: text(), // String
    value: jsonb(), // Object
    specialValue: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_instagram_logs_org_idx').on(t.orgId)],
);

/** From `instagram_bots` (frontline_api/src/modules/integrations/instagram/db/definitions/bots.ts:12). */
export const frontlineInstagramBots = table(
  'instagram_bots',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text(), // String
    accountId: text(), // String
    uid: text(), // String
    pageId: text(), // String
    token: text(), // String
    persistentMenus: jsonb(), // [persistentMenuSchema]
    greetText: text(), // String
    tag: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    isEnabledBackBtn: boolean(), // Boolean
    backButtonText: text(), // String
  },
  (t) => [index('frontline_instagram_bots_org_idx').on(t.orgId)],
);

/** From `instagram_configs` (frontline_api/src/modules/integrations/instagram/db/definitions/config.ts:4). */
export const frontlineInstagramConfigs = table(
  'instagram_configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    code: text().notNull(), // String
    value: jsonb(), // Object
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_instagram_configs_org_idx').on(t.orgId)],
);

/** From `calls_integrations` (frontline_api/src/modules/integrations/call/db/definitions/integrations.ts:4). */
export const frontlineCallsIntegrations = table(
  'calls_integrations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxId: jsonb(), // field({ type: String, label: 'inbox id' })
    wsServer: jsonb(), // field({ type: String, label: 'web socket server' })
    phone: jsonb(), // field({ type: String, label: 'phone number' })
    operators: jsonb(), // field({ type: Object, label: 'Operator maps' })
    token: jsonb(), // field({ type: String, label: 'token' })
    queues: jsonb(), // field({ type: [String], label: 'queues' })
    queueNames: jsonb(), // field({ type: [String], label: 'queue names' })
    srcTrunk: jsonb(), // field({ type: String, label: 'inbound trunk name' })
    dstTrunk: jsonb(), // field({ type: String, label: 'outbound trunk name' })
  },
  (t) => [index('frontline_calls_integrations_org_idx').on(t.orgId)],
);

/** From `calls_customers` (frontline_api/src/modules/integrations/call/db/definitions/customers.ts:7). */
export const frontlineCallsCustomers = table(
  'calls_customers',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    primaryPhone: text(), // String
    inboxIntegrationId: text(), // String
    status: text(), // String
  },
  (t) => [index('frontline_calls_customers_org_idx').on(t.orgId)],
);

/** From `calls_history` (frontline_api/src/modules/integrations/call/db/definitions/histories.ts:4). */
export const frontlineCallsHistory = table(
  'calls_history',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    operatorPhone: jsonb(), // field({ type: String, label: 'operator number' })
    customerPhone: jsonb(), // field({ type: String, label: 'customer number' })
    callDuration: jsonb(), // field({ type: Number, label: 'duration' })
    callStartTime: jsonb(), // field({ type: Date, label: 'call start time' })
    callEndTime: jsonb(), // field({ type: Date, label: 'call end time' })
    callType: jsonb(), // field({ type: String, label: 'call type', // enum: ['incoming', 'outgoing'], })
    callStatus: jsonb(), // field({ type: String, label: 'status', enum: [ 'missed', 'connected', 'rejected', 'cancelled', 'active', 'transferred', 'cancelledToAnswered', ], default: 'missed', })
    acceptedUserId: jsonb(), // field({ type: String, label: 'call accepted operator id', })
    timeStamp: jsonb(), // field({ type: Number, label: 'call timestamp', })
    modifiedAt: jsonb(), // field({ type: Date, label: 'modified date' })
    createdAt: jsonb(), // field({ type: Date, label: 'created date', default: new Date() })
    createdBy: jsonb(), // field({ type: String, label: 'created By' })
    modifiedBy: jsonb(), // field({ type: String, label: 'updated By' })
    extensionNumber: jsonb(), // field({ type: String, label: 'extention number' })
    conversationId: jsonb(), // field({ type: String, label: 'erxes conversation id' })
    inboxIntegrationId: jsonb(), // field({ type: String, label: 'erxes integration id' })
    recordUrl: jsonb(), // field({ type: String, label: 'record url' })
    endedBy: jsonb(), // field({ type: String, label: `'Local' indicates the call was ended by Erxes, while 'remote' indicates the call was ended by the customer`, })
    queueName: jsonb(), // field({ type: String, label: 'queue name' })
    uniqueid: jsonb(), // field({ type: String, label: 'PBX call uniqueid (Call-ID) for end-to-end dedup', optional: true, })
  },
  (t) => [index('frontline_calls_history_org_idx').on(t.orgId)],
);

/** From `calls_configs` (frontline_api/src/modules/integrations/call/db/models/Configs.ts:11). */
export const frontlineCallsConfigs = table(
  'calls_configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    code: jsonb(), // field({ type: String, unique: true })
    value: jsonb(), // field({ type: Object })
  },
  (t) => [index('frontline_calls_configs_org_idx').on(t.orgId)],
);

/** From `calls_operators` (frontline_api/src/modules/integrations/call/db/definitions/operators.ts:4). */
export const frontlineCallsOperators = table(
  'calls_operators',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    userId: jsonb(), // field({ type: String, label: 'user id', unique: true })
    extension: jsonb(), // field({ type: String, label: 'Operator extension' })
    status: jsonb(), // field({ type: String, label: 'Operator extension', enum: ['unAvailable', 'idle', 'pause', 'unpause'], default: 'unAvailable', })
  },
  (t) => [index('frontline_calls_operators_org_idx').on(t.orgId)],
);

/** From `calls_cdr` (frontline_api/src/modules/integrations/call/db/definitions/cdrs.ts:3). */
export const frontlineCallsCdr = table(
  'calls_cdr',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxIntegrationId: text(), // String
    conversationId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    createdBy: text(), // String
    updatedBy: text(), // String
    acctId: text(), // String
    src: text(), // String
    dst: text(), // String
    dcontext: text(), // String
    clid: text(), // String
    channel: text(), // String
    lastapp: text(), // String
    lastdata: text(), // String
    start: timestamp({ withTimezone: true }), // Date
    answer: timestamp({ withTimezone: true }), // Date
    end: timestamp({ withTimezone: true }), // Date
    duration: doublePrecision(), // Number
    billsec: doublePrecision(), // Number
    disposition: text(), // String
    amaflags: text(), // String
    uniqueid: text(), // String
    userfield: text(), // String
    channelExt: text(), // String
    dstchannelExt: text(), // String
    service: text(), // String
    callerName: text(), // String
    dstanswer: text(), // String
    session: text(), // String
    actionOwner: text(), // String
    actionType: text(), // String
    srcTrunkName: text(), // String
    dstTrunkName: text(), // String
    natCall: text(), // String
    natCallPeer: text(), // String
    videoCall: text(), // String
    gdmsUniqueCode: text(), // String
    gdsCall: text(), // String
    gscCall: text(), // String
    waveSrcSeqid: text(), // String
    waveDstSeqid: text(), // String
    deviceInfo: text(), // String
    deviceInfoPeer: text(), // String
    recordfilesDesc: text(), // String
    recordfiles: text(), // String
    anonymousCall: text(), // String
    reason: text(), // String
    waveSrcHide: text(), // String
    waveDstHide: text(), // String
    newSrc: text(), // String
    sn: text(), // String
    recordUrl: text(), // String
    oldRecordUrl: text(), // String
  },
  (t) => [index('frontline_calls_cdr_org_idx').on(t.orgId)],
);

/** From `calls_queue_statistics` (frontline_api/src/modules/integrations/call/db/definitions/queueStatistics.ts:15). */
export const frontlineCallsQueueStatistics = table(
  'calls_queue_statistics',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    queuechairman: jsonb(), // field({ type: String, required: true })
    integrationId: jsonb(), // field({ type: String, required: true })
    queue: jsonb(), // field({ type: Number, required: true })
    totalCalls: jsonb(), // field({ type: Number, default: 0 })
    answeredCalls: jsonb(), // field({ type: Number, default: 0 })
    answeredRate: jsonb(), // field({ type: Number, default: 0 })
    abandonedCalls: jsonb(), // field({ type: Number, default: 0 })
    avgWait: jsonb(), // field({ type: Number, default: 0 })
    avgTalk: jsonb(), // field({ type: Number, default: 0 })
    vqTotalCalls: jsonb(), // field({ type: Number, default: 0 })
    slaRate: jsonb(), // field({ type: Number, default: 0 })
    vqSlaRate: jsonb(), // field({ type: Number, default: 0 })
    transferOutCalls: jsonb(), // field({ type: Number, default: 0 })
    transferOutRate: jsonb(), // field({ type: Number, default: 0 })
    abandonedRate: jsonb(), // field({ type: Number, default: 0 })
  },
  (t) => [index('frontline_calls_queue_statistics_org_idx').on(t.orgId)],
);

/** From `calls_sessions` (frontline_api/src/modules/integrations/call/db/definitions/callSessions.ts:19). */
export const frontlineCallsSessions = table(
  'calls_sessions',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    uniqueid: jsonb(), // field({ type: String, required: true, label: 'PBX uniqueid or SIP Call-ID', })
    linkedid: jsonb(), // field({ type: String, optional: true, label: 'PBX linkedid (call-wide id tying legs together)', })
    inboxIntegrationId: jsonb(), // field({ type: String, required: true, label: 'erxes integration id', })
    conversationId: jsonb(), // field({ type: String, optional: true, label: 'erxes conversation id', })
    customerId: jsonb(), // field({ type: String, optional: true, label: 'erxes customer id', })
    customerPhone: jsonb(), // field({ type: String, required: true })
    operatorPhone: jsonb(), // field({ type: String, optional: true })
    callType: jsonb(), // field({ type: String, enum: ['incoming', 'outgoing'], required: true, })
    status: jsonb(), // field({ type: String, enum: ['ringing', 'active', 'ended', 'missed', 'failed'], default: 'ringing', })
    queueName: jsonb(), // field({ type: String, optional: true })
    ringingOperators: jsonb(), // [operatorSchema]
    answeredBy: jsonb(), // field({ type: String, optional: true })
    answeredExtension: jsonb(), // field({ type: String, optional: true })
    startedAt: jsonb(), // field({ type: Date, required: true })
    answeredAt: jsonb(), // field({ type: Date, optional: true })
    endedAt: jsonb(), // field({ type: Date, optional: true })
    durationSec: jsonb(), // field({ type: Number, optional: true })
    hangupCause: jsonb(), // field({ type: String, optional: true })
    source: jsonb(), // field({ type: String, enum: ['cti', 'cdr', 'sip'], default: 'cti', })
    cdrAcctId: jsonb(), // field({ type: String, optional: true })
    recordUrl: jsonb(), // field({ type: String, optional: true })
    diversion: jsonb(), // field({ type: String, optional: true })
    raw: jsonb(), // field({ type: Schema.Types.Mixed, optional: true })
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_calls_sessions_org_idx').on(t.orgId)],
);

/** From `facebook_messengers_bots` (frontline_api/src/modules/integrations/facebook/db/definitions/bots.ts:99). */
export const frontlineFacebookMessengersBots = table(
  'facebook_messengers_bots',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text(), // String
    accountId: text(), // String
    uid: text(), // String
    pageId: text(), // String
    token: text(), // String
    persistentMenus: jsonb(), // [persistentMenuSchema]
    iceBreakers: jsonb(), // [iceBreakerSchema]
    getStartedText: text(), // String
    greetText: text(), // String
    handoffMessage: text(), // String
    automationActiveMessage: text(), // String
    handoffPauseMinutes: doublePrecision(), // Number
    tag: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    createdBy: text().notNull(), // String
    updatedBy: text().notNull(), // String
    isEnabledBackBtn: boolean(), // Boolean
    backButtonText: text(), // String
    health: jsonb(), // healthSchema
  },
  (t) => [index('frontline_facebook_messengers_bots_org_idx').on(t.orgId)],
);

/** From `discord_bots` (frontline_api/src/modules/integrations/discord/db/definitions/bots.ts:22). */
export const frontlineDiscordBots = table(
  'discord_bots',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(), // String
    applicationId: text().notNull(), // String
    token: text().notNull(), // String
    guildId: text(), // String
    guildName: text(), // String
    channelId: text(), // String
    description: text(), // String
    erxesApiId: text(), // String
    createdBy: text(), // String
    updatedBy: text(), // String
    health: jsonb(), // healthSchema
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_discord_bots_org_idx').on(t.orgId)],
);

/** From `customers_discord` (frontline_api/src/modules/integrations/discord/db/definitions/customers.ts:4). */
export const frontlineCustomersDiscord = table(
  'customers_discord',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    userId: text(), // String
    erxesApiId: text(), // String
    firstName: text(), // String
    lastName: text(), // String
    profilePic: text(), // String
    integrationId: text(), // String
  },
  (t) => [index('frontline_customers_discord_org_idx').on(t.orgId)],
);

/** From `conversations_discord` (frontline_api/src/modules/integrations/discord/db/definitions/conversations.ts:4). */
export const frontlineConversationsDiscord = table(
  'conversations_discord',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    timestamp: timestamp({ withTimezone: true }), // Date
    channelId: text(), // String
    channelName: text(), // String
    isThread: boolean(), // Boolean
    parentChannelId: text(), // String
    parentChannelName: text(), // String
    authorId: text(), // String
    guildId: text(), // String
    integrationId: text(), // String
    content: text(), // String
  },
  (t) => [index('frontline_conversations_discord_org_idx').on(t.orgId)],
);

/** From `conversation_messages_discord` (frontline_api/src/modules/integrations/discord/db/definitions/conversationMessages.ts:14). */
export const frontlineConversationMessagesDiscord = table(
  'conversation_messages_discord',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    messageId: text(), // String
    content: text(), // String
    attachments: jsonb(), // [attachmentSchema]
    attachmentIds: text().array(), // [String]
    replyTo: jsonb(), // replyToSchema
    conversationId: text(), // String
    customerId: text(), // String
    userId: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    deletedAt: timestamp({ withTimezone: true }), // Date
    internal: boolean(), // Boolean
    fromBot: boolean(), // Boolean
  },
  (t) => [index('frontline_conversation_messages_discord_org_idx').on(t.orgId)],
);

/** From `telegram_reactions` (frontline_api/src/modules/integrations/telegram/db/models/Reactions.ts:4). */
export const frontlineTelegramReactions = table(
  'telegram_reactions',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    integrationId: text().notNull(), // String
    chatId: text().notNull(), // String
    messageId: text().notNull(), // String
    actorId: text().notNull(), // String
    date: doublePrecision().notNull(), // Number
    updateId: doublePrecision().notNull(), // Number
    reactions: jsonb(), // [object]
  },
  (t) => [index('frontline_telegram_reactions_org_idx').on(t.orgId)],
);

/** From `telegram_bots` (frontline_api/src/modules/integrations/telegram/db/definitions/bots.ts:4). */
export const frontlineTelegramBots = table(
  'telegram_bots',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    botId: text().notNull(), // String
    erxesApiId: text(), // String
    botUsername: text(), // String
    botName: text().notNull(), // String
    token: text().notNull(), // String
    webhookSecret: text().notNull(), // String
    canJoinGroups: boolean(), // Boolean
    canReadAllGroupMessages: boolean(), // Boolean
    lastVerifiedAt: timestamp({ withTimezone: true }).notNull(), // Date
    createdBy: text().notNull(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_telegram_bots_org_idx').on(t.orgId)],
);

/** From `customers_telegram` (frontline_api/src/modules/integrations/telegram/db/definitions/customers.ts:4). */
export const frontlineCustomersTelegram = table(
  'customers_telegram',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    userId: text().notNull(), // String
    erxesApiId: text(), // String
    firstName: text(), // String
    lastName: text(), // String
    username: text(), // String
    integrationId: text().notNull(), // String
  },
  (t) => [index('frontline_customers_telegram_org_idx').on(t.orgId)],
);

/** From `conversations_telegram` (frontline_api/src/modules/integrations/telegram/db/definitions/conversations.ts:4). */
export const frontlineConversationsTelegram = table(
  'conversations_telegram',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    integrationId: text().notNull(), // String
    erxesApiId: text(), // String
    chatId: text().notNull(), // String
    chatType: text().notNull(), // String
    chatTitle: text(), // String
    topicName: text(), // String
    migratedToChatId: text(), // String
    messageThreadId: doublePrecision().notNull(), // Number
    timestamp: timestamp({ withTimezone: true }).notNull(), // Date
    content: text(), // String
  },
  (t) => [index('frontline_conversations_telegram_org_idx').on(t.orgId)],
);

/** From `conversation_messages_telegram` (frontline_api/src/modules/integrations/telegram/db/definitions/conversationMessages.ts:5). */
export const frontlineConversationMessagesTelegram = table(
  'conversation_messages_telegram',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    integrationId: text().notNull(), // String
    chatId: text().notNull(), // String
    messageId: text().notNull(), // String
    conversationId: text().notNull(), // String
    erxesApiId: text(), // String
    content: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull(), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
    attachments: jsonb(), // [attachmentSchema]
    attachmentFileIds: text().array(), // [String]
    metadata: jsonb(), // object
    pollId: text(), // String
    poll: jsonb(), // subdocument
    processedEditDate: doublePrecision(), // Number
    processedUpdateId: doublePrecision(), // Number
    pollUpdateId: doublePrecision(), // Number
    pollUpdateAt: timestamp({ withTimezone: true }), // Date
    customerId: text(), // String
    userId: text(), // String
    fromBot: boolean(), // Boolean
    senderName: text(), // String
    processingToken: text(), // String
    processingUntil: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_conversation_messages_telegram_org_idx').on(t.orgId)],
);

/** From `integrations_callpro` (frontline_api/src/modules/integrations/callpro/db/definitions/integrations.ts:4). */
export const frontlineIntegrationsCallpro = table(
  'integrations_callpro',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxId: text(), // String
    phoneNumber: text(), // String
    recordUrl: text(), // String
  },
  (t) => [index('frontline_integrations_callpro_org_idx').on(t.orgId)],
);

/** From `customers_callpro` (frontline_api/src/modules/integrations/callpro/db/definitions/customers.ts:4). */
export const frontlineCustomersCallpro = table(
  'customers_callpro',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    phoneNumber: text(), // String
    integrationId: text(), // String
    erxesApiId: text(), // String
  },
  (t) => [index('frontline_customers_callpro_org_idx').on(t.orgId)],
);

/** From `conversations_callpro` (frontline_api/src/modules/integrations/callpro/db/definitions/conversations.ts:4). */
export const frontlineConversationsCallpro = table(
  'conversations_callpro',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    erxesApiId: text(), // String
    state: text(), // String
    integrationId: text(), // String
    senderPhoneNumber: text(), // String
    recipientPhoneNumber: text(), // String
    callId: text(), // String
  },
  (t) => [index('frontline_conversations_callpro_org_idx').on(t.orgId)],
);

/** From `logs_callpro` (frontline_api/src/modules/integrations/callpro/db/definitions/logs.ts:4). */
export const frontlineLogsCallpro = table(
  'logs_callpro',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    type: text(), // String
    value: jsonb(), // Object
    specialValue: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_logs_callpro_org_idx').on(t.orgId)],
);

/** From `mail_integrations` (frontline_api/src/modules/integrations/mail/db/definitions/integrations.ts:17). */
export const frontlineMailIntegrations = table(
  'mail_integrations',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxId: text(), // String
    pipelineId: text(), // String
    statusId: text(), // String
    name: text(), // String
    address: text(), // String
    forwardFrom: text(), // String
    forwardPendingAt: timestamp({ withTimezone: true }), // Date
    forwardVerification: jsonb(), // forwardVerificationSchema
    senderName: text(), // String
    healthStatus: text(), // String
    error: text(), // String
    disabledAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_mail_integrations_org_idx').on(t.orgId)],
);

/** From `mail_customers` (frontline_api/src/modules/integrations/mail/db/definitions/customers.ts:4). */
export const frontlineMailCustomers = table(
  'mail_customers',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxIntegrationId: text(), // String
    contactsId: text(), // String
    email: text(), // String
    firstName: text(), // String
    lastName: text(), // String
  },
  (t) => [index('frontline_mail_customers_org_idx').on(t.orgId)],
);

/** From `mail_messages` (frontline_api/src/modules/integrations/mail/db/definitions/messages.ts:31). */
export const frontlineMailMessages = table(
  'mail_messages',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxIntegrationId: text(), // String
    inboxConversationId: text(), // String
    ticketId: text(), // String
    messageId: text(), // String
    subject: text(), // String
    body: text(), // String
    reactionEmoji: text(), // String
    hasReplyTo: boolean(), // Boolean
    from: jsonb(), // [addressSchema]
    to: jsonb(), // [addressSchema]
    cc: jsonb(), // [addressSchema]
    bcc: jsonb(), // [addressSchema]
    attachments: jsonb(), // [attachmentSchema]
    inReplyTo: text(), // String
    references: text().array(), // [String]
    replyTag: text(), // String
    isAuto: boolean(), // Boolean
    automated: boolean(), // Boolean
    conversationStatusOnSent: text(), // String
    conversationStatusAppliedAt: timestamp({ withTimezone: true }), // Date
    draftId: text(), // String
    sourceMessageId: text(), // String
    envelopeFrom: text(), // String
    senderMismatch: boolean(), // Boolean
    providerMessageId: text(), // String
    deliveryStatus: text(), // String
    deliveryError: text(), // String
    deliveryRetryable: boolean(), // Boolean
    deliveryAttemptedAt: timestamp({ withTimezone: true }), // Date
    bouncedRecipients: text().array(), // [String]
    type: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_mail_messages_org_idx').on(t.orgId)],
);

/** From `mail_drafts` (frontline_api/src/modules/integrations/mail/db/definitions/drafts.ts:5). */
export const frontlineMailDrafts = table(
  'mail_drafts',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    inboxIntegrationId: text(), // String
    inboxConversationId: text(), // String
    sourceMessageId: text(), // String
    customerId: text(), // String
    to: text().array(), // [String]
    subject: text(), // String
    body: text(), // String
    replyToMessageId: text(), // String
    references: text().array(), // [String]
    shouldResolve: boolean(), // Boolean
    senderMismatch: boolean(), // Boolean
    status: text(), // String
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_mail_drafts_org_idx').on(t.orgId)],
);

/** From `mail_cloudflare` (frontline_api/src/modules/integrations/mail/db/definitions/cloudflare.ts:15). */
export const frontlineMailCloudflare = table(
  'mail_cloudflare',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    accountId: text(), // String
    accountName: text(), // String
    zoneId: text(), // String
    zoneName: text(), // String
    tenant: text(), // String
    workerName: text(), // String
    workerOrigin: text(), // String
    bucketName: text(), // String
    queueName: text(), // String
    dlqName: text(), // String
    apiToken: text(), // String
    webhookSecret: text(), // String
    sendingEnabled: boolean(), // Boolean
    sendingTag: text(), // String
    scriptVersion: text(), // String
    status: text(), // String
    steps: jsonb(), // [provisionStepSchema]
    error: text(), // String
    connectedAt: timestamp({ withTimezone: true }), // Date
    createdAt: timestamp({ withTimezone: true }), // Date
    updatedAt: timestamp({ withTimezone: true }), // Date
  },
  (t) => [index('frontline_mail_cloudflare_org_idx').on(t.orgId)],
);

/** From `messenger_apps` (frontline_api/src/modules/inbox/db/definitions/messengerApps.ts:49). */
export const frontlineMessengerApps = table(
  'messenger_apps',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: jsonb(), // mongooseField({ type: String, enum: ['googleMeet', 'knowledgebase', 'lead', 'website'], })
    name: jsonb(), // mongooseField({ type: String })
    accountId: jsonb(), // mongooseField({ type: String, optional: true })
    showInInbox: jsonb(), // mongooseField({ type: Boolean, default: false })
    credentials: jsonb(), // mongooseField({ type: Object })
  },
  (t) => [index('frontline_messenger_apps_org_idx').on(t.orgId)],
);

/** From `configs` (frontline_api/src/modules/inbox/@types/configs.ts:16). */
export const frontlineConfigs = table(
  'configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    code: jsonb(), // mongooseField({ type: String, unique: true })
    value: jsonb(), // mongooseField({ type: Object })
  },
  (t) => [index('frontline_configs_org_idx').on(t.orgId)],
);

/** From `frontline_form_fields` (frontline_api/src/modules/form/db/definitions/fields.ts:137). */
export const frontlineFormFields = table(
  'form_fields',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    contentType: jsonb(), // field({ type: String, label: 'Content type' })
    contentTypeId: jsonb(), // field({ type: String, label: 'Content type item' })
    type: jsonb(), // field({ type: String, label: 'Type' })
    validation: jsonb(), // field({ type: String, optional: true, label: 'Validation', })
    regexValidation: jsonb(), // field({ type: String, optional: true, label: 'Regex validation', })
    text: jsonb(), // field({ type: String, label: 'Text' })
    field: jsonb(), // field({ type: String, optional: true, label: 'Field identifier' })
    description: jsonb(), // field({ type: String, optional: true, label: 'Description', })
    code: jsonb(), // field({ type: String, optional: true, label: 'Unique code', })
    options: jsonb(), // field({ type: [String], optional: true, label: 'Options', })
    locationOptions: jsonb(), // field({ type: Array, optional: true, label: 'Location Options', })
    objectListConfigs: jsonb(), // field({ type: [ObjectListSchema], optional: true, label: 'object list config', })
    optionsValues: jsonb(), // field({ type: String, label: 'Field Options object', })
    isRequired: jsonb(), // field({ type: Boolean, label: 'Is required' })
    isDefinedByErxes: jsonb(), // field({ type: Boolean, label: 'Is defined by erxes' })
    order: jsonb(), // field({ type: Number, label: 'Order' })
    groupId: jsonb(), // field({ type: String, label: 'Field group' })
    isVisible: jsonb(), // field({ type: Boolean, default: true, label: 'Is visible' })
    isVisibleInDetail: jsonb(), // field({ type: Boolean, default: true, label: 'Is group visible in detail', })
    canHide: jsonb(), // field({ type: Boolean, default: true, label: 'Can toggle isVisible', })
    isVisibleToCreate: jsonb(), // field({ type: Boolean, default: false, label: 'Is visible to create', })
    searchable: jsonb(), // field({ type: Boolean, default: false, label: 'Useful for searching', })
    lastUpdatedUserId: jsonb(), // field({ type: String, label: 'Last updated by' })
    associatedFieldId: jsonb(), // field({ type: String, optional: true, label: 'Stores custom property fieldId for form field id', })
    logics: jsonb(), // field({ type: [logicSchema] })
    column: jsonb(), // field({ type: Number, optional: true })
    logicAction: jsonb(), // field({ type: String, label: 'If action is show field will appear when logics fulfilled, if action is hide it will disappear when logic fulfilled', })
    allowSearch: jsonb(), // field({ type: Boolean, optional: true, default: false, label: 'Allow search field in options', })
    content: jsonb(), // field({ type: String, optional: true, label: 'Stores html content form of field type with html', })
    pageNumber: jsonb(), // field({ type: Number, optional: true, label: 'Number of page', min: 1, })
    showInCard: jsonb(), // field({ type: Boolean, default: false, optional: true, label: 'Show in card', })
    productCategoryId: jsonb(), // field({ type: String, optional: true, label: 'Product category', })
    relationType: jsonb(), // field({ type: String, optional: true, label: 'Relation type', })
    subFieldIds: jsonb(), // field({ type: [String], optional: true, label: 'Sub field ids', })
    isDisabled: jsonb(), // field({ type: Boolean, optional: true, label: 'Is Disabled', })
    validator: jsonb(), // fieldValidatorSchema
  },
  (t) => [index('frontline_form_fields_org_idx').on(t.orgId)],
);

/** From `frontline_forms` (frontline_api/src/modules/form/db/definitions/forms.ts:318). */
export const frontlineForms = table(
  'forms',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    conversionRevision: doublePrecision(), // Number
    activeSubmissions: jsonb(), // [subdocument]
    name: jsonb(), // field({ type: String, required: true })
    title: jsonb(), // field({ type: String, optional: true })
    type: jsonb(), // field({ type: String, required: true })
    description: jsonb(), // field({ type: String, optional: true, })
    buttonText: jsonb(), // field({ type: String, optional: true })
    code: jsonb(), // field({ type: String })
    createdUserId: jsonb(), // field({ type: String })
    createdDate: jsonb(), // field({ type: Date, default: Date.now, })
    numberOfPages: jsonb(), // field({ type: Number, optional: true, min: 1, })
    channelId: jsonb(), // field({ type: String, optional: true, label: 'Channel' })
    leadData: jsonb(), // field({ type: leadDataSchema, label: 'Lead data' })
    departmentIds: jsonb(), // field({ type: [String], optional: true, label: 'Departments', })
    languageCode: jsonb(), // field({ type: String, optional: true, label: 'Language' })
    visibility: jsonb(), // field({ type: String, optional: true, label: 'Visibility' })
    tagIds: jsonb(), // field({ type: [String], optional: true, label: 'Tags' })
    status: jsonb(), // field({ type: String, optional: true, label: 'Status', enum: ['active', 'archived'], default: 'active', })
    integrationId: jsonb(), // field({ type: String, optional: true, label: 'Integration', })
  },
  (t) => [index('frontline_forms_org_idx').on(t.orgId)],
);

/** From `frontline_form_submissions` (frontline_api/src/modules/form/db/definitions/forms.ts:114). */
export const frontlineFormSubmissions = table(
  'form_submissions',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    customerId: jsonb(), // field({ type: String, optional: true })
    userId: jsonb(), // field({ type: String, optional: true })
    contentType: jsonb(), // field({ type: String, optional: true })
    contentTypeId: jsonb(), // field({ type: String, optional: true })
    value: jsonb(), // field({ type: Object, optional: true })
    submittedAt: jsonb(), // field({ type: Date, default: Date.now })
    formId: jsonb(), // field({ type: String, optional: true })
    formFieldId: jsonb(), // field({ type: String, optional: true })
    groupId: jsonb(), // field({ type: String, optional: true })
    conversationId: jsonb(), // field({ type: String, optional: true })
    aboutRecord: jsonb(), // field({ type: new Schema( { type: { type: String, required: true }, id: { type: String, required: true }, }, { _id: false }, ), optional: true, })
    linkId: jsonb(), // field({ type: String, optional: true })
  },
  (t) => [index('frontline_form_submissions_org_idx').on(t.orgId)],
);

/** From `frontline_surveys` (frontline_api/src/modules/survey/db/definitions/surveys.ts:71). */
export const frontlineSurveys = table(
  'surveys',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    title: text().notNull(), // String
    channelId: text(), // String
    brandId: text(), // String
    code: text(), // String
    question: text().notNull(), // String
    options: jsonb(), // [surveyOptionSchema]
    steps: jsonb(), // [surveyStepSchema]
    allowMultiselect: boolean(), // Boolean
    durationHours: doublePrecision(), // Number
    status: text(), // String
    rejectionReason: text(), // String
    sentCount: doublePrecision(), // Number
    createdUserId: text(), // String
    createdCpUserId: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_surveys_org_idx').on(t.orgId)],
);

/** From `frontline_survey_votes` (frontline_api/src/modules/survey/db/definitions/surveys.ts:106). */
export const frontlineSurveyVotes = table(
  'survey_votes',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    surveyId: text().notNull(), // String
    messageId: text().notNull(), // String
    conversationId: text().notNull(), // String
    voterId: text().notNull(), // String
    cpUserId: text(), // String
    customerId: text(), // String
    visitorId: text(), // String
    optionIds: text().array(), // [String]
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_survey_votes_org_idx').on(t.orgId)],
);

/** From `frontline_help_center_configs` (frontline_api/src/modules/helpcenter/db/definitions/helpCenterConfig.ts:78). */
export const frontlineHelpCenterConfigs = table(
  'help_center_configs',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    title: text().notNull(), // String
    description: text(), // String
    url: text(), // String
    erxesAppToken: text(), // String
    clientPortalId: text(), // String
    brandId: text(), // String
    languageCode: text(), // String
    kbToggle: boolean(), // Boolean
    kbLabel: text(), // String
    kbTopicId: text(), // String
    ticketToggle: boolean(), // Boolean
    ticketLabel: text(), // String
    ticketChannelId: text(), // String
    ticketPipelineId: text(), // String
    ticketStatusId: text(), // String
    formChannelId: text(), // String
    formIds: text().array(), // [String]
    cmsId: text(), // String
    cmsAppToken: text(), // String
    cmsConfigs: jsonb(), // [cmsConfigSchema]
    color: text(), // String
    backgroundImage: text(), // String
    styles: jsonb(), // stylesSchema
    header: jsonb(), // headerSchema
    footer: jsonb(), // footerSchema
    createdBy: text(), // String
    modifiedBy: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_help_center_configs_org_idx').on(t.orgId)],
);

/** From `frontline_report_charts` (frontline_api/src/modules/reports/db/definitions/chart.ts:45). */
export const frontlineReportCharts = table(
  'report_charts',
  {
    // The Mongo `_id`, kept as text so references survive the import.
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(), // String
    chartType: text().notNull(), // String
    visualType: text(), // String
    colSpan: doublePrecision(), // Number
    filters: jsonb(), // reportChartFiltersSchema
    createdBy: text(), // String
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_report_charts_org_idx').on(t.orgId)],
);

/** Old core's departments and branches, now the plugin's. Ids are the Mongo `_id`s. */
export const frontlineTeams = table(
  'teams',
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text({ enum: ['department', 'branch'] }).notNull(),
    name: text(),
    code: text(),
    parentId: text(),
    supervisorId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_teams_org_idx').on(t.orgId)],
);

/**
 * Who is in which team, from old users' departmentIds and branchIds. User ids are core's,
 * which keep the Mongo `_id` of members imported from old erxes. Old users may point at
 * removed departments: drop those rows before adding a foreign key to the teams.
 */
export const frontlineTeamMembers = table(
  'team_members',
  {
    orgId: text().notNull(),
    teamId: text().notNull(),
    userId: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index('frontline_team_members_user_idx').on(t.userId),
  ],
);
