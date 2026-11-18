import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { type PROPERTY_TYPES, ticketProperties, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';

const { orgId, ...propertyColumns } = getTableColumns(ticketProperties);

const Property = createSelectSchema(ticketProperties).omit({ orgId: true });

type Property = z.infer<typeof Property>;

const refine = {
  label: () => Title,
  description: () => Blank(500),
  options: () => z.array(z.string().trim().min(1).max(200)).max(200),
  pipelineIds: () => z.array(z.string()).max(200),
};

/** What a value of each type is; null clears it. */
const VALUES: Record<(typeof PROPERTY_TYPES)[number], (options: string[]) => z.ZodType> = {
  text: () => z.string().max(1000),
  textarea: () => z.string().max(10_000),
  number: () => z.number(),
  date: () => z.iso.datetime({ offset: true }),
  select: (options) => z.enum(options),
  multiselect: (options) => z.array(z.enum(options)).max(200),
  boolean: () => z.boolean(),
};

/** A change to a ticket's properties: values by property id, null to clear one. */
export const PropertiesPatch = z
  .record(z.string(), z.unknown())
  .refine((patch) => Object.keys(patch).length <= 200, 'Too many properties');

/** The properties the tickets of `pipelineId` show: its own and those of every pipeline. */
const propertiesOf = (tx: Tx, pipelineId: string) =>
  tx
    .select(propertyColumns)
    .from(ticketProperties)
    .where(
      sql`cardinality(${ticketProperties.pipelineIds}) = 0 or ${pipelineId} = any(${ticketProperties.pipelineIds})`,
    );

const parseValue = (property: Property, value: unknown) => {
  const parsed = VALUES[property.type](property.options).safeParse(value);

  if (!parsed.success)
    throw new ORPCError('BAD_REQUEST', { message: `${property.label} isn't a valid value` });

  return parsed.data;
};

/**
 * Checks the properties of a ticket of `pipelineId` and returns them parsed: each id a property
 * its pipeline shows, each value of the property's type. A new ticket fills every required one;
 * a change can't clear one.
 */
export const parseProperties = async (
  tx: Tx,
  pipelineId: string,
  patch: Record<string, unknown>,
  { create }: { create: boolean },
) => {
  const properties = new Map((await propertiesOf(tx, pipelineId)).map((row) => [row.id, row]));

  const parsed = Object.entries(patch).map(([id, value]) => {
    const property = properties.get(id);

    if (!property)
      throw new ORPCError('BAD_REQUEST', { message: "Pick a property of the ticket's pipeline" });

    return [id, value === null ? null : parseValue(property, value)] as const;
  });

  const values = Object.fromEntries(parsed);

  const missing = [...properties.values()].find(
    (property) =>
      property.isRequired &&
      (create ? (values[property.id] ?? null) === null : values[property.id] === null),
  );

  if (missing) throw new ORPCError('BAD_REQUEST', { message: `Fill in ${missing.label}` });

  return create ? Object.fromEntries(parsed.filter(([, value]) => value !== null)) : values;
};

/** Sets the patch's values on the ticket's properties; a null value removes the key. */
export const mergeProperties = (patch: Record<string, unknown>) =>
  sql`jsonb_strip_nulls(${tickets.propertiesData} || ${JSON.stringify(patch)}::jsonb)`;

const propertyById = async (tx: Tx, id: string) => {
  const [row] = await tx
    .select(propertyColumns)
    .from(ticketProperties)
    .where(eq(ticketProperties.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such property' });

  return row;
};

/** Choices need options; other types have none. */
const withOptions = <T extends { type?: (typeof PROPERTY_TYPES)[number]; options?: string[] }>(
  input: T,
) => {
  const choices = input.type === 'select' || input.type === 'multiselect';

  if (choices && (input.options ?? []).length === 0)
    throw new ORPCError('BAD_REQUEST', { message: 'Add the choices' });

  return input.type && !choices ? { ...input, options: [] } : input;
};

const PROPERTY_FILTER: FilterFields = {
  'subject.label': { type: 'text', expr: ticketProperties.label },
  'subject.type': { type: 'select', expr: ticketProperties.type },
  'subject.isRequired': { type: 'boolean', expr: ticketProperties.isRequired },
  'subject.createdAt': { type: 'date', expr: ticketProperties.createdAt },
};

/** Every ticket property in order, or those a pipeline's tickets show, narrowed by the filter bar. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ pipelineId: z.string().optional(), ...FilterInput }))
  .output(z.array(Property))
  .handler(({ input, context: { tx, member } }) =>
    tx
      .select(propertyColumns)
      .from(ticketProperties)
      .where(
        and(
          input.pipelineId
            ? sql`(cardinality(${ticketProperties.pipelineIds}) = 0 or ${input.pipelineId} = any(${ticketProperties.pipelineIds}))`
            : undefined,
          input.search ? ilike(ticketProperties.label, likeText(input.search)) : undefined,
          compileFilter(PROPERTY_FILTER, input.filter, { me: member.userId }),
        ),
      )
      .orderBy(asc(ticketProperties.order), asc(ticketProperties.createdAt)),
  );

const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Property)
  .handler(({ input, context: { tx } }) => propertyById(tx, input.id));

/** A new property, last in order. */
const create = writes(PERMISSIONS.settingsManage)
  .input(
    createInsertSchema(ticketProperties, refine)
      .pick({
        label: true,
        description: true,
        type: true,
        options: true,
        isRequired: true,
        pipelineIds: true,
      })
      .partial({ description: true, options: true, isRequired: true, pipelineIds: true }),
  )
  .output(Property)
  .handler(async ({ input, context: { tx, member } }) => {
    const [row] = await tx
      .insert(ticketProperties)
      .values({
        ...withOptions(input),
        orgId: member.orgId,
        createdBy: member.userId,
        order: sql`coalesce((select max(${ticketProperties.order}) + 1 from ${ticketProperties}), 0)`,
      })
      .returning(propertyColumns);

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return row;
  });

/** Changes what is given; a value a ticket holds stays, and shows again if the choice returns. */
const update = writes(PERMISSIONS.settingsManage)
  .input(
    createUpdateSchema(ticketProperties, refine)
      .pick({
        label: true,
        description: true,
        type: true,
        options: true,
        isRequired: true,
        pipelineIds: true,
        order: true,
      })
      .extend({ id: z.string() }),
  )
  .output(Property)
  .handler(async ({ input: { id, ...fields }, context: { tx } }) => {
    const property = await propertyById(tx, id);

    await tx
      .update(ticketProperties)
      .set(withOptions({ type: property.type, options: property.options, ...fields }))
      .where(eq(ticketProperties.id, id));

    return propertyById(tx, id);
  });

/** Deletes the properties and their values on every ticket. */
const remove = writes(PERMISSIONS.settingsManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(ticketProperties)
      .where(inArray(ticketProperties.id, input.ids))
      .returning({ id: ticketProperties.id });

    const ids = removed.map((row) => row.id);

    if (ids.length > 0)
      await tx
        .update(tickets)
        .set({ propertiesData: sql`${tickets.propertiesData} - ${sql.param(ids)}::text[]` })
        .where(sql`${tickets.propertiesData} ?| ${sql.param(ids)}::text[]`);

    return { ids };
  });

export const propertyProcedures = { list, get, create, update, remove };
