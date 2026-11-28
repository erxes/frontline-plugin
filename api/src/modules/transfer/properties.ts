import { type DataExtensionField, groupApplies } from '@erxes/core-contract';
import type { JSONType } from 'zod';
import { core, TICKET_TIMELINE } from '#/core.ts';
import { labelledOf, refuse, tickOf } from './shared.ts';

/**
 * Core's Data Extensions ticket fields, in their order, each with the pipelines its group applies
 * to, asked for only when the file has a Properties column. Fields are each organisation's own, so they share
 * one column, as a form's answers do.
 */
export const ticketFieldsFor = async (orgId: string, wanted: boolean) => {
  if (!wanted) return [];

  const client = core.forOrg(orgId);

  const [fields, groups] = await Promise.all([
    client.dataFields.list({ recordType: TICKET_TIMELINE }),
    client.dataFieldGroups.list({ recordType: TICKET_TIMELINE }),
  ]);

  const appliesTo = new Map(groups.data.map((group) => [group.id, group.appliesTo]));

  return fields.data.map((field) => ({
    ...field,
    appliesTo: appliesTo.get(field.groupId ?? '') ?? {},
  }));
};

type TicketField = Awaited<ReturnType<typeof ticketFieldsFor>>[number];

const textOf = (value: JSONType): string => {
  if (Array.isArray(value)) return value.map(textOf).join(', ');

  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
};

/** A ticket's field values as `Label: value` items. */
export const propertyCells = (fields: DataExtensionField[], values: Record<string, JSONType>) =>
  fields.flatMap((field) => {
    const value = values[field.id];

    return value === undefined || value === null ? [] : [`${field.label}: ${textOf(value)}`];
  });

const LIST_TYPES: ReadonlySet<string> = new Set(['multiSelect', 'textList']);

const NUMBER_TYPES: ReadonlySet<string> = new Set(['number', 'percent', 'rating']);

/** One field's value from its text, by the field's type; empty clears it. Core checks the rest. */
const valueOf = (field: DataExtensionField, text: string): JSONType => {
  if (!text) return null;

  if (NUMBER_TYPES.has(field.type)) {
    const number = Number(text);

    if (Number.isNaN(number)) throw refuse(`${field.label} is a number, not ${text}`);

    return number;
  }

  if (field.type === 'boolean') return tickOf(text, field.label);

  return LIST_TYPES.has(field.type) ? text.split(/,\s*/).filter(Boolean) : text;
};

/**
 * A Properties cell as a patch of the values of the fields `pipelineId` shows, for core's
 * `dataValues.check`, so two pipelines' fields with one label don't mix.
 */
export const propertyPatchOf = (cell: string, fields: TicketField[], pipelineId: string) =>
  Object.fromEntries(
    labelledOf(
      cell,
      fields.filter((field) => groupApplies(field.appliesTo, { pipeline: [pipelineId] })),
    ).map(({ item, text }) => [item.id, valueOf(item, text)]),
  );
