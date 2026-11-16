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
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

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

/** A list page with a new record of `contentType` drafted in core's side panel. */
export const newRecordPath = (list: string, contentType: string) =>
  `${list}?${new URLSearchParams({ panel: `/detail/${contentType}/new` }).toString()}`;

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

  await page.goto(newRecordPath('/frontline/settings/channels', 'frontline:channel'));
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
        const body = await response.text();

        return new Response(body || null, {
          status: response.status(),
          headers: response.headers(),
        });
      },
    }),
  );

  return client;
};

/** Fails on serious or critical axe violations, listing each rule with the elements that break it. */
export const expectAccessible = async (page: Page) => {
  // Colours are checked at rest: once the page's data is in, so nothing fades in under axe, and
  // its animations end. Spinners loop forever, so only finite animations are waited for.
  await page.waitForLoadState('networkidle');
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
type NewMember = (permissions: string[]) => Promise<{ page: Page; fullName: string }>;

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

      await api.users.invite({ ...credentials, role: role.key, fullName });

      const context = await browser.newContext({ baseURL, colorScheme });

      contexts.push(context);

      const page = await context.newPage();
      const asMember = coreClient(page.request, baseURL);

      await asMember.auth.signIn(credentials);
      await asMember.auth.onboarded({ language: 'en' });

      return { page, fullName };
    });

    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };
