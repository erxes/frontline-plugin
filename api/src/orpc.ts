import type { PluginMember } from '@erxes/plugin-sdk';
import { type InferSchemaOutput, ORPCError, os } from '@orpc/server';
import type { z } from 'zod';
import { withOrg } from '#/db/client.ts';

/** server.ts has verified the session token: `context.member` is the signed-in member. */
const base = os.$context<{ member: PluginMember }>();

/** A permission, or a list of them any one of which lets the member in. */
type Action = string | readonly string[];

const allowed = (action: Action, change: boolean) =>
  base.middleware(({ context: { member }, next }) => {
    const actions = typeof action === 'string' ? [action] : action;

    if (!actions.some((one) => member.can(one))) {
      throw new ORPCError('FORBIDDEN', {
        message: `You need the ${actions.join(' or ')} permission`,
      });
    }

    if (change && !member.canChange()) {
      throw new ORPCError('FORBIDDEN', { message: 'Read-only: this plugin left your plan' });
    }

    return next();
  });

const inOrg = base.middleware(async ({ context: { member }, next }) => {
  const later: (() => Promise<void>)[] = [];

  const result = await withOrg(member.orgId, async (tx) =>
    next({ context: { tx, afterCommit: (task: () => Promise<void>) => later.push(task) } }),
  );

  // Core calls go here, so a failed one can't roll the change back. Each logs its own failure.
  await Promise.all(later.map(async (task) => task()));

  return result;
});

/** A read: the member holds `action`; `context.tx` is their organisation's transaction. */
export const reads = (action: Action) => base.use(allowed(action, false)).use(inOrg);

/** A change: like `reads`, and refused while the organisation is read-only. */
export const writes = (action: string) => base.use(allowed(action, true)).use(inOrg);

/**
 * A read that asks core first: `ask` runs once the member holds `action`, before the
 * transaction opens, since core calls stay outside it; the handler gets its answer as
 * `context.fromCore`.
 */
export const readsWithCore = <Schema extends z.ZodType, Answer>(
  action: string,
  input: Schema,
  ask: (member: PluginMember, input: InferSchemaOutput<Schema>) => Promise<Answer>,
) =>
  base
    .use(allowed(action, false))
    .input(input)
    .use(async ({ context: { member }, next }, parsed) =>
      next({ context: { fromCore: await ask(member, parsed) } }),
    )
    .use(inOrg);
