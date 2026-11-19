import { ORPCError } from '@orpc/server';
import { and, count, eq, ilike, or } from 'drizzle-orm';
import { createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { FORM_EVENTS, PERMISSIONS } from '#/core.ts';
import { FormStep, forms } from '#/db/forms.ts';
import { channelMembers } from '#/db/schema.ts';
import { Attachment } from '#/db/table.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor, membership } from '../channels/access.ts';
import { assertTags } from '../tags/tags.ts';
import { changedEvent } from '../events.ts';
import { Blank, Color, LanguageCode, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import { Form, formById, formFor, formRows, newCode, publishFormEvents, seenBy } from './shared.ts';

/** What the forms list's filter bar narrows by (`ui/src/modules/forms`). */
const FORM_FILTER: FilterFields = {
  'subject.id': { type: 'select', expr: forms.id },
  'subject.name': { type: 'text', expr: forms.name },
  'subject.title': { type: 'text', expr: forms.title },
  'subject.status': { type: 'select', expr: forms.status },
  'subject.channelId': { type: 'select', expr: forms.channelId },
  'subject.loadType': { type: 'select', expr: forms.loadType },
  'subject.viewCount': { type: 'number', expr: forms.viewCount },
  'subject.contactsGathered': { type: 'number', expr: forms.contactsGathered },
  'subject.tagIds': { type: 'tags', expr: forms.tagIds },
  'subject.createdBy': { type: 'member', expr: forms.createdBy },
  'subject.createdAt': { type: 'date', expr: forms.createdAt },
  'subject.updatedAt': { type: 'date', expr: forms.updatedAt },
};

const order = orderOf(forms);

/**
 * The forms of the member's channels, newest first, `limit` at a time, narrowed by the filter
 * bar; `search` matches the name or title, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(z.object({ forms: z.array(Form), ...PageOutput }))
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member),
      input.search
        ? or(ilike(forms.name, likeText(input.search)), ilike(forms.title, likeText(input.search)))
        : undefined,
      compileFilter(FORM_FILTER, input.filter, { me: member.userId }),
    );

    const rows = await formRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(forms)
        .leftJoin(channelMembers, membership(member, forms.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { forms: items, nextCursor, totalCount };
  });

/** One form of a channel the member belongs to. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Form)
  .handler(async ({ input, context: { tx, member } }) => {
    await formFor(tx, member, input.id, false);

    return formById(tx, member, input.id);
  });

/** What a form's settings accept; each is optional on an update. */
const FormFields = createUpdateSchema(forms, {
  name: () => Title,
  title: () => Blank(200),
  description: () => Blank(2000),
  buttonText: () => Blank(100),
  primaryColor: () => Color.nullable(),
  languageCode: () => LanguageCode.nullable(),
  calloutTitle: () => Blank(200),
  calloutBody: () => Blank(2000),
  calloutButtonText: () => Blank(100),
  calloutImage: () => Attachment.nullable(),
  thankTitle: () => Blank(200),
  thankContent: () => Blank(2000),
  thankImage: () => Attachment.nullable(),
  steps: () => z.array(FormStep).max(20),
  tagIds: () => z.array(z.string()).max(50),
}).pick({
  name: true,
  title: true,
  description: true,
  buttonText: true,
  channelId: true,
  status: true,
  loadType: true,
  primaryColor: true,
  languageCode: true,
  saveAsCustomer: true,
  calloutTitle: true,
  calloutBody: true,
  calloutButtonText: true,
  calloutImage: true,
  calloutSkip: true,
  thankTitle: true,
  thankContent: true,
  thankImage: true,
  steps: true,
  tagIds: true,
});

/** What a change entry names each setting. */
const NAMES: [keyof z.infer<typeof Form>, string][] = [
  ['name', 'name'],
  ['title', 'title'],
  ['description', 'description'],
  ['buttonText', 'button text'],
  ['channelId', 'channel'],
  ['status', 'status'],
  ['loadType', 'load type'],
  ['primaryColor', 'colour'],
  ['languageCode', 'language'],
  ['saveAsCustomer', 'save as customer'],
  ['calloutTitle', 'callout title'],
  ['calloutBody', 'callout body'],
  ['calloutButtonText', 'callout button'],
  ['calloutImage', 'callout image'],
  ['calloutSkip', 'callout'],
  ['thankTitle', 'thank-you title'],
  ['thankContent', 'thank-you text'],
  ['thankImage', 'thank-you image'],
  ['steps', 'steps'],
  ['tagIds', 'tags'],
];

/** A new form in a channel the caller is an admin of, with one step and an embed code. */
const create = writes(PERMISSIONS.channelView)
  .input(FormFields.required({ name: true, channelId: true }))
  .output(Form)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });
    await assertTags(tx, 'form', input.tagIds ?? []);

    const [created] = await tx
      .insert(forms)
      .values({
        steps: [{ name: '', description: '' }],
        ...input,
        orgId: member.orgId,
        code: newCode(),
        createdBy: member.userId,
      })
      .returning({ id: forms.id, name: forms.name });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await publishFormEvents(tx, member.orgId, member, [
      {
        entityId: created.id,
        type: FORM_EVENTS.created.type,
        summary: `Created ${created.name}`,
        payload: { name: created.name, channelId: input.channelId },
      },
    ]);

    return formById(tx, member, created.id);
  });

/** Changes the given settings, or moves the form to another channel the caller is an admin of. */
const update = writes(PERMISSIONS.channelView)
  .input(FormFields.extend({ id: z.string() }))
  .output(Form)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const form = await formFor(tx, member, id, true);

    if (fields.channelId && fields.channelId !== form.channelId)
      await channelFor(tx, member, fields.channelId, { change: true });

    await assertTags(tx, 'form', fields.tagIds ?? []);

    const before = await formById(tx, member, id);

    await tx.update(forms).set(fields).where(eq(forms.id, id));

    const changed = await formById(tx, member, id);

    await publishFormEvents(
      tx,
      member.orgId,
      member,
      changedEvent(FORM_EVENTS.fieldsChanged.type, NAMES, before, changed),
    );

    return changed;
  });

export const formProcedures = { list, get, create, update };
