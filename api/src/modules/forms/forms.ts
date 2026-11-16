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
import { Blank, Color, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import { after, newestFirst, PageInput, pageOf } from '../paging.ts';
import { Form, formById, formFor, formRows, newCode, publishFormEvents, seenBy } from './shared.ts';

/** What the forms list's filter bar narrows by (`ui/src/modules/forms`). */
const FORM_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: forms.name },
  'subject.title': { kind: 'text', expr: forms.title },
  'subject.status': { kind: 'select', expr: forms.status },
  'subject.channelId': { kind: 'select', expr: forms.channelId },
  'subject.loadType': { kind: 'select', expr: forms.loadType },
  'subject.viewCount': { kind: 'number', expr: forms.viewCount },
  'subject.contactsGathered': { kind: 'number', expr: forms.contactsGathered },
  'subject.tagIds': { kind: 'tags', expr: forms.tagIds },
  'subject.createdBy': { kind: 'member', expr: forms.createdBy },
  'subject.createdAt': { kind: 'date', expr: forms.createdAt },
  'subject.updatedAt': { kind: 'date', expr: forms.updatedAt },
};

/**
 * The forms of the member's channels, newest first, `limit` at a time, narrowed by the filter
 * bar; `search` matches the name or title, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(
    z.object({ forms: z.array(Form), nextCursor: z.string().nullable(), totalCount: z.number() }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member),
      input.search
        ? or(ilike(forms.name, likeText(input.search)), ilike(forms.title, likeText(input.search)))
        : undefined,
      input.filter ? filterSql(FORM_FILTER, input.filter, member.userId) : undefined,
    );

    const rows = await formRows(tx, member)
      .where(and(matches, after(forms, input.cursor)))
      .orderBy(...newestFirst(forms))
      .limit(input.limit + 1);

    const [total] = await tx
      .select({ value: count() })
      .from(forms)
      .leftJoin(channelMembers, membership(member, forms.channelId))
      .where(matches);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { forms: items, nextCursor, totalCount: total?.value ?? 0 };
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
  appearance: true,
  loadType: true,
  primaryColor: true,
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
  ['appearance', 'appearance'],
  ['loadType', 'load type'],
  ['primaryColor', 'colour'],
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
        steps: [{ name: 'Step 1', description: '' }],
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
