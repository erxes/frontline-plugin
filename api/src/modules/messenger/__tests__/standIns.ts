import type * as Sdk from '@erxes/plugin-sdk';
import type * as CoreModule from '#/core.ts';

// Tests never reach core. Ann is a customer already, on the silver plan; another email or phone
// finds a new lead. Changes to customers and messages to core's agents are kept for the test to
// read. `vi.mock` loads this module before the app, so it imports nothing of the app's.
export const core = {
  // Core refuses a message with this text, as when another server runs the conversation.
  refused: 'Is anyone there?',
  customers: 0,
  updates: [] as { id: string; primaryEmail?: string; customFields?: Record<string, unknown> }[],
  submitted: [] as Record<string, unknown>[],
};

export const coreStandIn = (actual: typeof CoreModule) => ({
  ...actual,
  core: {
    ...actual.core,
    forOrg: () => ({
      customers: {
        create: async () => {
          core.customers += 1;

          return { id: `customer-${core.customers}` };
        },
        findOrCreate: async ({ primaryEmail }: { primaryEmail?: string }) =>
          primaryEmail === 'ann@example.com'
            ? { customer: { id: 'customer-ann' }, created: false }
            : { customer: { id: `lead-${primaryEmail}` }, created: true },
        get: async ({ id }: { id: string }) => ({
          id,
          customFields: id === 'customer-ann' ? { plan: 'silver' } : {},
        }),
        update: async (change: (typeof core.updates)[number]) => {
          core.updates.push(change);

          return { id: change.id };
        },
      },
      notifications: { create: async () => ({ ok: true }) },
      agents: {
        submit: async (input: Record<string, unknown>) => {
          if (input.text === core.refused) throw new Error('ASSISTANT_BUSY');

          core.submitted.push(input);

          return { ok: true };
        },
      },
    }),
  },
});

// Core signs each event delivery; here the token `core-event` stands for its signature.
export const sdkStandIn = (actual: typeof Sdk) => ({
  ...actual,
  verifyCoreEvent: async (authorization: string | undefined, raw: string) => {
    if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

    return actual.DeliveredEvent.parse(JSON.parse(raw));
  },
});
