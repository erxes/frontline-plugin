import type * as Sdk from '@erxes/plugin-sdk';
import type * as CoreModule from '#/core.ts';
import { ticketFieldCalls } from '#/test/coreUnits.ts';

/**
 * What frontline asked of core in a test: the customers senders become, the notifications
 * members get and the jobs it queued. `vi.mock` loads this module before the app, so it imports
 * nothing of the app's.
 */
export const asked = {
  customers: 0,
  created: [] as unknown[],
  notifications: [] as unknown[],
  jobs: [] as unknown[],
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
    forOrg: () => ({
      ...ticketFieldCalls,
      customers: {
        create: async (input: unknown) => {
          asked.customers += 1;
          asked.created.push(input);

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
