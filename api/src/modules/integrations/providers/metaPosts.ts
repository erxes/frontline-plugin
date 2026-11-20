import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { readsWithCore, writesWithCore } from '#/orpc.ts';
import { conversationById } from '../../inbox/shared.ts';
import { type Connection, connectionOf, graph, MetaConfig, postOfThread } from './meta.ts';

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

const postsPath = ({ kind, externalId }: Connection) =>
  kind === 'instagram' ? `${externalId}/media` : `${externalId}/published_posts`;

const postsOf = async (
  orgId: string,
  connection: Connection,
  { after, limit }: { after?: string; limit: number },
) => {
  const page = Page.parse(
    await graph(orgId, connection.id, postsPath(connection), {
      query: {
        fields: FIELDS[connection.kind],
        limit: String(limit),
        ...(after ? { after } : {}),
      },
    }),
  );

  return {
    posts: page.data,
    next: page.paging?.next ? (page.paging.cursors?.after ?? null) : null,
  };
};

const list = readsWithCore(
  PERMISSIONS.integrationView,
  z.object({ connectionId: z.string(), after: z.string().optional() }),
  async (member, input) =>
    postsOf(member.orgId, await connectionOf(member.orgId, input.connectionId), {
      after: input.after,
      limit: 25,
    }),
)
  .output(z.object({ posts: z.array(Post), next: z.string().nullable() }))
  .handler(({ context: { fromCore } }) => fromCore);

const MEDIA_PAGES = 4;

const instagramPost = async (
  orgId: string,
  connection: Connection,
  postId: string,
  { after, pages }: { after?: string; pages: number } = { pages: MEDIA_PAGES },
): Promise<z.infer<typeof Post> | null> => {
  const page = await postsOf(orgId, connection, { after, limit: 50 });
  const found = page.posts.find((post) => post.id === postId);

  if (found) return found;

  return page.next && pages > 1
    ? instagramPost(orgId, connection, postId, { after: page.next, pages: pages - 1 })
    : null;
};

const get = readsWithCore(
  PERMISSIONS.inboxView,
  z.object({ conversationId: z.string() }),
  async (member, input) => {
    const found = await withOrg(member.orgId, async (tx) => {
      const conversation = await conversationById(tx, member, input.conversationId);
      const postId = postOfThread(conversation.externalId);

      if (!postId) return null;

      const [integration] = await tx
        .select({ config: integrations.config })
        .from(integrations)
        .where(eq(integrations.id, conversation.integrationId));

      return { postId, connectionId: MetaConfig.parse(integration?.config).connectionId };
    });

    if (!found) return null;

    const connection = await connectionOf(member.orgId, found.connectionId);

    if (connection.kind === 'instagram')
      return instagramPost(member.orgId, connection, found.postId);

    return GraphPost.parse(
      await graph(member.orgId, connection.id, found.postId, {
        query: { fields: FIELDS.facebook },
      }),
    );
  },
)
  .output(Post.nullable())
  .handler(({ context: { fromCore } }) => fromCore);

const Created = z.object({ id: z.string(), post_id: z.string().optional() });

const create = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({
    connectionId: z.string(),
    message: z.string().trim().min(1).max(5000),
    link: z.url().optional(),
    imageUrl: z.url().optional(),
  }),
  async (member, input) => {
    const connection = await connectionOf(member.orgId, input.connectionId);

    if (connection.kind !== 'facebook')
      throw new ORPCError('BAD_REQUEST', { message: 'Posts are published on Facebook pages' });

    const created = Created.parse(
      input.imageUrl
        ? await graph(member.orgId, connection.id, `${connection.externalId}/photos`, {
            method: 'POST',
            body: { url: input.imageUrl, caption: input.message },
          })
        : await graph(member.orgId, connection.id, `${connection.externalId}/feed`, {
            method: 'POST',
            body: { message: input.message, ...(input.link ? { link: input.link } : {}) },
          }),
    );

    return { id: created.post_id ?? created.id };
  },
)
  .output(z.object({ id: z.string() }))
  .handler(({ context: { fromCore } }) => fromCore);

export const metaPostProcedures = { list, get, create };
