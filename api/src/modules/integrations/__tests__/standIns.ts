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

/** The SDK with core's job queue answered here. */
export const sdkStandIn = (actual: typeof Sdk) => ({
  ...actual,
  enqueueJob: async (_tx: unknown, job: unknown) => {
    asked.jobs.push(job);
  },
});
