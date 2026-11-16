import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError, os } from '@orpc/server';
import { withOrg } from '#/db/client.ts';

/** server.ts has verified the session token: `context.member` is the signed-in member. */
const base = os.$context<{ member: PluginMember }>();

const inOrg = (action: string, change: boolean) =>
  base.middleware(async ({ context: { member }, next }) => {
    if (!member.can(action)) {
      throw new ORPCError('FORBIDDEN', { message: `You need the ${action} permission` });
    }

    if (change && !member.canChange()) {
      throw new ORPCError('FORBIDDEN', { message: 'Read-only: this plugin left your plan' });
    }

    const later: (() => Promise<void>)[] = [];

    const result = await withOrg(member.orgId, async (tx) =>
      next({ context: { tx, afterCommit: (task: () => Promise<void>) => later.push(task) } }),
    );

    // Core calls go here, so a failed one can't roll the change back. Each logs its own failure.
    await Promise.all(later.map(async (task) => task()));

    return result;
  });

/** A read: the member holds `action`; `context.tx` is their organisation's transaction. */
export const reads = (action: string) => base.use(inOrg(action, false));

/** A change: like `reads`, and refused while the organisation is read-only. */
export const writes = (action: string) => base.use(inOrg(action, true));
