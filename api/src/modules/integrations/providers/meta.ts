import { MetaConnection, type MetaKind } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { core, PERMISSIONS } from '#/core.ts';
import { readsWithCore } from '#/orpc.ts';

export const COMMENT_THREAD = 'comment:';

export const postOfThread = (threadId: string | null) =>
  threadId?.startsWith(COMMENT_THREAD) ? (threadId.split(':')[1] ?? null) : null;

export const authorOfThread = (threadId: string) => threadId.split(':')[2] ?? threadId;

export const MetaConfig = z.object({ connectionId: z.string().min(1) });

export const metaOf = (orgId: string) => core.forOrg(orgId).meta;

const Failure = z.object({ error: z.object({ message: z.string() }) });

export const graph = async (
  orgId: string,
  connectionId: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
) => {
  const { status, body } = await metaOf(orgId).graph({
    connectionId,
    path,
    method: options.method ?? 'GET',
    query: options.query ?? {},
    body: options.body,
  });

  if (status >= 200 && status < 300) return body;

  throw new ORPCError('BAD_REQUEST', {
    message: `Meta refused: ${Failure.safeParse(body).data?.error.message ?? `it answered ${status}`}`,
  });
};

export const connectionsOf = async (orgId: string, kind?: MetaKind) =>
  (await metaOf(orgId).connections({ kind })).data;

export type Connection = Awaited<ReturnType<typeof connectionsOf>>[number];

const Shown = MetaConnection.omit({ connectedAt: true, createdAt: true });

export const metaConnections = readsWithCore(
  PERMISSIONS.integrationView,
  z.object({}).optional(),
  (member) => connectionsOf(member.orgId),
)
  .output(z.object({ connections: z.array(Shown), canManage: z.boolean() }))
  .handler(({ context: { fromCore, member } }) => ({
    connections: fromCore.map(({ checkedAt, ...connection }) => ({
      ...connection,
      checkedAt: checkedAt ? new Date(checkedAt) : null,
    })),
    canManage: member.can(PERMISSIONS.integrationManage),
  }));

export const connectionOf = async (orgId: string, id: string) => {
  const found = (await connectionsOf(orgId)).find((connection) => connection.id === id);

  if (!found)
    throw new ORPCError('NOT_FOUND', { message: 'No such Facebook page or Instagram account' });

  return found;
};
