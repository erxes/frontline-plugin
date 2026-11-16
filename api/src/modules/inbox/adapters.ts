import type { z } from 'zod';
import type { Attachment } from '#/db/table.ts';
import { PROVIDER_ADAPTERS } from '../integrations/adapters.ts';
import { messenger } from '../messenger/adapter.ts';

/** A member's reply on its way to the customer, as its adapter gets it. */
type Outgoing = {
  orgId: string;
  integration: { id: string; config: Record<string, unknown> };
  conversation: { id: string; externalId: string | null; customerId: string };
  message: {
    id: string;
    content: string;
    attachments: Attachment[];
    userId: string | null;
    /** What the adapter keeps on its own messages, such as a new mail's subject. */
    providerData: Record<string, unknown> | null;
  };
};

/**
 * One kind of integration: how the inbox reaches its customers. Inbox code calls these and never
 * names a provider. Inbound messages come the other way, through `receive` (`receive.ts`).
 */
export type Adapter = {
  /** The integration's `kind`. */
  kind: string;
  label: string;
  /** The integration's `config`, as the adapter reads and writes it. */
  config: z.ZodType<Record<string, unknown>>;
  /**
   * Sends a reply once it commits, retried by core as the `messages.send` job, and returns the
   * provider's message id. Without it a reply is delivered when it commits: the messenger's
   * visitors read theirs from the inbox.
   */
  send?: (outgoing: Outgoing) => Promise<{ externalId: string | null }>;
};

/** Every adapter, by kind. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [messenger, ...PROVIDER_ADAPTERS].map((adapter) => [adapter.kind, adapter]),
);
