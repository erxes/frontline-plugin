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

/**
 * Core's typed client over Playwright's request context, so it shares the page's
 * session cookie. Writes carry the header browsers send, which core's CSRF check reads.
 */
export const coreClient = (request: APIRequestContext, baseURL: string | undefined) => {
  const client: ContractRouterClient<typeof coreContract> = createORPCClient(
    new OpenAPILink(coreContract, {
      url: `${baseURL ?? ''}${CORE_API_PREFIX}`,
      fetch: async (call) => {
        const response = await request.fetch(call.url, {
          method: call.method,
          headers: { ...Object.fromEntries(call.headers), 'sec-fetch-site': 'same-origin' },
          data: call.body ? Buffer.from(await call.arrayBuffer()) : undefined,
        });

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
  // Colours are checked at rest; spinners loop forever, so only finite animations are waited for.
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
