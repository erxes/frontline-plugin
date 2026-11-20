import { randomUUID } from 'node:crypto';
import type * as Sdk from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import type * as CoreModule from '#/core.ts';
import { ticketFieldCalls } from '#/test/coreUnits.ts';

type Meta = ReturnType<(typeof CoreModule)['core']['forOrg']>['meta'];

type Connection = Awaited<ReturnType<Meta['connections']>>['data'][number];

type Sent = Parameters<Meta['send']>[0];

/**
 * What frontline asked of core in a test: the customers senders become, the notifications
 * members get, the jobs it queued, and what it sent, asked and handed over through core's Meta
 * integration. `vi.mock` loads this module before the app, so it imports nothing of the app's.
 */
export const asked = {
  customers: 0,
  created: [] as unknown[],
  notifications: [] as unknown[],
  jobs: [] as unknown[],
  metaSent: [] as Sent[],
  metaGraph: [] as Parameters<Meta['graph']>[0][],
  metaImported: [] as Parameters<Meta['import']>[0][],
};

const metaConnections: { orgId: string; connection: Connection }[] = [];

export const connectMeta = (
  orgId: string,
  kind: Connection['kind'],
  fields: Partial<Connection> = {},
) => {
  const connection: Connection = {
    id: `connection-${randomUUID()}`,
    kind,
    externalId: kind === 'facebook' ? 'page-1' : 'ig-1',
    pageId: 'page-1',
    name: kind === 'facebook' ? 'Shop' : '@shop.mn',
    username: kind === 'instagram' ? 'shop.mn' : null,
    app: 'install',
    status: 'healthy',
    statusReason: null,
    connectedAt: '2026-11-01T00:00:00Z',
    checkedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    ...fields,
  };

  metaConnections.push({ orgId, connection });

  return connection;
};

export const metaConnectionsOf = (orgId: string) =>
  metaConnections.filter((one) => one.orgId === orgId).map((one) => one.connection);

const POST = {
  id: 'page-1_post-9',
  message: 'New blue jackets are in',
  permalink_url: 'https://www.facebook.com/page-1/posts/9',
  full_picture: 'https://cdn.example.com/jacket.jpg',
  created_time: '2025-11-15T04:00:00+0000',
};

const MEDIA = {
  id: 'media-3',
  caption: 'Autumn drop',
  permalink: 'https://www.instagram.com/p/media-3',
  media_url: 'https://cdn.example.com/drop.jpg',
  timestamp: '2025-11-16T04:00:00+0000',
};

const graphAnswer = ({ path, method, body }: Parameters<Meta['graph']>[0]) => {
  if (JSON.stringify(body ?? null).includes('refused'))
    return { status: 400, body: { error: { message: 'Invalid parameter' } } };

  if (path === POST.id) return { status: 200, body: POST };

  if (path === 'page-1/published_posts')
    return {
      status: 200,
      body: { data: [POST], paging: { cursors: { after: 'cursor-2' }, next: 'https://next' } },
    };

  if (path === 'ig-1/media') return { status: 200, body: { data: [MEDIA] } };

  if (method === 'POST' && (path === 'page-1/feed' || path === 'page-1/photos'))
    return { status: 200, body: { id: 'page-1_post-new', post_id: 'page-1_post-new' } };

  return { status: 200, body: { result: 'success' } };
};

const metaSend = async (input: Sent) => {
  asked.metaSent.push(input);

  if ('commentId' in input && input.commentId.endsWith('-deleted'))
    throw new ORPCError('META_REFUSED', {
      status: 400,
      message: 'Meta refused: Object does not exist',
    });

  return { id: input.kind === 'reaction' ? null : `mid.${input.idempotencyKey}` };
};

const metaImport = (orgId: string) => async (input: Parameters<Meta['import']>[0]) => {
  asked.metaImported.push(input);

  for (const { pageToken: _token, ...given } of input.connections ?? []) {
    const known = metaConnectionsOf(orgId).find(
      (one) => one.kind === given.kind && one.externalId === given.externalId,
    );

    if (known) Object.assign(known, given);
    else connectMeta(orgId, given.kind, { ...given, username: given.username ?? null });
  }

  return {
    connections: input.connections?.length ?? 0,
    people: input.people?.length ?? 0,
    automations: 0,
    placeholdersLeft: 0,
    stepsLeft: 0,
  };
};

/** What was uploaded to core's storage, by file id. */
const uploads = new Map<string, { name: string; contentType: string; size: number }>();

/** A file in core's storage as core describes it; one the test didn't upload is a 4-byte text file. */
const fileOf = (id: string) => ({
  id,
  name: `${id.replace('file-', '')}.txt`,
  contentType: 'text/plain',
  size: 4,
  ...uploads.get(id),
});

/** `#/core.ts` with core's calls answered here: `vi.mock('#/core.ts', …coreStandIn)`. */
export const coreStandIn = (actual: typeof CoreModule) => ({
  ...actual,
  core: {
    ...actual.core,
    forOrg: (orgId: string) => ({
      ...ticketFieldCalls,
      meta: {
        connections: async ({ kind }: { kind?: Connection['kind'] } = {}) => ({
          data: metaConnectionsOf(orgId).filter((one) => !kind || one.kind === kind),
        }),
        send: metaSend,
        graph: async (input: Parameters<Meta['graph']>[0]) => {
          asked.metaGraph.push(input);

          return graphAnswer(input);
        },
        import: metaImport(orgId),
      },
      customers: {
        create: async (input: unknown) => {
          asked.customers += 1;
          asked.created.push(input);

          return { id: `customer-${asked.customers}` };
        },
        // A lead a sender's second first message made, which the first one's link replaced.
        remove: async ({ ids }: { ids: string[] }) => ({ removed: ids.length }),
        // Core's customer with the email or phone: the same one for the same address or number.
        findOrCreate: async (input: { primaryEmail?: string; primaryPhone?: string }) => ({
          customer: {
            id: `customer-${input.primaryEmail ?? input.primaryPhone ?? 'without-contact'}`,
          },
        }),
        // Core names the caller of 88001122 and has forgotten every other customer.
        get: async ({ id }: { id: string }) => {
          if (id !== 'customer-88001122')
            throw new ORPCError('NOT_FOUND', { message: 'No such customer' });

          return { id, firstName: 'Dulam', lastName: 'Dorj' };
        },
        // Every search finds Saraa, with her two addresses.
        list: async () => ({
          data: [
            {
              id: 'customer-saraa',
              firstName: 'Saraa',
              lastName: null,
              primaryEmail: 'Saraa@example.mn',
              emails: ['saraa@example.mn', 'gone@example.mn'],
            },
          ],
        }),
      },
      // Core's storage, as `files.createUpload`, a PUT to its address, then `files.complete`, and
      // `files.get` for a file to read back. A file's id is its name, as an id spells it.
      files: {
        createUpload: async (input: { name: string; contentType: string; size: number }) => {
          const id = `file-${input.name.replaceAll(/[^\w-]/g, '-')}`;

          uploads.set(id, input);

          return {
            file: { id },
            upload: {
              method: 'PUT',
              url: `https://files.core.test/${input.name}`,
              headers: {},
              expiresAt: '2026-11-15T12:00:00Z',
            },
          };
        },
        complete: async ({ id }: { id: string }) => ({
          ...fileOf(id),
          url: `/core/v1/files/${id}/download`,
        }),
        get: async ({ id }: { id: string }) => ({
          ...fileOf(id),
          downloadUrl: `https://files.core.test/${id}`,
        }),
      },
      // Members whose id starts with `admin-` hold core's Admin role.
      users: {
        list: async ({ ids }: { ids: string }) => ({
          data: ids
            .split(',')
            .map((id) => ({ id, role: id.startsWith('admin-') ? 'admin' : 'member' })),
        }),
      },
      notifications: {
        create: async (input: unknown) => {
          asked.notifications.push(input);

          return { ok: true };
        },
      },
    }),
  },
});

/**
 * The SDK with core's job queue answered here, core's automation calls signed with a token
 * `core-call:<orgId>:<userId>`, and core's event deliveries with the token `core-event`.
 */
export const sdkStandIn = (actual: typeof Sdk) => ({
  ...actual,
  verifyCoreEvent: async (authorization: string | null | undefined, raw: string) => {
    if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

    return actual.DeliveredEvent.parse(JSON.parse(raw));
  },
  enqueueJob: async (_tx: unknown, job: unknown) => {
    asked.jobs.push(job);
  },
  verifyCoreCall: async (token: string) => {
    const [kind, orgId, userId] = token.split(':');

    if (kind !== 'core-call' || !orgId || !userId) throw new Error('not signed by core');

    return { orgId, userId, automationId: 'automation-1', runId: 'run-1', stepId: 'step-1' };
  },
});
