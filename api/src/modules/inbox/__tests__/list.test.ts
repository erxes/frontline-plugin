import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

type Values = Record<string, unknown>;

// Tests never reach core: each visitor becomes a customer of this stand-in, a search finds the
// customers a test sets, `ada@e2e.test` is a customer already, Acme is a company already, a
// field check applies the patch, and notifications go nowhere. Changes to customers and new
// companies are kept for the test to read.
const created = vi.hoisted(() => ({
  customers: 0,
  searches: new Map<string, string[]>(),
  updates: [] as { id: string; primaryEmail?: string; customFields?: Values }[],
  companies: [] as { primaryName: string; customFields?: Values }[],
  links: [] as { id: string; companyId: string }[],
}));

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        customers: {
          create: async () => {
            created.customers += 1;

            return { id: `customer-${created.customers}` };
          },
          // Core's matches, `limit` at a time, among `ids` when they're given.
          list: async ({ search, ids, limit }: { search: string; ids?: string; limit: number }) => {
            const all = created.searches.get(search) ?? [];
            const hits = ids ? all.filter((id) => ids.split(',').includes(id)) : all;

            return {
              data: hits.slice(0, limit).map((id) => ({ id })),
              pageInfo: { hasNextPage: hits.length > limit },
            };
          },
          findOrCreate: async ({ primaryEmail }: { primaryEmail?: string }) =>
            primaryEmail === 'ada@e2e.test'
              ? { customer: { id: 'customer-ada' }, created: false }
              : { customer: { id: `lead-${primaryEmail}` }, created: true },
          update: async (input: { id: string; primaryEmail?: string; customFields?: Values }) => {
            created.updates.push(input);

            return { id: input.id };
          },
          linkCompany: async (input: { id: string; companyId: string }) => {
            created.links.push(input);

            return { ok: true };
          },
        },
        companies: {
          list: async () => ({ data: [{ id: 'company-acme', primaryName: 'Acme' }] }),
          create: async (input: { primaryName: string; customFields?: Values }) => {
            created.companies.push(input);

            return { id: `company-${input.primaryName}`, primaryName: input.primaryName };
          },
        },
        fields: {
          check: async ({ current, patch }: { current: Values; patch: Values }) => ({
            values: Object.fromEntries(
              Object.entries({ ...current, ...patch }).filter(([, value]) => value !== null),
            ),
          }),
        },
        notifications: { create: async () => ({ ok: true }) },
      }),
    },
  };
});

const { post } = serve('/api/public/messenger');

const Connected = z.looseObject({ token: z.string() });

/** The filter bar's one rule, as `useListFilterParams()` sends it. */
const rule = (path: string, op: string, value?: unknown) =>
  JSON.stringify({ match: 'all', rules: [{ path: `subject.${path}`, op, value }] });

/** An owner, a channel with `teammate` in it and its messenger, and a visitor who wrote `contents`. */
const setUp = async (orgId: string, contents: string[]) => {
  const owner = clientAs(orgId);
  const teammate = clientAs(orgId, [PERMISSIONS.inboxView, PERMISSIONS.channelView], 'teammate');
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
    config: {},
  });

  const { token } = Connected.parse((await post('/connect', { key: integration.publicKey })).body);

  for (const content of contents) await post('/messages', { content }, token);

  // Newest first.
  const ids = (await teammate.conversations.list({})).conversations.map((row) => row.id);

  return { owner, teammate, channel, ids, key: integration.publicKey };
};

describe('inbox list', () => {
  it('counts what waits unread in each sidebar queue and channel', async () => {
    const { owner, teammate, channel, ids } = await setUp('org-ib-counts', ['First', 'Second']);
    const [second = '', first = ''] = ids;

    expect(await teammate.conversations.counts({})).toEqual({
      unread: 2,
      assignedToMe: 0,
      mentioned: 0,
      unassigned: 2,
      awaitingResponse: 2,
      overdue: 0,
      channels: [
        {
          id: channel.id,
          name: 'Support',
          icon: null,
          personal: false,
          unread: 2,
          kinds: [{ kind: 'messenger', unread: 2 }],
        },
      ],
    });

    // Their personal inbox comes first, flagged, so the sidebar shows it as My inbox.
    const mine = await teammate.channels.personal();

    expect((await teammate.conversations.counts({})).channels).toEqual([
      { id: mine.id, name: 'Personal inbox', icon: null, personal: true, unread: 0, kinds: [] },
      expect.objectContaining({ id: channel.id, personal: false, unread: 2 }),
    ]);

    // Assigned to them, and mentioned in another's note: each queue counts its own.
    await owner.conversations.assign({ ids: [first], assigneeId: 'teammate' });
    await owner.conversations.messages.create({
      conversationId: second,
      content: '@Teammate can you look?',
      internal: true,
      mentionedUserIds: ['teammate'],
    });

    expect(await teammate.conversations.counts({})).toMatchObject({
      unread: 2,
      assignedToMe: 1,
      mentioned: 1,
      unassigned: 1,
    });

    // The Mentions queue's link filters the list by the same rule.
    const mentioning = await teammate.conversations.list({
      filter: rule('mentionedUserIds', 'in', ['me']),
    });

    expect(mentioning.conversations.map((conversation) => conversation.id)).toEqual([second]);

    // Answering reads it, so it leaves every count.
    await teammate.conversations.messages.create({ conversationId: first, content: 'On it' });

    expect(await teammate.conversations.counts({})).toMatchObject({
      unread: 1,
      assignedToMe: 0,
      awaitingResponse: 1,
      overdue: 0,
      channels: [
        expect.objectContaining({ personal: true }),
        expect.objectContaining({ unread: 1 }),
      ],
    });
    expect(await clientAs('org-ib-counts-other').conversations.counts({})).toMatchObject({
      unread: 0,
      channels: [],
    });
  });

  it('tags conversations together and filters by tag', async () => {
    const { owner, teammate, ids } = await setUp('org-ib-tags', ['Invoice', 'Refund']);
    const [id = ''] = ids;
    const billing = await owner.tags.create({ type: 'conversation', name: 'Billing' });

    await expect(
      owner.tags.create({ type: 'conversation', name: 'billing' }),
    ).rejects.toMatchObject({ code: 'TAG_NAME_TAKEN' });
    await expect(teammate.tags.create({ type: 'conversation', name: 'VIP' })).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );

    expect(await teammate.conversations.setTags({ ids, tagIds: [billing.id] })).toMatchObject([
      { tagIds: [billing.id] },
      { tagIds: [billing.id] },
    ]);
    expect(
      (await teammate.conversations.list({ filter: rule('tagIds', 'in', [billing.id]) }))
        .totalCount,
    ).toBe(2);

    // One conversation the member can't see fails the whole change.
    await expect(
      teammate.conversations.setTags({ ids: [id, 'unseen'], tagIds: [] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await teammate.conversations.get({ id })).toMatchObject({ tagIds: [billing.id] });

    // A member who only works the inbox reads the tags they set, and still not the channels.
    const agent = clientAs('org-ib-tags', [PERMISSIONS.inboxView], 'agent');

    expect((await agent.tags.list({ type: 'conversation' })).data).toMatchObject([
      { id: billing.id, name: 'Billing' },
    ]);
    await expect(agent.channels.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await owner.tags.remove({ ids: [billing.id] });
    expect(await teammate.conversations.get({ id })).toMatchObject({ tagIds: [] });
  });

  it('searches the last message and the customer core finds by name, email or phone', async () => {
    const { teammate, ids } = await setUp('org-ib-search', ['Where is my parcel']);
    const [conversation] = (await teammate.conversations.list({})).conversations;

    created.searches.set('ada@e2e.test', [conversation?.customerId ?? '']);

    const found = async (search: string) =>
      (await teammate.conversations.list({ search })).conversations.map((row) => row.id);

    expect(await found('parcel')).toEqual(ids);
    expect(await found('ada@e2e.test')).toEqual(ids);
    expect(await found('nobody')).toEqual([]);

    // A name 150 customers share finds the conversation of the last one core lists.
    created.searches.set('Bat', [
      ...Array.from({ length: 149 }, (_, at) => `customer-bat-${at}`),
      conversation?.customerId ?? '',
    ]);

    expect(await found('Bat')).toEqual(ids);
  });

  it('previews no link that points into the private network', async () => {
    const { teammate, ids } = await setUp('org-ib-links', [
      'Open http://localhost/admin or http://10.0.0.1/ or ftp://files.e2e.test/a',
    ]);

    const conversationId = ids[0] ?? '';
    const [message] = (await teammate.conversations.messages.list({ conversationId })).messages;

    await expect(
      teammate.conversations.messages.linkPreviews({ id: message?.id ?? '' }),
    ).resolves.toEqual({ previews: [] });
    await expect(
      clientAs('org-ib-other').conversations.messages.linkPreviews({ id: message?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("keeps a conversation's custom field values as core checks them", async () => {
    const { owner, teammate, ids } = await setUp('org-ib-fields', ['I need ten seats']);
    const id = ids[0] ?? '';

    await expect(
      owner.conversations.properties.save({ id, patch: { plan: 'pro', seats: 10 } }),
    ).resolves.toEqual({ plan: 'pro', seats: 10 });
    await owner.conversations.properties.save({ id, patch: { seats: null } });
    await expect(teammate.conversations.properties.values({ id })).resolves.toEqual({
      plan: 'pro',
    });

    // Reading the conversation is not changing its fields.
    await expect(
      teammate.conversations.properties.save({ id, patch: { plan: 'free' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      clientAs('org-ib-elsewhere').conversations.properties.values({ id }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("saves a visitor's contact, custom fields and company on their own lead", async () => {
    const { key } = await setUp('org-ib-visitor', []);

    created.updates.length = 0;
    created.companies.length = 0;
    created.links.length = 0;

    await post('/connect', { key, customFields: { plan: 'pro' }, company: { name: 'acme' } });
    await post('/connect', {
      key,
      identity: { email: 'new@e2e.test' },
      customFields: { plan: 'team' },
      company: { name: 'Globex', customFields: { size: 'small' } },
    });
    // An email anyone can type fills in the visitor's own lead and never finds Ada, who has it.
    await post('/connect', {
      key,
      identity: { email: 'ada@e2e.test' },
      customFields: { plan: 'free' },
      company: { name: 'Initech' },
    });

    const [, typedNew, , typedAda] = created.updates;

    expect(created.updates).toMatchObject([
      { customFields: { plan: 'pro' } },
      { primaryEmail: 'new@e2e.test' },
      { id: typedNew?.id, customFields: { plan: 'team' } },
      { primaryEmail: 'ada@e2e.test' },
      { id: typedAda?.id, customFields: { plan: 'free' } },
    ]);
    expect(created.updates.map(({ id }) => id)).not.toContain('customer-ada');
    // Acme is found by its name in any case; Globex is made with the website's fields.
    expect(created.companies).toMatchObject([
      { primaryName: 'Globex', customFields: { size: 'small' } },
      { primaryName: 'Initech' },
    ]);
    expect(created.links).toEqual([
      { id: created.updates[0]?.id, companyId: 'company-acme' },
      { id: typedNew?.id, companyId: 'company-Globex' },
      { id: typedAda?.id, companyId: 'company-Initech' },
    ]);
  });
});
