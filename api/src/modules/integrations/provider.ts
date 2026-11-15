import type { z } from 'zod';
import type { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import type { Attachment } from '#/db/table.ts';
import { openSecret } from './secrets.ts';

export type ProviderName = (typeof PROVIDERS)[number];

export type AccountRow = typeof integrationAccounts.$inferSelect;

/** An account with its settings and secrets read through its provider's schemas. */
export interface OpenAccount<Config, Secret> {
  row: AccountRow;
  config: Config;
  secret: Secret;
}

/** A message that reached a connected account, in the inbox's terms. */
export interface InboundMessage {
  /** The provider's id for the conversation: a page-scoped user id, a chat id, a mail thread. */
  threadId: string;
  /** The provider's id for the message, so a repeated delivery adds nothing. */
  messageId: string;
  /** The customer who wrote it, by their id at the provider. */
  author: { externalId: string; name?: string };
  text: string;
  /** What only the provider's own code reads back, such as a mail's subject. */
  providerData?: Record<string, unknown>;
  attachments: Attachment[];
}

/** A reply the inbox sends through an account. */
export interface OutboundMessage {
  /** The conversation's id at the provider. */
  threadId: string;
  /** The customer's id at the provider: for mail, their address. */
  to: string;
  text: string;
  attachments: Attachment[];
  /** The customer's last message, which the reply answers. */
  replyTo: { externalId: string; providerData: Record<string, unknown> | null } | null;
}

/** What a provider does for the inbox, given one of its accounts. */
interface ProviderSpec<Config, Secret> {
  name: ProviderName;
  Config: z.ZodType<Config>;
  Secret: z.ZodType<Secret>;
  /** Resolves to why the provider refuses the account, or null while it works. */
  check: (account: OpenAccount<Config, Secret>) => Promise<string | null>;
  /** Sends a reply and resolves to the provider's id for it. */
  send: (account: OpenAccount<Config, Secret>, message: OutboundMessage) => Promise<string>;
  /** Stops the provider sending events for an account that is being removed. */
  disconnect?: (account: OpenAccount<Config, Secret>) => Promise<void>;
}

/**
 * A provider, as shared code uses it: `open` reads an account row through the provider's schemas
 * and binds its calls, so code that holds any provider never names one or its types.
 */
export const defineProvider = <Config, Secret>(spec: ProviderSpec<Config, Secret>) => ({
  name: spec.name,
  open: (row: AccountRow) => {
    const account: OpenAccount<Config, Secret> = {
      row,
      config: spec.Config.parse(row.config),
      secret: openSecret(row.orgId, row.secret, spec.Secret),
    };

    return {
      account,
      check: () => spec.check(account),
      send: (message: OutboundMessage) => spec.send(account, message),
      disconnect: async () => {
        await spec.disconnect?.(account);
      },
    };
  },
});

export type Provider = ReturnType<typeof defineProvider>;

/** `step` over `items` one at a time, for calls whose order the provider or the inbox keeps. */
export const inOrder = <T, R>(items: T[], step: (item: T) => Promise<R>) =>
  items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await step(item)],
    Promise.resolve([]),
  );

/** A POST to `/api/public/webhooks/<source>/<key>`, before anything in it is trusted. */
export interface WebhookRequest {
  /** The key in the address, for providers that post to one per account. */
  key: string | undefined;
  /** The body as sent, which signatures cover. */
  raw: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** The events one delivery carries for one account, found by its route. */
export interface Routed {
  provider: ProviderName;
  key: string;
  events: unknown[];
}

/** A provider's webhook, at `/api/public/webhooks/<name>`: it names the accounts, then reads them. */
export interface WebhookSource {
  /** The answer to the address check some providers send first, or null to refuse it. */
  confirm?: (query: Record<string, unknown>) => string | null;
  /** The accounts a delivery addresses with their events, or null when it isn't the provider's. */
  route: (request: WebhookRequest) => Routed[] | null;
  /** The messages in one account's events, or null when the delivery isn't that account's. */
  receive: (row: AccountRow, events: unknown[], request: WebhookRequest) => InboundMessage[] | null;
}
