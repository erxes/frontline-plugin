import type { z } from 'zod';
import type { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import type { StoredFile } from '#/db/table.ts';
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
  /** The customer who wrote it, by their id at the provider, and their email if it has one. */
  author: { externalId: string; name?: string; email?: string };
  text: string;
  /** What only the provider's own code reads back, such as a mail's subject. */
  providerData?: Record<string, unknown>;
  attachments: StoredFile[];
  /** Files the provider holds, kept in core's storage as attachments when the message is new. */
  files?: InboundFile[];
  /** The provider's id for the message this one answers, when the customer replied to one. */
  quotedId?: string;
  /** The manifest event automations start from, published with the message when it is new. */
  event?: string;
}

/** A file in a message the provider holds: read only to keep it. */
export interface InboundFile {
  name: string;
  contentType: string;
  bytes: () => Promise<Uint8Array>;
}

/** A customer's reactions on one message, as they stand now after a change at the provider. */
export interface InboundReaction {
  threadId: string;
  /** The provider's id for the message reacted to. */
  messageId: string;
  author: { externalId: string };
  /** Every emoji the customer has on the message now; none once they took theirs back. */
  emojis: string[];
}

/** What one account's webhook events carry. */
interface Inbound {
  messages: InboundMessage[];
  reactions: InboundReaction[];
}

/** A member's reaction on its way to the provider. */
export interface OutboundReaction {
  /** The conversation's id at the provider. */
  threadId: string;
  /** The customer's id at the provider: for mail, their address. */
  to: string;
  /** The provider's id for the message, and what it stored on it, such as a mail's subject. */
  message: { externalId: string; providerData: Record<string, unknown> | null };
  /** The emoji a member added or took back. */
  emoji: string;
  /** The team's emojis on the message after the change, oldest first: one bot or page reacts for all. */
  emojis: string[];
}

/** A reply the inbox sends through an account. */
export interface OutboundMessage {
  /** The conversation's id at the provider. */
  threadId: string;
  /** The customer's id at the provider: for mail, their address. */
  to: string;
  text: string;
  /** The member's rich text, for a provider that sends HTML; the others send `text`. */
  html: string | null;
  attachments: StoredFile[];
  /** What the provider's own code stored on this message, such as a new mail's subject. */
  providerData: Record<string, unknown> | null;
  /**
   * For a provider that sends a reply in parts, such as text then each file: the provider's ids of
   * the parts an earlier attempt sent, which it skips, and where it records each part it sends.
   */
  parts: { sent: string[]; record: (sent: string[]) => Promise<void> };
  /**
   * The provider's id for the message the member picked to answer, which the reply quotes as the
   * provider's own reply does; null when they answer the thread.
   */
  quotedId: string | null;
  /** The last message the reply answers: the customer's, or a new mail the thread began with. */
  replyTo: {
    externalId: string;
    providerData: Record<string, unknown> | null;
    createdAt: Date;
  } | null;
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
  /** Puts the team's reaction on the customer's message at the provider, for one that takes them. */
  react?: (account: OpenAccount<Config, Secret>, reaction: OutboundReaction) => Promise<void>;
  /** Stops the provider sending events for an account that is being removed. */
  disconnect?: (account: OpenAccount<Config, Secret>) => Promise<void>;
  /**
   * Points the provider's events at frontline again, as connecting did, for an account whose
   * webhook stopped. `webhookKey` is the key its deliveries name it by.
   */
  repair?: (account: OpenAccount<Config, Secret>, webhookKey: string | null) => Promise<void>;
  /** The name of a person the provider's events give only by id, or null when it has none. */
  whoIs?: (account: OpenAccount<Config, Secret>, externalId: string) => Promise<Person | null>;
}

/** A customer's name as a provider gives it. */
export interface Person {
  firstName: string;
  lastName?: string;
}

/**
 * A provider, as shared code uses it: `open` reads an account row through the provider's schemas
 * and binds its calls, so code that holds any provider never names one or its types.
 */
export const defineProvider = <Config, Secret>(spec: ProviderSpec<Config, Secret>) => ({
  name: spec.name,
  open: (row: AccountRow) => {
    const { react, repair } = spec;

    const account: OpenAccount<Config, Secret> = {
      row,
      config: spec.Config.parse(row.config),
      secret: openSecret(row.orgId, row.secret, spec.Secret),
    };

    return {
      account,
      check: () => spec.check(account),
      send: (message: OutboundMessage) => spec.send(account, message),
      react: react ? (reaction: OutboundReaction) => react(account, reaction) : null,
      disconnect: async () => {
        await spec.disconnect?.(account);
      },
      repair: async (webhookKey: string | null) => {
        await repair?.(account, webhookKey);
      },
      whoIs: async (externalId: string) => (await spec.whoIs?.(account, externalId)) ?? null,
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

/**
 * The provider no longer takes the account's token, as when a page's admin revokes it. The
 * account is broken until a repair or a new connect, so a reply fails at once rather than retry.
 */
export class AccountRefused extends Error {}

/**
 * Sends a reply's `parts` one at a time, in order, and resolves to the provider's id of each. It
 * skips the parts an earlier attempt sent and records each one as it goes, so a retry after a
 * failed part sends the rest and never one twice.
 */
export const sendInParts = async <T>(
  { sent, record }: OutboundMessage['parts'],
  parts: T[],
  send: (part: T) => Promise<string>,
) => {
  const ids = [...sent];

  await inOrder(parts.slice(ids.length), async (part) => {
    ids.push(await send(part));
    await record(ids);
  });

  return ids;
};

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
  /** The messages and reactions in one account's events, or null when the delivery isn't that account's. */
  receive: (row: AccountRow, events: unknown[], request: WebhookRequest) => Inbound | null;
}
