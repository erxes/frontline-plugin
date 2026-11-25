import { isDeepStrictEqual } from 'node:util';
import {
  type ConditionGroup,
  CustomFields,
  CustomFieldsPatch,
  type Field,
} from '@erxes/core-contract';
import type { FilterColumn, FilterFields } from '@erxes/plugin-sdk/filter';
import { ORPCError } from '@orpc/server';
import { eq, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { core, PERMISSIONS, TICKET_TIMELINE } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { tickets } from '#/db/tickets.ts';
import { reads, writesWithCore } from '#/orpc.ts';
import { changeTickets } from './changes.ts';
import { seenTicket, ticketsFor } from './shared.ts';

/**
 * The values core keeps after `patch` on a ticket of `pipelineId`, checked against the fields of
 * `frontline.ticket` whose groups apply to that pipeline. With `create`, a member is filing it
 * from the new ticket form, so each required field that form shows needs a value. Called
 * outside the transaction.
 */
export const checkProperties = async (
  orgId: string,
  pipelineId: string,
  current: z.infer<typeof CustomFields>,
  patch: z.infer<typeof CustomFieldsPatch>,
  { create = false } = {},
) =>
  Object.keys(patch).length === 0 && !create
    ? current
    : (
        await core.forOrg(orgId).fields.check({
          contentType: TICKET_TIMELINE,
          current,
          patch,
          appliesTo: { pipeline: [pipelineId] },
          create,
        })
      ).values;

/** The ticket's custom field values by core field id, for core's Properties tab. */
const values = reads(PERMISSIONS.channelView)
  .route({ summary: "Get a ticket's custom field values, keyed by field id" })
  .input(z.object({ id: z.string() }))
  .output(CustomFields)
  .handler(
    async ({ input, context: { tx, member } }) =>
      (await seenTicket(tx, member, input.id)).propertiesData,
  );

/**
 * Saves a patch of values, null to clear one, as a change to the ticket: its status must let
 * the member edit it, and its timeline records it. Values another member saved meanwhile make
 * it a conflict to try again.
 */
const save = writesWithCore(
  PERMISSIONS.channelView,
  z.object({ id: z.string(), patch: CustomFieldsPatch }),
  async (member, input) => {
    const ticket = await withOrg(member.orgId, (tx) => seenTicket(tx, member, input.id));

    return {
      current: ticket.propertiesData,
      checked: await checkProperties(
        member.orgId,
        ticket.pipelineId,
        ticket.propertiesData,
        input.patch,
      ),
    };
  },
)
  .route({
    summary:
      "Save changes to a ticket's custom field values, null clears one; conflicts if someone saved meanwhile",
  })
  .output(CustomFields)
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const rows = await ticketsFor(tx, member, [input.id]);

    const [locked] = await tx
      .select({ values: tickets.propertiesData })
      .from(tickets)
      .where(eq(tickets.id, input.id))
      .for('update');

    if (!isDeepStrictEqual(locked?.values, fromCore.current))
      throw new ORPCError('CONFLICT', { message: 'The fields changed meanwhile: save again' });

    await changeTickets(tx, member, rows, { properties: fromCore.checked });

    return fromCore.checked;
  });

export const propertyProcedures = { values, save };

const CUSTOM_FIELD = 'subject.customFields.';

const pathsOf = (group: ConditionGroup | undefined): string[] =>
  group?.rules.flatMap((part) => ('rules' in part ? pathsOf(part) : [part.path])) ?? [];

/** A field's value on the ticket as SQL of the type its filter compares, null when it has none. */
const columnOf = (field: Field): FilterColumn => {
  const value = sql`${tickets.propertiesData} -> ${field.id}`;

  const typed = (jsonType: string, then: SQL) =>
    sql`case when jsonb_typeof(${value}) = ${jsonType} then ${then} end`;

  switch (field.type) {
    case 'number':
      return { type: 'number', expr: typed('number', sql`(${value})::numeric`) };
    case 'date':
      return { type: 'date', dateOnly: true, expr: typed('string', sql`(${value} ->> 0)::date`) };
    case 'boolean':
      return { type: 'boolean', expr: typed('boolean', sql`(${value})::boolean`) };
    case 'select':
    case 'radio':
      return { type: 'select', expr: sql`${tickets.propertiesData} ->> ${field.id}` };
    case 'multiselect':
    case 'check':
    case 'list':
      return {
        type: 'select',
        array: true,
        expr: sql`coalesce(${typed('array', sql`array(select jsonb_array_elements_text(${value}))`)}, '{}'::text[])`,
      };
    default:
      return { type: 'text', expr: sql`${tickets.propertiesData} ->> ${field.id}` };
  }
};

/**
 * The filter bar's rules on ticket fields (`subject.customFields.<id>`), each compared by the
 * type core gives its field. Asks core only when the filter has one; an id core doesn't know
 * is left out, so the filter refuses it.
 */
export const propertyFilter = async (
  orgId: string,
  filter: ConditionGroup | undefined,
): Promise<FilterFields> => {
  const ids = new Set(
    pathsOf(filter)
      .filter((path) => path.startsWith(CUSTOM_FIELD))
      .map((path) => path.slice(CUSTOM_FIELD.length)),
  );

  if (ids.size === 0) return {};

  const { data } = await core.forOrg(orgId).fields.list({ contentType: TICKET_TIMELINE });

  return Object.fromEntries(
    data
      .filter((field) => ids.has(field.id))
      .map((field) => [`${CUSTOM_FIELD}${field.id}`, columnOf(field)]),
  );
};
