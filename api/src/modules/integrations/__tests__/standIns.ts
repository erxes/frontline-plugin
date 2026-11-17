import type * as Sdk from '@erxes/plugin-sdk';
import type * as CoreModule from '#/core.ts';

/**
 * What frontline asked of core in a test: the customers senders become, the notifications
 * members get and the jobs it queued. `vi.mock` loads this module before the app, so it imports
 * nothing of the app's.
 */
export const asked = { customers: 0, notifications: [] as unknown[], jobs: [] as unknown[] };

/** `#/core.ts` with core's calls answered here: `vi.mock('#/core.ts', …coreStandIn)`. */
export const coreStandIn = (actual: typeof CoreModule) => ({
  ...actual,
  core: {
    ...actual.core,
    forOrg: () => ({
      customers: {
        create: async () => {
          asked.customers += 1;

          return { id: `customer-${asked.customers}` };
        },
        // Core's customer with the email or phone: the same one for the same address or number.
        findOrCreate: async (input: { primaryEmail?: string; primaryPhone?: string }) => ({
          customer: {
            id: `customer-${input.primaryEmail ?? input.primaryPhone ?? 'without-contact'}`,
          },
        }),
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
      // Core's storage, as `files.createUpload`, a PUT to its address, then `files.complete`.
      files: {
        createUpload: async (input: { name: string }) => ({
          file: { id: `file-${input.name}` },
          upload: {
            method: 'PUT',
            url: `https://files.core.test/${input.name}`,
            headers: {},
            expiresAt: '2026-11-15T12:00:00Z',
          },
        }),
        complete: async ({ id }: { id: string }) => ({
          id,
          name: id.replace('file-', ''),
          contentType: 'audio/wav',
          size: 4,
          url: `https://files.core.test/${id}`,
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
 * The SDK with core's job queue answered here, and core's automation calls signed with a token
 * `core-call:<orgId>:<userId>`.
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
});
