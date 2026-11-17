import { CustomFieldsPatch } from '@erxes/core-contract';
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
  const { customer, created } = await core.forOrg(visitor.orgId).customers.findOrCreate({
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

  return { ...visitor, customerId: customer.id, identified: true, owns: created };
};

/** What the website tells about the visitor beside who they are. */
export const VisitorData = z.object({
  /** Values of the customer's custom fields, by core field id. */
  customFields: CustomFieldsPatch.optional(),
  /** The company they are with: found by its name, else made with the rest. */
  company: z
    .object({
      name: z.string().trim().min(1).max(200),
      website: z.url().max(500).optional(),
      customFields: CustomFieldsPatch.optional(),
    })
    .optional(),
});

type VisitorData = z.infer<typeof VisitorData>;

/** The organisation's company named `name`, any case, or a new one with the website's data. */
const companyFor = async (
  orgId: string,
  { name, website, customFields }: NonNullable<VisitorData['company']>,
) => {
  const client = core.forOrg(orgId);
  const { data } = await client.companies.list({ search: name, limit: 20 });
  const found = data.find((company) => company.primaryName.toLowerCase() === name.toLowerCase());

  return (
    found ??
    (await client.companies.create({
      primaryName: name,
      names: [name],
      website,
      customFields,
      source: messenger.kind,
    }))
  );
};

/** The visitor's custom fields, and the company they work at, found or made. */
const saveOn = async (visitor: Visitor, { customFields, company }: VisitorData) => {
  const client = core.forOrg(visitor.orgId);

  if (customFields) await client.customers.update({ id: visitor.customerId, customFields });

  if (company)
    await client.customers.linkCompany({
      id: visitor.customerId,
      companyId: (await companyFor(visitor.orgId, company)).id,
    });
};

/**
 * Saves the website's data on a customer the messenger made, never on one an unchecked email or
 * phone found. An existing company never takes the website's data. Core checks the values; a
 * refusal is logged and the visit goes on.
 */
export const saveVisitorData = async (visitor: Visitor, data: VisitorData) => {
  if (!visitor.owns) return;

  await saveOn(visitor, data).catch((error: unknown) =>
    logger.warn(
      { err: error, orgId: visitor.orgId, integrationId: visitor.integrationId },
      "the visitor's data was not saved",
    ),
  );
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
