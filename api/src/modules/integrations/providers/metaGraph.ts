import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { providerApi, ProviderRefused } from '../providerApi.ts';
import { AccountRefused } from '../provider.ts';
import { openSecret } from '../secrets.ts';
import { accountRow } from '../store.ts';

/** The Graph API version frontline's calls use. */
const GRAPH_VERSION = 'v23.0';

const GraphFailure = z.object({
  error: z.object({ message: z.string(), code: z.number().optional() }),
});

/** Meta's code for an access token it no longer takes: expired, revoked or the password changed. */
const TOKEN_REFUSED = 190;

const graphApi = providerApi({
  name: 'Meta',
  prefix: `https://graph.facebook.com/${GRAPH_VERSION}`,
  readError: (body) => {
    const { data } = GraphFailure.safeParse(body);

    return { why: data?.error.message, deadToken: data?.error.code === TOKEN_REFUSED };
  },
});

/**
 * A Graph API call with `token` in the Authorization header, so tokens stay out of addresses
 * and logs. `body` goes as JSON, or as it is when it's a form with a file. Resolves to the parsed
 * body, or fails with Meta's message.
 */
export const graph = (
  path: string,
  token: string | null,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    query?: Record<string, string>;
    body?: unknown;
  } = {},
) => {
  const { body } = options;

  return graphApi(path, {
    method: options.method ?? 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    searchParams: options.query,
    ...(body instanceof FormData ? { body } : body ? { json: body } : {}),
  }).json();
};

export const Secret = z.object({ pageToken: z.string() });

/** A connected Facebook page or Instagram account by id, with its page token, or NOT_FOUND. */
export const metaAccount = async (tx: Tx, id: string) => {
  const row = await accountRow(tx, id);

  if (row.provider !== 'facebook' && row.provider !== 'instagram')
    throw new ORPCError('NOT_FOUND', { message: 'No such Facebook page or Instagram account' });

  return {
    row,
    provider: row.provider,
    token: openSecret(row.orgId, row.secret, Secret).pageToken,
  };
};

/** `call`, with Meta's refusal as a BAD_REQUEST the member reads. */
export const askMeta = <T>(call: Promise<T>) =>
  call.catch((error: unknown) => {
    if (error instanceof ProviderRefused)
      throw new ORPCError('BAD_REQUEST', { message: error.message });

    if (error instanceof AccountRefused)
      throw new ORPCError('BAD_REQUEST', { message: `Meta refused: ${error.message}` });

    throw error;
  });
