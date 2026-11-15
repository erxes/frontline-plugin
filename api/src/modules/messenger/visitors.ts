import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { type BrowserInfo, visitors } from '#/db/messenger.ts';
import { logger } from '#/logger.ts';
import { messenger } from './adapter.ts';
import type { Visitor } from './session.ts';

/** The email or phone a visitor leaves, and their name if they give it. */
export const Identity = z
  .object({
    email: z.email().max(320).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
  })
  .refine((identity) => identity.email ?? identity.phone, {
    message: 'Leave an email or a phone number',
    path: ['email'],
  });

/**
 * The core customer with the visitor's email or phone, made a lead when there is none. Their
 * conversations so far, written as an anonymous visitor, move to that customer.
 */
export const identify = async (visitor: Visitor, identity: z.infer<typeof Identity>) => {
  const { customer } = await core.forOrg(visitor.orgId).customers.findOrCreate({
    primaryEmail: identity.email,
    primaryPhone: identity.phone,
    firstName: identity.firstName,
    lastName: identity.lastName,
    state: 'lead',
    source: messenger.kind,
  });

  if (customer.id !== visitor.customerId)
    await withOrg(visitor.orgId, (tx) =>
      tx
        .update(conversations)
        .set({ customerId: customer.id })
        .where(
          and(
            eq(conversations.integrationId, visitor.integrationId),
            eq(conversations.customerId, visitor.customerId),
          ),
        ),
    );

  return { ...visitor, customerId: customer.id, identified: true };
};

/** Tells the open inbox screens that a visitor came or went. */
const signalVisitors = (tx: Tx, orgId: string) =>
  tx.execute(sql`select core_live_signal(${orgId}, ${PLUGIN}, 'visitors')`);

type Seen = { browser?: BrowserInfo; remoteAddress?: string };

/**
 * Keeps what the messenger knows of the visitor: which messenger they use, when they were last
 * seen, the page and browser they said, and with `visit` one more session.
 */
export const recordVisit = (visitor: Visitor, seen: Seen, visit: boolean) =>
  withOrg(visitor.orgId, async (tx) => {
    const now = new Date();
    const known = { integrationId: visitor.integrationId, lastSeenAt: now, ...seen };

    await tx
      .insert(visitors)
      .values({
        orgId: visitor.orgId,
        customerId: visitor.customerId,
        sessionCount: visit ? 1 : 0,
        ...known,
      })
      .onConflictDoUpdate({
        target: [visitors.orgId, visitors.customerId],
        set: visit ? { ...known, sessionCount: sql`${visitors.sessionCount} + 1` } : known,
      });
    await signalVisitors(tx, visitor.orgId);
  });

/** Marks the visitor online while a messenger of theirs streams, and offline when the last closes. */
export const setOnline = (visitor: Visitor, isOnline: boolean) =>
  withOrg(visitor.orgId, async (tx) => {
    await tx
      .update(visitors)
      .set({ isOnline, lastSeenAt: new Date() })
      .where(eq(visitors.customerId, visitor.customerId));
    await signalVisitors(tx, visitor.orgId);
  });

/** The members a messenger shows as its team: names and pictures from core, in its order. */
export const supportersOf = async (orgId: string, ids: string[]) => {
  if (ids.length === 0) return [];

  const users = await core
    .forOrg(orgId)
    .users.list({ ids: ids.join(','), limit: ids.length })
    .catch((error: unknown) => {
      logger.error({ err: error, orgId }, 'messenger supporters failed');

      return { data: [] };
    });

  return ids.flatMap((id) => {
    const user = users.data.find((row) => row.id === id);

    return user ? [{ id, name: user.fullName ?? user.username, avatarUrl: user.avatarUrl }] : [];
  });
};
