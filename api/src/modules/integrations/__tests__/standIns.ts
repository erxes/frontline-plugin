import type * as Sdk from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import type * as CoreModule from '#/core.ts';
import { ticketFieldCalls } from '#/test/coreUnits.ts';

/**
 * What frontline asked of core in a test: the customers senders become, the notifications
 * members get, the messages given to core's agents and the jobs it queued. `vi.mock` loads this
 * module before the app, so it imports nothing of the app's.
 */
export const asked = {
  // Core's agents refuse a message with this text, as when another server runs the conversation.
  refusedByAgent: 'Is anyone there?',
  submitted: [] as Record<string, unknown>[],
  customers: 0,
  created: [] as unknown[],
  /** The avatar each customer frontline made was given, by customer id. */
  avatars: new Map<string, string>(),
  notifications: [] as unknown[],
  jobs: [] as unknown[],
  /** Where each integration stood, as reported to core: `[orgId, key, state, count]`. */
  reports: [] as [string, string, string, number | null | undefined][],
  /** The connections whose token frontline read, in order. */
  credentials: [] as string[],
};

/**
 * The organisation's Facebook connections in core: `fb-conn` signed in through the install's
 * Meta app, `fb-own` through the organisation's own. Any other id is one core doesn't give.
 */
const CONNECTIONS = {
  'fb-conn': {
    name: 'Shop on Facebook',
    accessToken: 'long-user-token',
    appId: 'test-meta-app',
    appSecret: 'test-meta-app-secret',
  },
  'fb-own': {
    name: 'Shop through its own app',
    accessToken: 'own-user-token',
    appId: 'own-app',
    appSecret: 'own-app-secret-0123456789',
  },
};

const connectionOf = (id: string) => (id === 'fb-conn' || id === 'fb-own' ? CONNECTIONS[id] : null);

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
    reportIntegration: async (orgId: string, key: string, state: string, count?: number | null) => {
      asked.reports.push([orgId, key, state, count]);
    },
    forOrg: () => ({
      ...ticketFieldCalls,
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
        // Core names the caller of 88001122, keeps the customers frontline made, without a name
        // until a test gives one, and has forgotten every other customer.
        get: async ({ id }: { id: string }) => {
          if (id === 'customer-88001122') return { id, firstName: 'Dulam', lastName: 'Dorj' };

          const made = /^customer-(\d+)$/.exec(id)?.[1];

          if (!made || Number(made) > asked.customers)
            throw new ORPCError('NOT_FOUND', { message: 'No such customer' });

          return { id, firstName: null, lastName: null, avatarUrl: asked.avatars.get(id) ?? null };
        },
        update: async ({ id, avatarUrl }: { id: string; avatarUrl?: string }) => {
          if (avatarUrl) asked.avatars.set(id, avatarUrl);

          return { id };
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
      // Core's Facebook connections, which the owner approved frontline to use.
      integrations: {
        usable: async ({ key }: { key: string }) => ({
          data:
            key === 'facebook'
              ? Object.entries(CONNECTIONS).map(([id, { name }]) => ({
                  id,
                  key,
                  name,
                  settings: {},
                  status: 'active',
                  createdAt: '2026-11-20T00:00:00Z',
                }))
              : [],
        }),
        credentials: async ({ id }: { id: string }) => {
          asked.credentials.push(id);

          const connection = connectionOf(id);

          if (!connection) throw new ORPCError('NOT_FOUND', { message: 'No such connection' });

          return {
            connectionId: id,
            key: 'facebook',
            accessToken: connection.accessToken,
            expiresAt: null,
            account: connection.name,
            appId: connection.appId,
            appSecret: connection.appSecret,
          };
        },
      },
      notifications: {
        create: async (input: unknown) => {
          asked.notifications.push(input);

          return { ok: true };
        },
      },
      agents: {
        submit: async (input: Record<string, unknown>) => {
          if (input.text === asked.refusedByAgent) throw new Error('ASSISTANT_BUSY');

          asked.submitted.push(input);

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
  enqueueJob: async (_tx: unknown, job: unknown) => {
    asked.jobs.push(job);
  },
  verifyCoreCall: async (token: string) => {
    const [kind, orgId, userId] = token.split(':');

    if (kind !== 'core-call' || !orgId || !userId) throw new Error('not signed by core');

    return { orgId, userId, automationId: 'automation-1', runId: 'run-1', stepId: 'step-1' };
  },
  verifyCoreEvent: async (authorization: string | undefined, raw: string) => {
    if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

    return actual.DeliveredEvent.parse(JSON.parse(raw));
  },
});
