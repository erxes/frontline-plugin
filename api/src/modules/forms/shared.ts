import { randomBytes } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { FORM_TIMELINE } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { FormStep, formSubmissions, forms } from '#/db/forms.ts';
import { channelMembers } from '#/db/schema.ts';
import { StoredFile } from '#/db/table.ts';
import { canChangeSql, heldInChannels, membership } from '../channels/access.ts';
import { publishEvents, type RecordEvent } from '../events.ts';

/** The row without `org_id`, which the caller already knows. */
// `appearance` is retired: the old plugin stored it and nothing read it.
const { orgId, appearance, ...formColumns } = getTableColumns(forms);

/** A form's submission count, selected beside its row. */
const submissionCount = sql<number>`(
  select ${count()}::int from ${formSubmissions} where ${formSubmissions.formId} = ${forms.id}
)`;

/** The row, whether the caller may change it and how many submissions it has. */
export const Form = createSelectSchema(forms, {
  steps: () => z.array(FormStep),
  calloutImage: () => StoredFile.nullable(),
  thankImage: () => StoredFile.nullable(),
})
  .omit({ orgId: true, appearance: true })
  .extend({
    /** Whether the caller is its channel's admin or manages every channel. */
    canManage: z.boolean(),
    submissionCount: z.number(),
  });

/** Forms with what the caller may do and their counts. Callers narrow them with `seenBy`. */
export const formRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({ ...formColumns, canManage: canChangeSql(member), submissionCount })
    .from(forms)
    .leftJoin(channelMembers, membership(member, forms.channelId))
    .$dynamic();

/** One form as the caller sees it. */
export const formById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await formRows(tx, member).where(eq(forms.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such form' });

  return row;
};

/**
 * The forms of `ids`, all of them or NOT_FOUND, oldest first, with their channels held
 * (`heldInChannels`). Their channels' members read them; with `change`, only the channels'
 * admins and members who manage every channel change them.
 */
export const formsFor = async (tx: Tx, member: PluginMember, ids: string[], change: boolean) =>
  heldInChannels(
    tx,
    member,
    ids,
    await tx
      .select(formColumns)
      .from(forms)
      .where(inArray(forms.id, ids))
      .orderBy(asc(forms.createdAt), asc(forms.id)),
    { change, noun: 'form' },
  );

/** The one form of `id`, read or changed as `formsFor` allows. */
export const formFor = async (tx: Tx, member: PluginMember, id: string, change: boolean) => {
  const [row] = await formsFor(tx, member, [id], change);

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such form' });

  return row;
};

/** A new embed code: 8 letters and digits, unique per organisation by its index. */
export const newCode = () => randomBytes(4).toString('hex');

/** Puts the events on the forms' timelines in core, by `member`, or by a visitor without one. */
export const publishFormEvents = (
  tx: Tx,
  orgOf: string,
  member: PluginMember | null,
  events: RecordEvent[],
) =>
  publishEvents(
    tx,
    {
      orgId: orgOf,
      actorUserId: member?.userId ?? null,
      entityType: FORM_TIMELINE,
      linkOf: (id) => `/${PLUGIN}/forms/${encodeURIComponent(id)}`,
      audited: false,
    },
    events,
  );
