import { sql } from 'drizzle-orm';
import { check, index, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { id, stamps, table } from './table.ts';

/** A help center's colours, fonts and the HTML around its pages. */
export const HelpCenterStyles = z
  .object({
    mainLogo: z.string().max(2000),
    favicon: z.string().max(2000),
    bodyColor: z.string().max(20),
    headerColor: z.string().max(20),
    footerColor: z.string().max(20),
    helpCenterColor: z.string().max(20),
    backgroundColor: z.string().max(20),
    activeTabColor: z.string().max(20),
    baseFont: z.string().max(100),
    baseColor: z.string().max(20),
    headingFont: z.string().max(100),
    headingColor: z.string().max(20),
    linkColor: z.string().max(20),
    linkHoverColor: z.string().max(20),
    primaryButtonColor: z.string().max(20),
    secondaryButtonColor: z.string().max(20),
    dividerColor: z.string().max(20),
    headerHtml: z.string().max(20_000),
    footerHtml: z.string().max(20_000),
  })
  .partial();

/** The labels in a help center's header. */
export const HelpCenterHeader = z
  .object({
    wordmark: z.string().max(200),
    homeLabel: z.string().max(100),
    searchPlaceholder: z.string().max(200),
  })
  .partial();

const Link = z.object({ label: z.string().max(200), url: z.string().max(2000) });

/** A help center's footer: its logo, text and columns of links. */
export const HelpCenterFooter = z
  .object({
    logo: z.string().max(2000),
    description: z.string().max(2000),
    copyright: z.string().max(500),
    columns: z
      .array(z.object({ heading: z.string().max(200), links: z.array(Link).max(20) }))
      .max(6),
  })
  .partial();

export const DOMAIN_STATUSES = ['pending', 'active'] as const;

/** A DNS record the member adds so Cloudflare serves the help center on their domain. */
export const DomainRecord = z.object({
  type: z.string(),
  name: z.string(),
  value: z.string(),
  status: z.enum(DOMAIN_STATUSES),
});

export type DomainRecord = z.infer<typeof DomainRecord>;

/**
 * A public site of a knowledge base topic's published articles. Signed-out visitors reach it by
 * its `publicKey`, or by its own domain once Cloudflare serves it.
 */
export const helpCenters = table(
  'help_centers',
  {
    id: id(),
    orgId: text().notNull(),
    title: text().notNull(),
    description: text(),
    languageCode: text(),
    /** The key its public address carries (`frontline_public_keys`). */
    publicKey: text().notNull(),
    kbTopicId: text(),
    kbLabel: text(),
    color: text(),
    backgroundImage: text(),
    styles: jsonb().$type<z.infer<typeof HelpCenterStyles>>().notNull().default({}),
    header: jsonb().$type<z.infer<typeof HelpCenterHeader>>().notNull().default({}),
    footer: jsonb().$type<z.infer<typeof HelpCenterFooter>>().notNull().default({}),
    /** The member's own domain, once saved; Cloudflare issues its certificate. */
    hostname: text(),
    cloudflareId: text(),
    domainStatus: text({ enum: DOMAIN_STATUSES }),
    sslStatus: text({ enum: DOMAIN_STATUSES }),
    dnsStatus: text({ enum: DOMAIN_STATUSES }),
    /** The TXT and CNAME records to add, kept after Cloudflare stops returning them. */
    domainRecords: jsonb().$type<DomainRecord[]>().notNull().default([]),
    domainErrors: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** The background check looks at a pending domain until then. */
    domainCheckUntil: timestamp({ withTimezone: true }),
    domainCheckedAt: timestamp({ withTimezone: true }),
    ...stamps(),
  },
  (t) => [
    unique('frontline_help_centers_public_key_key').on(t.publicKey),
    unique('frontline_help_centers_hostname_key').on(t.hostname),
    index('frontline_help_centers_org_title_idx').on(t.orgId, t.title),
    check(
      'frontline_help_centers_status_check',
      sql`${t.domainStatus} in ('pending', 'active') and ${t.sslStatus} in ('pending', 'active') and ${t.dnsStatus} in ('pending', 'active')`,
    ),
  ],
);

/** The kinds of `frontline_public_keys` row that open a help center: its key, and its domain. */
export const HELP_CENTER_KEY = 'help-center';
export const HELP_CENTER_DOMAIN = 'help-center-domain';
