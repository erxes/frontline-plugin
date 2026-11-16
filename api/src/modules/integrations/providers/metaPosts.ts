import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { integrations } from '#/db/inbox.ts';
import { reads, writes } from '#/orpc.ts';
import { conversationById } from '../../inbox/shared.ts';
import type { ProviderName } from '../provider.ts';
import { askMeta, graph, metaAccount } from './meta.ts';
import { postOfThread } from './metaWebhook.ts';

/** A page's post or an Instagram account's media, as Meta keeps it. */
const Post = z.object({
  id: z.string(),
  content: z.string(),
  permalink: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
});

const FIELDS = {
  facebook: 'id,message,permalink_url,full_picture,created_time',
  instagram: 'id,caption,permalink,media_url,thumbnail_url,timestamp',
};

/** One post in either shape Meta answers with, read as `Post`. */
const GraphPost = z
  .object({
    id: z.string(),
    message: z.string(),
    caption: z.string(),
    permalink_url: z.string(),
    permalink: z.string(),
    full_picture: z.string(),
    media_url: z.string(),
    thumbnail_url: z.string(),
    created_time: z.string(),
    timestamp: z.string(),
  })
  .partial()
  .required({ id: true })
  .transform((post) => ({
    id: post.id,
    content: post.message ?? post.caption ?? '',
    permalink: post.permalink_url ?? post.permalink ?? null,
    imageUrl: post.full_picture ?? post.thumbnail_url ?? post.media_url ?? null,
    createdAt: post.created_time ?? post.timestamp ?? null,
  }));

const Page = z.object({
  data: z.array(GraphPost),
  paging: z
    .object({ cursors: z.object({ after: z.string() }).partial(), next: z.string() })
    .partial()
    .optional(),
});

const postsPath = (provider: ProviderName, externalId: string) =>
  provider === 'instagram' ? `${externalId}/media` : `${externalId}/published_posts`;

/** The account's posts, newest first, 25 at a time from Meta's cursor. */
const list = reads(PERMISSIONS.integrationView)
  .input(z.object({ accountId: z.string(), after: z.string().optional() }))
  .output(z.object({ posts: z.array(Post), next: z.string().nullable() }))
  .handler(async ({ input, context: { tx } }) => {
    const { row, provider, token } = await metaAccount(tx, input.accountId);

    const page = Page.parse(
      await askMeta(
        graph(postsPath(provider, row.externalId), token, {
          query: {
            fields: FIELDS[provider],
            limit: '25',
            ...(input.after ? { after: input.after } : {}),
          },
        }),
      ),
    );

    return {
      posts: page.data,
      next: page.paging?.next ? (page.paging.cursors?.after ?? null) : null,
    };
  });

const AccountConfig = z.object({ accountId: z.string() });

/** The post a comment conversation hangs under, read from Meta; null for a chat. */
const get = reads(PERMISSIONS.inboxView)
  .input(z.object({ conversationId: z.string() }))
  .output(Post.nullable())
  .handler(async ({ input, context: { tx, member } }) => {
    const conversation = await conversationById(tx, member, input.conversationId);
    const postId = postOfThread(conversation.externalId);

    if (!postId) return null;

    const [integration] = await tx
      .select({ config: integrations.config })
      .from(integrations)
      .where(eq(integrations.id, conversation.integrationId));

    const { accountId } = AccountConfig.parse(integration?.config);
    const { provider, token } = await metaAccount(tx, accountId);

    return GraphPost.parse(
      await askMeta(graph(postId, token, { query: { fields: FIELDS[provider] } })),
    );
  });

const Created = z.object({ id: z.string(), post_id: z.string().optional() });

/** Publishes a post on a Facebook page: text with a link, or a photo with a caption. */
const create = writes(PERMISSIONS.integrationManage)
  .input(
    z.object({
      accountId: z.string(),
      message: z.string().trim().min(1).max(5000),
      link: z.url().optional(),
      imageUrl: z.url().optional(),
    }),
  )
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx } }) => {
    const { row, provider, token } = await metaAccount(tx, input.accountId);

    if (provider !== 'facebook')
      throw new ORPCError('BAD_REQUEST', { message: 'Posts are published on Facebook pages' });

    const created = Created.parse(
      await askMeta(
        input.imageUrl
          ? graph(`${row.externalId}/photos`, token, {
              method: 'POST',
              body: { url: input.imageUrl, caption: input.message },
            })
          : graph(`${row.externalId}/feed`, token, {
              method: 'POST',
              body: { message: input.message, link: input.link },
            }),
      ),
    );

    return { id: created.post_id ?? created.id };
  });

export const metaPostProcedures = { list, get, create };
