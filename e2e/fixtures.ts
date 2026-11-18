import { AxeBuilder } from '@axe-core/playwright';
import { CORE_API_PREFIX, coreContract } from '@erxes/core-contract';
import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { z } from 'zod';

export const OWNER_STATE = resolve(import.meta.dirname, 'test-results/.auth/owner.json');

/** The synthetic owner the setup project creates on the fresh database. */
export const OWNER = {
  organizationName: 'Frontline E2E',
  firstName: 'Olivia',
  lastName: 'Owner',
  email: 'owner@e2e.test',
  password: 'E2e-owner-pass-1',
};

/** A suffix that keeps records from parallel tests and reruns apart. */
export const unique = () => randomBytes(3).toString('hex');

/** Core's side panel, where records open and new ones are drafted. */
export const recordPanel = (page: Page) => page.locator('aside[data-record-side-panel]');

/** A list page with record `id` of `contentType` open in core's side panel, or a new one drafted. */
export const recordPath = (list: string, contentType: string, id = 'new') =>
  `${list}?${new URLSearchParams({ panel: `/detail/${contentType}/${id}` }).toString()}`;

/** Types `delete` into the confirm dialog and confirms. */
export const confirmDelete = async (page: Page) => {
  const confirm = page.getByRole('alertdialog');

  await confirm.getByRole('textbox').fill('delete');
  await confirm.getByRole('button', { name: 'Delete' }).click();
};

/** Creates a channel, with `memberName` in it when given, and leaves it open in the side panel. */
export const createChannel = async (page: Page, memberName?: string) => {
  const channel = `Support ${unique()}`;
  const panel = recordPanel(page);

  await page.goto(recordPath('/frontline/settings/channels', 'frontline:channel'));
  await panel.getByLabel('Name').fill(channel);

  if (memberName) {
    await panel.getByPlaceholder('Search members').fill(memberName);
    await panel.getByRole('option', { name: memberName }).click();
  }

  await panel.getByRole('button', { name: 'Create channel' }).click();
  await expect(panel.getByRole('link', { name: /Manage channel pipelines/ })).toBeVisible();

  return channel;
};

/** Creates a channel, with `memberName` in it when given, and opens its pipelines list. */
export const openChannelPipelines = async (page: Page, memberName?: string) => {
  const channel = await createChannel(page, memberName);

  await recordPanel(page)
    .getByRole('link', { name: /Manage channel pipelines/ })
    .click();
  await expect(page.getByText('No pipelines yet')).toBeVisible();

  return channel;
};

/** Drafts a pipeline in core's side panel from the list's header and saves it into the record. */
export const createPipeline = async (page: Page, name = `Returns ${unique()}`) => {
  const panel = recordPanel(page);

  await page.getByRole('button', { name: 'Create pipeline' }).click();
  // The draft replaces whatever record the panel held, whose fields also match Name.
  await expect(panel.getByRole('button', { name: 'Create pipeline' })).toBeVisible();
  await panel.getByLabel('Name').fill(name);
  await panel.getByRole('button', { name: 'Create pipeline' }).click();
  await expect(panel.getByRole('button', { name: `Name ${name}` })).toBeVisible();

  return name;
};

/**
 * Core's typed client over Playwright's request context, so it shares the page's
 * session cookie. Writes carry the header browsers send, which core's CSRF check reads.
 */
export const coreClient = (request: APIRequestContext, baseURL: string | undefined) => {
  const client: ContractRouterClient<typeof coreContract> = createORPCClient(
    new OpenAPILink(coreContract, {
      url: `${baseURL ?? ''}${CORE_API_PREFIX}`,
      fetch: async (call) => {
        const send = async () =>
          request.fetch(call.url, {
            method: call.method,
            headers: { ...Object.fromEntries(call.headers), 'sec-fetch-site': 'same-origin' },
            data: call.body ? Buffer.from(await call.clone().arrayBuffer()) : undefined,
          });

        // Core allows 20 sign-ins a minute per address, and parallel tests sign in more:
        // wait as long as its Retry-After says, then send again.
        let response = await send();

        while (response.status() === 429) {
          const seconds = Number(response.headers()['retry-after'] ?? '1');

          await new Promise((done) => setTimeout(done, seconds * 1000));
          response = await send();
        }

        // A 204 must have no body at all, not an empty one.
        const [body, status, headers] = [
          await response.text(),
          response.status(),
          response.headers(),
        ];

        return new Response(body || null, { status, headers });
      },
    }),
  );

  return client;
};

/**
 * Fails on serious or critical axe violations, listing each rule with the elements that break it.
 * Colours are checked at rest: once `shown`, which the page draws from its data, is visible, and
 * the page's animations end. Spinners loop forever, so only finite animations are waited for.
 */
export const expectAccessible = async (page: Page, shown: Locator) => {
  await expect(shown).toBeVisible();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );

  const { violations } = await new AxeBuilder({ page }).analyze();

  const blocking = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')}\n    ${node.html.slice(0, 200)}`)
          .join('\n')}`,
    );

  expect(blocking, `axe on ${page.url()}`).toEqual([]);
};

/** A member of the owner's organisation, signed in on their own page, whose role holds `permissions`. */
type NewMember = (permissions: string[]) => Promise<{ page: Page; id: string; fullName: string }>;

export const test = base.extend<{ api: ReturnType<typeof coreClient>; newMember: NewMember }>({
  api: async ({ page, baseURL }, use) => {
    await use(coreClient(page.request, baseURL));
  },
  newMember: async ({ api, browser, baseURL, colorScheme }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async (permissions) => {
      const suffix = unique();
      const role = await api.roles.create({ name: `Role ${suffix}`, permissions });
      const fullName = `Teammate ${suffix}`;
      const credentials = { email: `member-${suffix}@e2e.test`, password: 'Member-pass-12345' };

      const { id } = await api.users.invite({ ...credentials, role: role.key, fullName });

      const context = await browser.newContext({ baseURL, colorScheme });

      contexts.push(context);

      const page = await context.newPage();
      const asMember = coreClient(page.request, baseURL);

      await asMember.auth.signIn(credentials);
      await asMember.auth.onboarded({ language: 'en' });

      return { page, id, fullName };
    });

    await Promise.all(contexts.map((context) => context.close()));
  },
});

/** The plugin's member API, as its UI calls it with the member's session. */
const RPC = 'http://localhost:3399/api/rpc';

const Answer = z.object({ json: z.unknown() });

export const Id = z.object({ id: z.string() });

/** Calls the plugin's `path` procedure as the owner, with a plugin session core issued them. */
export const pluginApi = async (api: ReturnType<typeof coreClient>, request: APIRequestContext) => {
  const { token } = await api.plugins.session({ name: 'frontline' });

  return async <T extends z.ZodType>(path: string, input: unknown, Output: T) => {
    const response = await request.post(`${RPC}/${path}`, {
      headers: { authorization: `Bearer ${token}` },
      data: { json: input },
    });

    expect(response.status(), path).toBe(200);

    return Output.parse(Answer.parse(await response.json()).json);
  };
};

type Rpc = Awaited<ReturnType<typeof pluginApi>>;

/** The text of the article `knowledgeBase` publishes. */
export const ARTICLE = 'Write to us within 30 days.';

/**
 * A topic with a Billing category, its Cards subcategory and a published Refunds article, made
 * through the API. Returns the topic's id.
 */
export const knowledgeBase = async (rpc: Rpc, title: string) => {
  const create = (kind: string, input: unknown) => rpc(`knowledgebase/${kind}/create`, input, Id);
  const { id: topicId } = await create('topics', { title });
  const { id: parentId } = await create('categories', { topicId, title: 'Billing' });
  const article = { title: 'Refunds', summary: 'Money back', content: `<p>${ARTICLE}</p>` };

  await create('categories', { topicId, title: 'Cards', parentId });
  await create('articles', { ...article, categoryId: parentId, status: 'publish' });

  return topicId;
};

/** A channel with one pipeline, made through the API, by name and id. */
export const pipelineIn = async (rpc: Rpc) => {
  const channel = { name: `Support ${unique()}` };
  const { id: channelId } = await rpc('channels/create', channel, Id);
  const pipeline = { channelId, name: `Returns ${unique()}` };
  const { id } = await rpc('pipelines/create', pipeline, Id);

  return { channel: channel.name, channelId, name: pipeline.name, id };
};

const Messenger = z.object({ publicKey: z.string() });

/** The messenger settings the specs set when they add one through the API. */
type MessengerConfig = { welcome?: string; knowledgeBaseTopicId?: string };

/**
 * A website messenger added through the API with `config`, in `channelId` or a new channel.
 * Returns its key.
 */
export const messengerIn = async (rpc: Rpc, config: MessengerConfig, channelId?: string) => {
  const channel = channelId ?? (await rpc('channels/create', { name: `Site ${unique()}` }, Id)).id;
  const input = { channelId: channel, kind: 'messenger', name: 'Website', config };

  return (await rpc('integrations/create', input, Messenger)).publicKey;
};

const CallSettings = z.object({ webhookUrl: z.string() });

/**
 * A CallPro line in a new channel, connected through the API: no screen connects a phone line
 * yet. Returns how to post CallPro's events to it, as its servers do.
 */
export const callProLine = async (
  api: ReturnType<typeof coreClient>,
  request: APIRequestContext,
  phone: string,
) => {
  const rpc = await pluginApi(api, request);
  const channel = await rpc('channels/create', { name: `Phones ${unique()}` }, Id);
  const { id: accountId } = await rpc('integrations/callpro/connect', { phone }, Id);

  await rpc(
    'integrations/create',
    { channelId: channel.id, kind: 'callpro', name: phone, config: { accountId } },
    Id,
  );

  const { webhookUrl } = await rpc('integrations/call/settings', { accountId }, CallSettings);

  return async (callID: string, numberFrom: string, disp: string) => {
    const posted = await request.post(webhookUrl, {
      data: { callID, numberFrom, numberTo: phone, disp },
    });

    expect(posted.status()).toBe(200);
  };
};

/** Frontline's inbox. */
export const INBOX = '/frontline/inbox';

/** The messenger's signed-out API, as a website's widget calls it. */
export const MESSENGER = 'http://localhost:3399/api/public/messenger';

const Connected = z.object({ token: z.string() });

const Sent = z.object({ conversationId: z.string() });

/** The latest page of a conversation's messages, newest first. */
const VisitorMessages = z.object({
  items: z.array(z.object({ content: z.string(), fromVisitor: z.boolean() })),
});

/**
 * A website visitor: connects with the messenger's key, as the customer with `identity`'s email
 * when given, then writes and reads as the widget does.
 */
export const visitorOf = async (
  request: APIRequestContext,
  key: string,
  identity?: { email: string; firstName: string },
) => {
  const connected = await request.post(`${MESSENGER}/connect`, { data: { key, identity } });

  expect(connected.status()).toBe(200);

  const headers = { authorization: `Bearer ${Connected.parse(await connected.json()).token}` };

  return {
    write: async (content: string, conversationId?: string) => {
      const sent = await request.post(`${MESSENGER}/messages`, {
        headers,
        data: { content, conversationId },
      });

      expect(sent.status()).toBe(201);

      return Sent.parse(await sent.json()).conversationId;
    },
    /** Posts to one of the conversation's routes: `typing`, `person` or `read`. */
    tell: async (conversationId: string, route: string) => {
      const told = await request.post(`${MESSENGER}/conversations/${conversationId}/${route}`, {
        headers,
      });

      expect(told.ok()).toBe(true);
    },
    read: async (conversationId: string) => {
      const listed = await request.get(`${MESSENGER}/conversations/${conversationId}/messages`, {
        headers,
      });

      const { items } = VisitorMessages.parse(await listed.json());

      return items.map((message) => message.content).toReversed();
    },
  };
};

/** Opens `select` and picks `option` in it. */
export const pick = async (page: Page, select: Locator, option: string) => {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

/**
 * Moves `item` by keyboard with its drag `handle`: Space picks it up, `key` takes it over `to`,
 * Space drops it. Each key waits for the screen reader's announcement of the step before, which
 * names where the row is: dnd-kit listens for keys a moment after the pickup, so an arrow sent
 * as soon as the handle is pressed can be lost.
 */
export const moveByKeys = async (handle: Locator, key: string, item: string, to: string) => {
  const page = handle.page();

  await handle.press('Space');
  await expect(page.getByText(`${item} is held.`, { exact: true })).toBeAttached();
  await page.keyboard.press(key);
  await expect(page.getByText(`${item} is over ${to}.`, { exact: true })).toBeAttached();
  await page.keyboard.press('Space');
  await expect(page.getByText(`${item} dropped on ${to}.`, { exact: true })).toBeAttached();
};

/**
 * Adds a website messenger to `channel` from the inbox's header, which opens its settings page,
 * and returns its key.
 */
export const addMessenger = async (page: Page, channel: string) => {
  const panel = recordPanel(page);
  const name = `Website ${unique()}`;

  await page.getByRole('button', { name: 'Add messenger' }).first().click();
  await pick(page, panel.getByRole('combobox', { name: 'Channel' }), channel);
  await panel.getByLabel('Name').fill(name);
  await panel.getByLabel('Welcome message').fill('Hi, how can we help?');
  await panel.getByRole('button', { name: 'Add messenger' }).click();
  await expect(page).toHaveURL(/\/frontline\/inbox\/messengers\/[\w-]+$/);

  // The key is 32 random bytes, base64url, in the Install card's script line.
  const install = page.getByLabel('Messenger install code');

  await expect(install).toContainText('/widget/messenger.js?key=');

  return /key=([\w-]{43})/.exec((await install.textContent()) ?? '')?.[1] ?? '';
};

/** Adds Frontline's `titles` to core's home dashboard from its widget catalog, and saves. */
export const addTiles = async (page: Page, titles: string[]) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize' }).click();

  const catalog = page.locator('aside').filter({
    has: page.getByRole('heading', { name: 'Add widget' }),
  });

  for (const title of titles) {
    await catalog.getByPlaceholder('Search widgets').fill(title);
    await catalog.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  }

  await page.getByRole('button', { name: 'Done' }).click();
};

/** A tile on the home dashboard, by the title core draws over it. */
export const tileOf = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/**
 * A shop on another origin than the plugin, with the install code a member copied below its
 * heading, opened in a new tab. A real server, since Chrome lets only a loopback page reach the
 * loopback plugin. Disposing it stops the server.
 */
export const openShop = async (context: BrowserContext, installCode: string) => {
  const site = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(
      `<!doctype html><html lang="en"><title>Shop</title><main><h1>Shop</h1>${installCode}</main></html>`,
    );
  });

  await new Promise<void>((done) => site.listen(0, '127.0.0.1', done));

  const address = site.address();
  const shop = await context.newPage();

  await shop.goto(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`);

  return {
    shop,
    [Symbol.asyncDispose]: async () => {
      await shop.close();
      await site[Symbol.asyncDispose]();
    },
  };
};

/** The shop with the messenger of `key` on it, after the page's own `before`, opened by the visitor. */
export const openMessenger = async (context: BrowserContext, key: string, before = '') => {
  const script = new URL(`/widget/messenger.js?key=${key}`, MESSENGER);
  const tag = `<script type="module" src="${script.href}"></script>`;
  const site = await openShop(context, before + tag);

  await site.shop.getByRole('button', { name: 'Open the messenger' }).click();

  return { ...site, panel: site.shop.getByRole('dialog') };
};

export { expect };
