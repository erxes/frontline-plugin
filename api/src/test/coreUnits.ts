import type * as CoreModule from '#/core.ts';

type Kind = 'branch' | 'department';

/** A branch or department as a test puts it in core. */
export type UnitInput = {
  id: string;
  kind: Kind;
  name: string;
  code?: string | null;
  parentId?: string | null;
  supervisorId?: string | null;
  memberIds?: string[];
};

type StoredUnit = Required<UnitInput> & { createdAt: string; updatedAt: string };

const stored = new Map<string, StoredUnit[]>();

/**
 * Core's branches and departments in a test, by organisation, and each `units.import` frontline
 * made. `vi.mock` loads this module before the app, so it imports nothing of the app's.
 */
export const coreUnits = {
  imports: [] as { orgId: string; ids: string[] }[],
  of: (orgId: string) => stored.get(orgId) ?? [],
  /** Adds the unit, or changes the one with its id. */
  put: (orgId: string, unit: UnitInput) => {
    const now = new Date().toISOString();
    const units = coreUnits.of(orgId).filter((other) => other.id !== unit.id);
    const before = coreUnits.of(orgId).find((other) => other.id === unit.id);

    units.push({
      code: null,
      parentId: null,
      supervisorId: null,
      memberIds: [],
      ...unit,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    });
    stored.set(orgId, units);
  },
  /** Deletes the unit, moving the ones under it up to its parent, as core does. */
  remove: (orgId: string, id: string) => {
    const gone = coreUnits.of(orgId).find((unit) => unit.id === id);

    stored.set(
      orgId,
      coreUnits
        .of(orgId)
        .filter((unit) => unit.id !== id)
        .map((unit) =>
          unit.parentId === id ? { ...unit, parentId: gone?.parentId ?? null } : unit,
        ),
    );
  },
};

const pathOf = (units: StoredUnit[], unit: StoredUnit): string => {
  const parent = units.find((other) => other.id === unit.parentId);

  return `${parent ? pathOf(units, parent) : '/'}${unit.id}/`;
};

/** Every unit with its path, parents first, as core lists them. */
const list = (orgId: string) => {
  const units = coreUnits.of(orgId);

  return {
    data: units
      .map((unit) => ({
        ...unit,
        path: pathOf(units, unit),
        description: null,
        address: null,
        phone: null,
        email: null,
      }))
      .toSorted((a, b) => a.path.localeCompare(b.path)),
  };
};

const lower = (text: string | null | undefined) => text?.trim().toLowerCase() ?? null;

/**
 * Core's import: a unit with a known id, or of the same kind with the same code (or, without a
 * code, the same name and parent), merges and gains the members; any other is added.
 */
const importUnits = (orgId: string, units: Required<UnitInput>[]) => {
  const ids: Record<string, string> = {};
  const pending = [...units];

  while (pending.length > 0) {
    const index = pending.findIndex(
      (unit) => !unit.parentId || !pending.some((other) => other.id === unit.parentId),
    );

    const [unit] = pending.splice(Math.max(index, 0), 1);

    if (!unit) break;

    const parentId = unit.parentId ? (ids[unit.parentId] ?? unit.parentId) : null;

    const match = coreUnits
      .of(orgId)
      .find(
        (other) =>
          other.id === unit.id ||
          (other.kind === unit.kind &&
            (unit.code
              ? lower(other.code) === lower(unit.code)
              : lower(other.name) === lower(unit.name) && other.parentId === parentId)),
      );

    if (match) {
      coreUnits.put(orgId, {
        ...match,
        memberIds: [...new Set([...match.memberIds, ...unit.memberIds])],
      });
      ids[unit.id] = match.id;
    } else {
      coreUnits.put(orgId, { ...unit, parentId });
      ids[unit.id] = unit.id;
    }
  }

  coreUnits.imports.push({ orgId, ids: units.map((unit) => unit.id) });

  return { ids, skippedMembers: 0 };
};

/**
 * Core's fields of `frontline.ticket` in a test: Size and Labels in a group on every pipeline,
 * Seats in one on `seatsPipelineIds`. The fields of `required` are required on the create form.
 */
export const coreTicketFields = { seatsPipelineIds: [] as string[], required: [] as string[] };

const ticketField = (id: string, label: string, type: string, groupId: string) => ({
  id,
  label,
  type,
  groupId,
  isVisible: true,
  isVisibleToCreate: true,
  description: null,
  options: type === 'number' ? [] : ['S', 'M', 'vip'],
});

const ticketFields = [
  ticketField('size', 'Size', 'select', 'every'),
  ticketField('seats', 'Seats', 'number', 'some'),
  ticketField('labels', 'Labels', 'multiselect', 'every'),
];

const ticketGroups = () => [
  { id: 'every', appliesTo: {} },
  { id: 'some', appliesTo: { pipeline: coreTicketFields.seatsPipelineIds } },
];

type Values = Record<string, unknown>;

/**
 * Core's check: each field's group applies to the ticket's pipeline; null clears a value. On
 * `create`, each required field that applies needs one.
 */
const checkFields = async (input: {
  current: Values;
  patch: Values;
  appliesTo: { pipeline: string[] };
  create?: boolean;
}) => {
  const { ORPCError } = await import('@orpc/server');

  const applies = (field: (typeof ticketFields)[number]) => {
    const pipelines = ticketGroups().find((one) => one.id === field.groupId)?.appliesTo.pipeline;

    return !pipelines || pipelines.some((one) => input.appliesTo.pipeline.includes(one));
  };

  for (const id of Object.keys(input.patch)) {
    const field = ticketFields.find((one) => one.id === id);

    if (!field || !applies(field))
      throw new ORPCError('BAD_REQUEST', { message: `${field?.label ?? id} doesn't apply` });
  }

  const values = Object.fromEntries(
    Object.entries({ ...input.current, ...input.patch }).filter(([, value]) => value !== null),
  );

  const missing = ticketFields.find(
    (field) =>
      input.create &&
      coreTicketFields.required.includes(field.id) &&
      applies(field) &&
      values[field.id] === undefined,
  );

  if (missing) throw new ORPCError('BAD_REQUEST', { message: `${missing.label} is required` });

  return { values };
};

/** Core's calls for ticket fields, answered by `coreTicketFields`, for any stand-in of core. */
export const ticketFieldCalls = {
  fields: { list: async () => ({ data: ticketFields }), check: checkFields },
  fieldGroups: { list: async () => ({ data: ticketGroups() }) },
};

/**
 * `#/core.ts` with core's units answered by `coreUnits` and ticket fields by `coreTicketFields`:
 * `vi.mock('#/core.ts', …unitsStandIn)`.
 */
export const unitsStandIn = (actual: typeof CoreModule) => ({
  ...actual,
  core: {
    ...actual.core,
    forOrg: (orgId: string) => ({
      units: {
        list: async () => list(orgId),
        import: async ({ units }: { units: Required<UnitInput>[] }) => importUnits(orgId, units),
      },
      ...ticketFieldCalls,
    }),
  },
});
