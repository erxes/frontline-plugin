import type { PluginMember } from '@erxes/plugin-sdk';
import { createRouterClient } from '@orpc/server';
import { PERMISSIONS } from '#/core.ts';
import { router } from '#/router.ts';

/** A signed-in member of `orgId`, as server.ts hands it to procedures. */
export const memberOf = (
  orgId: string,
  permissions: string[] = Object.values(PERMISSIONS),
  userId = `user-${orgId}`,
) =>
  ({
    userId,
    orgId,
    role: 'member',
    permissions,
    can: (action) => permissions.includes(action),
    tier: 'pro',
    access: 'full',
    canChange: () => true,
  }) satisfies PluginMember;

/** The typed client the UI uses, served in-process as that member. */
export const clientAs = (orgId: string, permissions?: string[], userId?: string) =>
  createRouterClient(router, { context: { member: memberOf(orgId, permissions, userId) } });
