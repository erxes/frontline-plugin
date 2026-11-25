import { ORPCError } from '@orpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { core, CONVERSATION_EVENTS, PERMISSIONS } from '#/core.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { Attachment } from '#/db/table.ts';
import { readsWithCore, writes } from '#/orpc.ts';
import { channelFor } from '#/modules/channels/access.ts';
import { postMessage } from '#/modules/inbox/post.ts';
import { customerFor } from '#/modules/inbox/receive.ts';
import { publishConversationEvents } from '#/modules/inbox/shared.ts';
import { accountRow } from '../store.ts';
import { type MailData, newMessageId } from './mail.ts';
import { suppressedAmong } from './mailSuppressions.ts';

const AccountConfig = z.object({ accountId: z.string() });

/**
 * Writes a new mail from a channel's mailbox: the recipient becomes, or stays, a core customer,
 * and the mail opens a conversation in that channel that their replies join. It is queued like
 * any reply. An address that bounced or reported spam is refused.
 */
const compose = writes(PERMISSIONS.inboxView)
  .route({
    summary:
      "Send a new email from a channel's mailbox, opening a conversation; bounced or spam-reporting addresses are refused",
  })
  .input(
    z.object({
      integrationId: z.string(),
      to: z.email().max(320),
      subject: z.string().trim().min(1).max(500),
      content: z.string().trim().min(1).max(10_000),
      attachments: z.array(Attachment).max(20).default([]),
    }),
  )
  .output(z.object({ conversationId: z.string(), messageId: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const [integration] = await tx
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.id, input.integrationId),
          eq(integrations.kind, 'mail'),
          eq(integrations.isActive, true),
        ),
      );

    if (!integration) throw new ORPCError('NOT_FOUND', { message: 'No such mail integration' });

    await channelFor(tx, member, integration.channelId, { change: false });

    const to = input.to.toLowerCase();

    if ((await suppressedAmong(tx, [to])).length > 0)
      throw new ORPCError('BAD_REQUEST', {
        message: `${to} bounced or reported spam, so it isn't mailed`,
      });

    const account = await accountRow(tx, AccountConfig.parse(integration.config).accountId);
    const root = newMessageId(account.externalId);

    const customerId = await customerFor(member.orgId, {
      source: 'mail',
      externalId: to,
      firstName: to,
      email: to,
    });

    const [conversation] = await tx
      .insert(conversations)
      .values({
        orgId: member.orgId,
        channelId: integration.channelId,
        integrationId: integration.id,
        customerId,
        // The thread inbound mail joins: the recipient's part of the thread this mail begins.
        externalId: `${to} ${root}`,
      })
      .returning({
        id: conversations.id,
        customerId: conversations.customerId,
        integrationId: conversations.integrationId,
      });

    if (!conversation) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await publishConversationEvents(tx, member.orgId, member.userId, [
      {
        conversationId: conversation.id,
        customerId,
        type: CONVERSATION_EVENTS.started.type,
        summary: 'Started a conversation',
        payload: { integrationId: integration.id },
      },
    ]);

    const message = await postMessage(tx, member, conversation, {
      content: input.content,
      attachments: input.attachments,
      internal: false,
      mentionedUserIds: [],
      replyToId: null,
      providerData: { subject: input.subject, root } satisfies z.infer<typeof MailData>,
    });

    return { conversationId: conversation.id, messageId: message.id };
  });

/**
 * Who a new mail may go to: core's customers the search finds, one row for each of their
 * addresses, less those that bounced or reported spam.
 */
const recipients = readsWithCore(
  PERMISSIONS.inboxView,
  z.object({ search: z.string().trim().max(200).default('') }),
  async (member, input) =>
    (
      await core
        .forOrg(member.orgId)
        .customers.list({ search: input.search || undefined, limit: 20 })
    ).data,
)
  .route({
    summary:
      'Search customers to email, one result per address, without bounced or spam-reporting ones',
  })
  .output(
    z.array(
      z.object({
        customerId: z.string(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        email: z.string(),
      }),
    ),
  )
  .handler(async ({ context: { tx, fromCore: data } }) => {
    const rows = data.flatMap(({ id, firstName, lastName, primaryEmail, emails }) =>
      [...new Set([primaryEmail, ...emails].flatMap((email) => email?.toLowerCase() ?? []))].map(
        (email) => ({ customerId: id, firstName, lastName, email }),
      ),
    );

    const suppressed = new Set(
      await suppressedAmong(
        tx,
        rows.map((row) => row.email),
      ),
    );

    return rows.filter((row) => !suppressed.has(row.email));
  });

export const composeProcedures = { compose, recipients };
