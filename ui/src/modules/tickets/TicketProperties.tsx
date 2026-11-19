import { type CustomValue, type Field, groupApplies, logicShows } from '@erxes/core-contract';
import { orpc as core } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconCalendar,
  IconLetterCase,
  IconListCheck,
  IconNumber,
  IconSelect,
  IconToggleLeft,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  DatePicker,
  NumberField,
  PanelFormRow,
  Switch,
  TextField,
  type TListFilterField,
  textOf,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { TICKET_FIELDS } from '~/plugin.ts';
import { Badges, PickerField } from '~/shared/Pickers.tsx';
import type { TicketRow } from './queries.ts';

/** How the ticket screens draw each type of core's fields; they draw no other. */
const KINDS = {
  text: 'text',
  phone: 'text',
  textarea: 'textarea',
  number: 'number',
  date: 'date',
  boolean: 'boolean',
  select: 'select',
  radio: 'select',
  multiselect: 'multiselect',
  check: 'multiselect',
} as const;

type Kind = (typeof KINDS)[keyof typeof KINDS];

const known = (type: string): type is keyof typeof KINDS => Object.hasOwn(KINDS, type);

const kindOf = (field: Field): Kind | null => (known(field.type) ? KINDS[field.type] : null);

const ICONS = {
  text: IconLetterCase,
  textarea: IconAlignLeft,
  number: IconNumber,
  date: IconCalendar,
  select: IconSelect,
  multiselect: IconListCheck,
  boolean: IconToggleLeft,
} satisfies Record<Kind, unknown>;

const iconOf = (field: Field) => ICONS[kindOf(field) ?? 'text'];

/** The visible ticket fields core keeps, in order, with the pipelines each one's group shows on. */
const useTicketFields = () => {
  const input = { contentType: TICKET_FIELDS };
  const fields = useQuery(core.fields.list.queryOptions({ input })).data?.data ?? [];
  const groups = useQuery(core.fieldGroups.list.queryOptions({ input })).data?.data ?? [];
  const appliesTo = new Map(groups.map((group) => [group.id, group.appliesTo]));

  return fields
    .filter((field) => field.isVisible && kindOf(field))
    .map((field) => ({ field, appliesTo: appliesTo.get(field.groupId ?? '') ?? {} }));
};

/** The fields a ticket of `pipelineId` shows. */
const usePipelineFields = (pipelineId: string) =>
  useTicketFields()
    .filter(({ appliesTo }) => groupApplies(appliesTo, { pipeline: [pipelineId] }))
    .map(({ field }) => field);

const textsOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** A day as core stores a date value, `YYYY-MM-DD`. */
const dayText = (day: Date) =>
  [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

/** One field's value in the new ticket's form, by the input its type takes; null clears it. */
const FieldInput = ({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: CustomValue | undefined;
  onChange: (value: CustomValue | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const options = field.options.map((option) => ({ value: option, label: option }));
  const empty = t('empty', 'Empty');
  const scope = `frontline-ticket-new.fields.${field.id}`;

  switch (kindOf(field)) {
    case 'number':
      return (
        <NumberField
          scope={scope}
          value={typeof value === 'number' ? value : 0}
          placeholder={field.label}
          onSave={onChange}
        />
      );
    case 'date':
      return (
        <DatePicker
          value={typeof value === 'string' ? new Date(`${value}T00:00`) : undefined}
          onChange={(day) => onChange(day instanceof Date ? dayText(day) : null)}
          placeholder={field.label}
          clearable
        />
      );
    case 'select':
      return (
        <PickerField
          label={field.label}
          placeholder={empty}
          display={<span className="truncate">{textOf(value)}</span>}
          options={options}
          value={textOf(value) ? [textOf(value)] : []}
          onValueChange={([next]) => onChange(next ?? null)}
          noneLabel={empty}
        />
      );
    case 'multiselect':
      return (
        <PickerField
          label={field.label}
          placeholder={empty}
          display={<Badges labels={textsOf(value)} />}
          options={options}
          value={textsOf(value)}
          onValueChange={(next) => onChange(next.length > 0 ? next : null)}
          multiple
        />
      );
    case 'boolean':
      return (
        <Switch
          aria-label={field.label}
          checked={value === true}
          onCheckedChange={onChange}
          className="mx-2"
        />
      );
    default:
      return (
        <TextField
          scope={scope}
          value={textOf(value)}
          placeholder={field.label}
          onSave={(next) => onChange(next.trim() || null)}
        />
      );
  }
};

/** A field's value as one line of text, or '' while it has none. */
const useValueText = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (field: Field, value: CustomValue | undefined) => {
    switch (kindOf(field)) {
      case 'number':
        return typeof value === 'number' ? String(value) : '';
      case 'date':
        return typeof value === 'string' ? format.date(new Date(`${value}T00:00`)) : '';
      case 'multiselect':
        return textsOf(value).join(', ');
      case 'boolean':
        return typeof value === 'boolean' ? (value ? t('yes', 'Yes') : t('no', 'No')) : '';
      default:
        return textOf(value);
    }
  };
};

/** The ticket's field values on its board card, three at most and the rest on hover. */
export const TicketPropertyBadges = ({ ticket }: { ticket: TicketRow }) => {
  const fields = usePipelineFields(ticket.pipelineId);
  const valueText = useValueText();

  const labels = fields.flatMap((field) => {
    const text = logicShows(field.logic, ticket.propertiesData)
      ? valueText(field, ticket.propertiesData[field.id])
      : '';

    return text ? [`${field.label}: ${text}`] : [];
  });

  return labels.length > 0 ? <Badges labels={labels} max={3} /> : null;
};

type Values = Record<string, CustomValue | null>;

const filledOf = (values: Values) =>
  Object.fromEntries(
    Object.entries(values).flatMap(([id, value]) => (value === null ? [] : [[id, value]])),
  );

/**
 * A new ticket's rows for the fields its pipeline shows and the create form asks for, each while
 * its logic shows it by the values filled in so far. A change that hides a field drops its value,
 * and so on down the fields that read it, so a ticket keeps only what its form showed. Core
 * refuses a required one left empty.
 */
export const PropertyRows = ({
  pipelineId,
  values,
  onChange,
}: {
  pipelineId: string;
  values: Values;
  onChange: (values: Values) => void;
}) => {
  const asked = usePipelineFields(pipelineId).filter((field) => field.isVisibleToCreate);

  const shownBy = (next: Values) =>
    asked.filter((field) => logicShows(field.logic, filledOf(next)));

  const keptOf = (next: Values) => {
    const shown = new Set(shownBy(next).map((field) => field.id));

    return Object.fromEntries(Object.entries(next).filter(([key]) => shown.has(key)));
  };

  const set = (id: string, value: CustomValue | null) => {
    let next: Values = { ...values, [id]: value };
    let kept = keptOf(next);

    // Each pass drops at least one value, so this ends.
    while (Object.keys(kept).length < Object.keys(next).length) {
      next = kept;
      kept = keptOf(next);
    }

    onChange(kept);
  };

  return shownBy(values).map((field) => (
    <PanelFormRow
      key={field.id}
      label={field.label}
      icon={iconOf(field)}
      required={field.isRequired}
    >
      <FieldInput
        field={field}
        value={values[field.id] ?? undefined}
        onChange={(value) => set(field.id, value)}
      />
    </PanelFormRow>
  ));
};

const FILTER_TYPES = {
  text: 'text',
  textarea: 'text',
  number: 'number',
  date: 'date',
  boolean: 'boolean',
  select: 'select',
  multiselect: 'select',
} as const satisfies Record<Kind, TListFilterField['type']>;

/** The filter bar's field for each ticket field, on the path the API compares it by. */
export const usePropertyFilterFields = (): TListFilterField[] =>
  useTicketFields().map(({ field }) => {
    const kind = kindOf(field) ?? 'text';

    return {
      path: `subject.customFields.${field.id}`,
      label: field.label,
      type: FILTER_TYPES[kind],
      icon: ICONS[kind],
      ...(FILTER_TYPES[kind] === 'select'
        ? { options: field.options.map((option) => ({ value: option, label: option })) }
        : {}),
    };
  });
