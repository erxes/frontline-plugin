// Who each provider's people are in core: a Facebook sender, a Discord user, a mail address, a
// phone number, linked to the core customer old erxes made for them. Also the messenger presence
// old core kept on customers, and response templates.
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import { createdOf, dateOf, entriesOf, idOf, intOf, plain, textOf, docId } from '../values.ts';
import { already, FALLBACK_CHANNEL } from './structure.ts';

type LinkSource = {
  database: 'erxes' | 'erxes_office_integrations';
  collection: string;
  source: string;
  externalField: string;
  customerField: string;
  normalize?: (value: string) => string;
};

const lower = (value: string) => value.toLowerCase();

/** `+976 9911-2233` as `97699112233`, as call records compare numbers. */
const digits = (value: string) => value.replace(/[^\d+]/g, '');

const LINKS: LinkSource[] = [
  ...(['erxes', 'erxes_office_integrations'] as const).flatMap((database) => [
    {
      database,
      collection: 'customers_facebooks',
      source: 'facebook',
      externalField: 'userId',
      customerField: 'erxesApiId',
    },
    {
      database,
      collection: 'instagram_customers',
      source: 'instagram',
      externalField: 'userId',
      customerField: 'erxesApiId',
    },
  ]),
  {
    database: 'erxes',
    collection: 'customers_discords',
    source: 'discord',
    externalField: 'userId',
    customerField: 'erxesApiId',
  },
  {
    database: 'erxes',
    collection: 'customers_telegrams',
    source: 'telegram',
    externalField: 'userId',
    customerField: 'erxesApiId',
  },
  {
    database: 'erxes',
    collection: 'mail_customers',
    source: 'mail',
    externalField: 'email',
    customerField: 'contactsId',
    normalize: lower,
  },
  {
    database: 'erxes',
    collection: 'imap_customers',
    source: 'mail',
    externalField: 'email',
    customerField: 'contactsId',
    normalize: lower,
  },
  {
    database: 'erxes_office_integrations',
    collection: 'customers_nylas_imaps',
    source: 'mail',
    externalField: 'email',
    customerField: 'erxesApiId',
    normalize: lower,
  },
  {
    database: 'erxes_office_integrations',
    collection: 'customers_nylas_gmails',
    source: 'mail',
    externalField: 'email',
    customerField: 'erxesApiId',
    normalize: lower,
  },
  {
    database: 'erxes',
    collection: 'calls_customers',
    source: 'phone',
    externalField: 'primaryPhone',
    customerField: 'erxesApiId',
    normalize: digits,
  },
  {
    database: 'erxes',
    collection: 'customers_callpros',
    source: 'phone',
    externalField: 'phoneNumber',
    customerField: 'erxesApiId',
    normalize: digits,
  },
  {
    database: 'erxes',
    collection: 'cloudflare_calls_customers',
    source: 'phone',
    externalField: 'primaryPhone',
    customerField: 'erxesApiId',
    normalize: digits,
  },
];

const linkStep = (link: LinkSource): Step => ({
  source: `${link.database}.${link.collection}`,
  documents: (ctx) =>
    ctx.find(link.database === 'erxes' ? ctx.main : ctx.officeIntegrations, link.collection),
  transform: (doc, ctx) => {
    const raw = textOf(doc[link.externalField]);
    const externalId = raw && link.normalize ? link.normalize(raw) : raw;
    const customerId = ctx.customer(idOf(doc[link.customerField]));

    if (!externalId) return skip(`no ${link.externalField}`);

    if (!customerId) return skip('no core customer');

    return put([
      'frontline_customer_links',
      {
        source: link.source,
        external_id: externalId,
        customer_id: customerId,
        created_at: createdOf(doc, doc.createdAt),
      },
    ]);
  },
});

/**
 * Old core kept a messenger visitor's presence on the customer: last seen, visits and where from.
 * Customers the messenger never saw have none.
 */
const visitorStep: Step = {
  source: 'erxes.customers',
  documents: (ctx) => {
    ctx.report.note(
      'erxes.customers',
      'messenger presence only (core imports the customers): those a messenger saw',
    );

    return ctx
      .find(ctx.main, 'customers', {
        integrationId: { $exists: true, $ne: null },
        lastSeenAt: { $exists: true },
      })
      .project({
        integrationId: 1,
        lastSeenAt: 1,
        sessionCount: 1,
        location: 1,
      });
  },
  transform: (doc, ctx) => {
    const customerId = ctx.customer(docId(doc));
    const integration = ctx.integrations.get(idOf(doc.integrationId) ?? '');

    if (!customerId) return skip('no id');

    if (integration?.kind !== 'messenger') return skip('not a messenger visitor');

    const location = entriesOf(plain(doc.location));

    return put([
      'frontline_visitors',
      {
        customer_id: customerId,
        integration_id: integration.id,
        is_online: false,
        session_count: Math.max(intOf(doc.sessionCount) ?? 0, 0),
        last_seen_at: dateOf(doc.lastSeenAt) ?? undefined,
        browser: Object.fromEntries(location),
        remote_address: textOf(location.get('remoteAddress')),
      },
    ]);
  },
};

/** The channel of each old brand: where most of its integrations are. */
const brandChannels = new Map<string, string>();

const loadBrandChannels = async (ctx: Context) => {
  const counts = new Map<string, Map<string, number>>();

  for await (const doc of ctx.main
    .collection('integrations')
    .find({}, { projection: { brandId: 1, channelId: 1 } })) {
    const brandId = idOf(doc.brandId);
    const channelId = ctx.known('channel', idOf(doc.channelId));

    if (brandId && channelId) {
      const byChannel = counts.get(brandId) ?? new Map<string, number>();

      byChannel.set(channelId, (byChannel.get(channelId) ?? 0) + 1);
      counts.set(brandId, byChannel);
    }
  }

  for (const [brandId, byChannel] of counts) {
    const [top] = [...byChannel].toSorted((a, b) => b[1] - a[1]);

    if (top) brandChannels.set(brandId, top[0]);
  }
};

/** The channel of an old brand, for records old erxes kept per brand. */
export const brandChannel = async (ctx: Context, brandId: string | null) => {
  if (brandChannels.size === 0) await loadBrandChannels(ctx);

  return (brandId ? brandChannels.get(brandId) : undefined) ?? FALLBACK_CHANNEL;
};

const templateStep = (database: 'erxes' | 'erxes_office'): Step => ({
  source: `${database}.response_templates`,
  documents: (ctx) => ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'response_templates'),
  transform: async (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.name);

    if (!id || !name) return skip('no name');

    if (already(ctx, 'template', id)) return skip('already in erxes by id');

    ctx.remember('template', id, id);

    return put([
      'frontline_response_templates',
      {
        id,
        channel_id:
          ctx.known('channel', idOf(doc.channelId)) ?? (await brandChannel(ctx, idOf(doc.brandId))),
        name,
        content: textOf(doc.content) ?? '',
        created_by: ctx.user(idOf(doc.createdBy) ?? idOf(doc.userId)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      },
    ]);
  },
});

export const CUSTOMER_STEPS: Step[] = [
  ...LINKS.map(linkStep),
  visitorStep,
  templateStep('erxes'),
  templateStep('erxes_office'),
];
