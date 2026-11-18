import { randomUUID } from 'node:crypto';
import { CustomFieldsPatch } from '@erxes/core-contract';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { type BrowserInfo, visitors } from '#/db/messenger.ts';
import { logger } from '#/logger.ts';
import { customerFor } from '../inbox/receive.ts';
import { messenger } from './adapter.ts';
import type { Identity } from './identity.ts';
import type { Visitor } from './session.ts';

type Messenger = Pick<Visitor, 'orgId' | 'integrationId'>;

/** A new anonymous visitor: a core lead linked by a visitor id only the server makes. */
export const newVisitor = async (found: Messenger): Promise<Visitor> => ({
  ...found,
  identified: false,
  verified: false,
  customerId: await customerFor(found.orgId, {
    source: messenger.kind,
    externalId: randomUUID(),
    firstName: 'Visitor',
  }),
});

/**
 * The visitor as the customer the website signed. An anonymous visitor's conversations so far
 * move to that customer; a verified visitor's stay with the customer they belong to.
 */
export const verify = async (from: Visitor | null, found: Messenger, customerId: string) => {
  if (from && !from.verified && from.customerId !== customerId)
    await withOrg(from.orgId, (tx) =>
      tx
        .update(conversations)
        .set({ customerId })
        .where(
          and(
            eq(conversations.integrationId, from.integrationId),
            eq(conversations.customerId, from.customerId),
          ),
        ),
    );

  return { ...found, customerId, identified: true, verified: true };
};

/**
 * Saves the contact an anonymous visitor typed on the lead the messenger made for them. An
 * unsigned email or phone never finds another customer. Core refusing it, as when another
 * customer has it, is logged and the visit goes on.
 */
export const fillIn = async (visitor: Visitor, identity: Identity) => {
  await core
    .forOrg(visitor.orgId)
    .customers.update({
      id: visitor.customerId,
      primaryEmail: identity.email,
      primaryPhone: identity.phone,
      firstName: identity.firstName,
      lastName: identity.lastName,
    })
    .catch((error: unknown) =>
      logger.warn(
        { err: error, orgId: visitor.orgId, integrationId: visitor.integrationId },
        "the visitor's contact was not saved",
      ),
    );

  return { ...visitor, identified: true };
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
 * Saves the website's data on the visitor's customer: their own lead, or the customer the website
 * signed them in as. An existing company never takes the website's data. Core checks the values;
 * a refusal is logged and the visit goes on.
 */
export const saveVisitorData = async (visitor: Visitor, data: VisitorData) => {
  await saveOn(visitor, data).catch((error: unknown) =>
    logger.warn(
      { err: error, orgId: visitor.orgId, integrationId: visitor.integrationId },
      "the visitor's data was not saved",
    ),
  );
};

/**
 * Tells the members who have the visitor's conversation open that they came or went. A topic per
 * visitor, so a busy site's page views reach only the screens showing that visitor.
 */
const signalVisitor = (tx: Tx, { orgId, customerId }: Visitor) =>
  tx.execute(
    sql`select core_live_signal(${orgId}, ${PLUGIN}, ${`visitor.${customerId.toLowerCase()}`})`,
  );

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
    await signalVisitor(tx, visitor);
  });

/** Marks the visitor online while a messenger of theirs streams, and offline when the last closes. */
export const setOnline = (visitor: Visitor, isOnline: boolean) =>
  withOrg(visitor.orgId, async (tx) => {
    await tx
      .update(visitors)
      .set({ isOnline, lastSeenAt: new Date() })
      .where(eq(visitors.customerId, visitor.customerId));
    await signalVisitor(tx, visitor);
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
