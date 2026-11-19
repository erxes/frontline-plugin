// Old conversations of every kind, and their tags. A conversation keeps its provider's thread id
// (`external_id`) in the form the new adapters use, so the next message from the same person
// lands in it: a sender id for Messenger and Instagram, `comment:<post>:<person>` for comments,
// the channel for Discord, the chat for Telegram, `<sender> <root message id>` for mail.
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  createdOf,
  dateOf,
  entriesOf,
  idOf,
  idsOf,
  intOf,
  textOf,
  textOfHtml,
  docId,
} from '../values.ts';
import { already } from './structure.ts';

const STATUSES: Record<string, 'new' | 'open' | 'resolved'> = {
  new: 'new',
  open: 'open',
  closed: 'resolved',
  resolved: 'resolved',
  // An automatic engage message no visitor answered; old erxes kept it out of the inbox.
  engageVisitorAuto: 'resolved',
};

/** The provider's thread id of each old conversation, by conversation id. */
const threads = new Map<string, string>();

const firstAddress = (value: unknown) => {
  const entry = entriesOf(Array.isArray(value) ? value.at(0) : undefined);

  return (
    textOf(entry.get('address'))?.toLowerCase() ?? textOf(entry.get('email'))?.toLowerCase() ?? null
  );
};

const sender = (doc: Record<string, unknown>) => idOf(doc.senderId);

const comment = (doc: Record<string, unknown>) => {
  const post = idOf(doc.postId);
  const person = idOf(doc.senderId);

  return post && person ? `comment:${post}:${person}` : null;
};

/** Reads the provider records that name each conversation's thread. */
const loadThreads = async (ctx: Context) => {
  const named = async (
    db: typeof ctx.main,
    collection: string,
    threadOf: (doc: Record<string, unknown>) => string | null,
  ) => {
    for await (const doc of db.collection(collection).find()) {
      const conversationId = idOf(doc.erxesApiId);
      const thread = threadOf(doc);

      if (conversationId && thread && !threads.has(conversationId))
        threads.set(conversationId, thread);
    }
  };

  for (const db of [ctx.main, ctx.officeIntegrations]) {
    await named(db, 'conversations_facebooks', sender);
    await named(db, 'comment_conversations_facebooks', comment);
    await named(db, 'instagram_conversations', sender);
    await named(db, 'instagram_comment_conversations', comment);
  }

  await named(ctx.main, 'conversations_discords', (doc) => idOf(doc.channelId));
  await named(ctx.main, 'conversations_telegrams', (doc) => idOf(doc.chatId));

  // A mail thread is its sender and the first message of its references.
  for (const collection of ['mail_messages', 'imap_messages'])
    for await (const first of ctx.main.collection(collection).aggregate(
      [
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: '$inboxConversationId',
            from: { $first: '$from' },
            references: { $first: '$references' },
            inReplyTo: { $first: '$inReplyTo' },
            messageId: { $first: '$messageId' },
          },
        },
      ],
      { allowDiskUse: true },
    )) {
      const conversationId = docId(first);
      const from = firstAddress(first.from);
      const root = idsOf(first.references)[0] ?? textOf(first.inReplyTo) ?? textOf(first.messageId);

      if (conversationId && from && root && !threads.has(conversationId))
        threads.set(conversationId, `${from} ${root}`);
    }
};

/** Old `customFieldsData`: `[{ field, value }]` as values by core field id. */
const propertiesOf = (ctx: Context, value: unknown) =>
  Object.fromEntries(
    (Array.isArray(value) ? value : []).flatMap((item: unknown) => {
      const entry = entriesOf(item);
      const field = ctx.field(idOf(entry.get('field')));
      const fieldValue = entry.get('value');

      return field && fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
        ? [[field, fieldValue]]
        : [];
    }),
  );

const conversationStep = (database: 'erxes' | 'erxes_office'): Step => {
  const usedThreads = new Set<string>();

  return {
    source: `${database}.conversations`,
    documents: async (ctx) => {
      if (threads.size === 0) await loadThreads(ctx);

      const { rows } = await ctx.client.query<{ key: string }>(
        `SELECT integration_id || '|' || external_id AS key FROM frontline_conversations WHERE external_id IS NOT NULL`,
      );

      for (const { key } of rows) usedThreads.add(key);

      return ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'conversations');
    },
    transform: (doc, ctx) => {
      const id = docId(doc);

      if (!id) return skip('no id');

      if (already(ctx, 'conversation', id)) return skip('already in erxes by id');

      const integration = ctx.integrations.get(idOf(doc.integrationId) ?? '');
      const customerId = ctx.customer(idOf(doc.customerId));
      const status = STATUSES[String(doc.status)];

      if (!integration)
        return skip(
          ctx.known('lead', idOf(doc.integrationId))
            ? 'a lead form conversation: its answers import as form submissions'
            : `its integration: ${ctx.known('integration.left-out', idOf(doc.integrationId)) ?? 'deleted in old erxes, and nothing records its kind'}`,
        );

      if (!customerId) return skip('no customer (an anonymous visitor)');

      if (!status) return skip(`unknown status ${String(doc.status)}`);

      const thread = threads.get(id) ?? null;
      const threadKey = `${integration.id}|${thread ?? ''}`;
      // An old thread split over two conversations keeps its id on the first only.
      const externalId = thread && !usedThreads.has(threadKey) ? thread : null;

      if (externalId) usedThreads.add(threadKey);

      ctx.remember('conversation', id, id);
      ctx.conversations.set(id, {
        kind: integration.kind,
        customerId,
        inboxId: String(idOf(doc.integrationId)),
      });

      const createdAt = createdOf(doc, doc.createdAt);
      const resolved = status === 'resolved';

      return put(
        [
          'frontline_conversations',
          {
            id,
            channel_id: integration.channelId,
            integration_id: integration.id,
            customer_id: customerId,
            external_id: externalId,
            status,
            assignee_id: ctx.user(idOf(doc.assignedUserId)),
            participant_ids: ctx.users(idsOf(doc.participatedUserIds)),
            read_by: ctx.users(idsOf(doc.readUserIds)),
            content: (textOfHtml(doc.content) ?? '').slice(0, 1000),
            message_count: intOf(doc.messageCount) ?? 0,
            customer_responded_last:
              typeof doc.isCustomerRespondedLast === 'boolean' ? doc.isCustomerRespondedLast : true,
            last_message_at: createdOf(doc, doc.updatedAt, doc.createdAt),
            first_responded_at: dateOf(doc.firstRespondedDate),
            first_responded_by: ctx.user(idOf(doc.firstRespondedUserId)),
            resolved_at: resolved ? (dateOf(doc.closedAt) ?? dateOf(doc.updatedAt)) : null,
            resolved_by: resolved ? ctx.user(idOf(doc.closedUserId)) : null,
            operator: doc.operatorStatus === 'operator' ? 'person' : 'bot',
            properties_data: propertiesOf(ctx, doc.customFieldsData),
            created_at: createdAt,
            updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
          },
        ],
        ...ctx
          .knownAll('tag', idsOf(doc.tagIds))
          .map(
            (tagId) =>
              ['frontline_conversation_tags', { conversation_id: id, tag_id: tagId }] as const,
          ),
      );
    },
  };
};

export const CONVERSATION_STEPS: Step[] = [
  conversationStep('erxes'),
  conversationStep('erxes_office'),
];
