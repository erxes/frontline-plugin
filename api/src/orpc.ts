import type { PluginMember } from '@erxes/plugin-sdk';
import { checksPermission } from '@erxes/plugin-sdk/openapi';
import { type InferSchemaOutput, ORPCError, os } from '@orpc/server';
import type { z } from 'zod';
import { withOrg } from '#/db/client.ts';

/** server.ts has verified the session token: `context.member` is the signed-in member. */
const base = os.$context<{ member: PluginMember }>();

/** A permission, or a list of them any one of which lets the member in. */
type Action = string | readonly string[];

const allowed = (action: Action, change: boolean) => {
  const actions = typeof action === 'string' ? [action] : action;

  return checksPermission(
    base.middleware(({ context: { member }, next }) => {
      if (!actions.some((one) => member.can(one))) {
        throw new ORPCError('FORBIDDEN', {
          message: `You need the ${actions.join(' or ')} permission`,
        });
      }

      if (change && !member.canChange()) {
        throw new ORPCError('FORBIDDEN', { message: 'Read-only: this plugin left your plan' });
      }

      return next();
    }),
    actions,
    { reads: !change },
  );
};

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
 * A procedure that asks core or another service first: `ask` runs once the member holds
 * `action`, before the transaction opens, since outside calls stay out of it and hold no
 * connection or lock; the handler gets its answer as `context.fromCore`.
 */
const asksFirst =
  (change: boolean) =>
  <Schema extends z.ZodType, Answer>(
    action: string,
    input: Schema,
    ask: (member: PluginMember, input: InferSchemaOutput<Schema>) => Promise<Answer>,
  ) =>
    base
      .use(allowed(action, change))
      .input(input)
      .use(async ({ context: { member }, next }, parsed) =>
        next({ context: { fromCore: await ask(member, parsed) } }),
      )
      .use(inOrg);

/** A read that asks first: see `asksFirst`. */
export const readsWithCore = asksFirst(false);

/** A change that asks first, and is refused while the organisation is read-only. */
export const writesWithCore = asksFirst(true);
