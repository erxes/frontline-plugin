import { expect, type APIRequestContext } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

/** The messenger's signed-out API on the plugin's `api`, as a website's widget calls it. */
export const messengerApi = (api: string) => `${api}/public/messenger`;

const Connected = z.object({ token: z.string() });

const Sent = z.object({ conversationId: z.string() });

/** The latest page of a conversation's messages, newest first. */
const VisitorMessages = z.object({
  items: z.array(z.object({ content: z.string(), fromVisitor: z.boolean() })),
});

/**
 * A website visitor of the plugin at `plugin`: connects with the messenger's key, as the customer
 * with `identity`'s email when given, then writes and reads as the widget does. Each visitor comes
 * from its own address, which the e2e stack trusts (`TRUST_PROXY` in compose.yml), so the API's
 * per-IP limits count each apart, as they would visitors of a real site.
 */
export const visitorOf = async (
  request: APIRequestContext,
  plugin: string,
  key: string,
  identity?: { email: string; firstName: string },
) => {
  const from = { 'x-forwarded-for': `10.0.${randomInt(256)}.${randomInt(1, 255)}` };
  const messenger = messengerApi(plugin);

  const connected = await request.post(`${messenger}/connect`, {
    headers: from,
    data: { key, identity },
  });

  expect(connected.status()).toBe(200);

  const { token } = Connected.parse(await connected.json());
  const headers = { ...from, authorization: `Bearer ${token}` };

  return {
    write: async (content: string, conversationId?: string) => {
      const sent = await request.post(`${messenger}/messages`, {
        headers,
        data: { content, conversationId },
      });

      expect(sent.status()).toBe(201);

      return Sent.parse(await sent.json()).conversationId;
    },
    /** Posts to one of the conversation's routes: `typing`, `person` or `read`. */
    tell: async (conversationId: string, route: string) => {
      const told = await request.post(`${messenger}/conversations/${conversationId}/${route}`, {
        headers,
      });

      expect(told.ok()).toBe(true);
    },
    read: async (conversationId: string) => {
      const listed = await request.get(`${messenger}/conversations/${conversationId}/messages`, {
        headers,
      });

      const { items } = VisitorMessages.parse(await listed.json());

      return items.map((message) => message.content).toReversed();
    },
  };
};
