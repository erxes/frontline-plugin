import type { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import type { StoredFile } from '#/db/table.ts';
import { PROVIDER_ADAPTERS } from '../integrations/adapters.ts';
import { CALL_ADAPTERS } from '../integrations/providers/call/record.ts';
import { messenger } from '../messenger/adapter.ts';

/** A member's reply on its way to the customer, as its adapter gets it. */
export type Outgoing = {
  integration: { id: string; config: Record<string, unknown> };
  conversation: { id: string; externalId: string | null; customerId: string };
  message: {
    id: string;
    content: string;
    /** The member's rich text, or null for plain text. */
    html: string | null;
    attachments: StoredFile[];
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
   * Sends a reply once it commits, retried by core as the `messages.send` job. It reads what the
   * provider needs in `tx` and returns the call to the provider, which the caller makes once `tx`
   * ends and which gives the provider's message id. `record` keeps the ids of the parts of a reply
   * sent in parts, which come back in `providerData.parts`. Without it a reply is delivered when
   * it commits: the messenger's visitors read theirs from the inbox.
   */
  send?: (
    tx: Tx,
    outgoing: Outgoing,
  ) => Promise<
    (record: (sent: string[]) => Promise<void>) => Promise<{ externalId: string | null }>
  >;
  /**
   * Puts the team's reaction on a message at the provider: `emoji` is the one a member added or
   * took back, `emojis` the team's on the message after it. Like `send`, it reads in `tx` and
   * returns the provider's call. Without it members don't react.
   */
  react?: (
    tx: Tx,
    reaction: Omit<Outgoing, 'message'> & {
      message: { externalId: string | null; providerData: Record<string, unknown> | null };
      emoji: string;
      emojis: string[];
    },
  ) => Promise<() => Promise<void>>;
  /** Whether its customers see a survey message and vote on it, as the messenger's visitors do. */
  surveys?: boolean;
  /** Its conversations take internal notes only: a phone call has no thread to answer in. */
  notesOnly?: boolean;
};

/** Every adapter, by kind. */
export const ADAPTERS: ReadonlyMap<string, Adapter> = new Map(
  [messenger, ...PROVIDER_ADAPTERS, ...CALL_ADAPTERS].map((adapter) => [adapter.kind, adapter]),
);
