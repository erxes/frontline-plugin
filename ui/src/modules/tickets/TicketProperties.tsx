import type { InferClientOutputs } from '@orpc/client';
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
import type { Client } from '@frontline/api';
import {
  DatePicker,
  NumberField,
  PanelField,
  PanelFormRow,
  PanelSection,
  Switch,
  TextField,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { Badges, PickerField } from '~/shared/Pickers.tsx';
import { dayOf } from './TicketFields.tsx';
import { type Ticket, useEditTicket } from './queries.ts';

type Property = InferClientOutputs<Client>['tickets']['properties']['list'][number];

const PROPERTY_ICONS = {
  text: IconLetterCase,
  textarea: IconAlignLeft,
  number: IconNumber,
  date: IconCalendar,
  select: IconSelect,
  multiselect: IconListCheck,
  boolean: IconToggleLeft,
} satisfies Record<Property['type'], unknown>;

/** The properties a pipeline's tickets show, in order. */
const useProperties = (pipelineId: string) =>
  useQuery({
    ...orpc.tickets.properties.list.queryOptions({ input: { pipelineId } }),
    enabled: pipelineId !== '',
  }).data ?? [];

const textsOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * One property's value, edited in place by the input its type takes. `onChange` gets the new
 * value, or null when it is cleared.
 */
const PropertyInput = ({
  property,
  value,
  scope,
  onChange,
}: {
  property: Property;
  value: unknown;
  scope: string;
  onChange: (value: unknown) => void;
}) => {
  const { t } = useTranslation('frontline');
  const options = property.options.map((option) => ({ value: option, label: option }));
  const empty = t('empty', 'Empty');

  switch (property.type) {
    case 'text':
    case 'textarea':
      return (
        <TextField
          scope={`${scope}.${property.id}`}
          value={textOf(value)}
          placeholder={property.label}
          onSave={(next) => onChange(next.trim() || null)}
        />
      );
    case 'number':
      return (
        <NumberField
          scope={`${scope}.${property.id}`}
          value={typeof value === 'number' ? value : 0}
          placeholder={property.label}
          onSave={onChange}
        />
      );
    case 'date':
      return (
        <DatePicker
          value={typeof value === 'string' ? new Date(value) : undefined}
          onChange={(day) => onChange(dayOf(day)?.toISOString() ?? null)}
          placeholder={property.label}
          clearable
        />
      );
    case 'select':
      return (
        <PickerField
          label={property.label}
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
          label={property.label}
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
          aria-label={property.label}
          checked={value === true}
          onCheckedChange={onChange}
          className="mx-2"
        />
      );
  }
};

/** A property's value as one line of text, or '' while it has none. */
const useValueText = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (property: Property, value: unknown) => {
    switch (property.type) {
      case 'number':
        return typeof value === 'number' ? String(value) : '';
      case 'date':
        return typeof value === 'string' ? format.date(new Date(value)) : '';
      case 'multiselect':
        return textsOf(value).join(', ');
      case 'boolean':
        return typeof value === 'boolean' ? (value ? t('yes', 'Yes') : t('no', 'No')) : '';
      default:
        return textOf(value);
    }
  };
};

/** The ticket's property values on its board card, three at most and the rest on hover. */
export const TicketPropertyBadges = ({ ticket }: { ticket: Ticket }) => {
  const properties = useProperties(ticket.pipelineId);
  const valueText = useValueText();

  const labels = properties.flatMap((property) => {
    const text = valueText(property, ticket.propertiesData[property.id]);

    return text ? [`${property.label}: ${text}`] : [];
  });

  return labels.length > 0 ? <Badges labels={labels} max={3} /> : null;
};

/** The ticket's properties from settings, each saved as it changes; nothing when there are none. */
export const TicketPropertiesSection = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const properties = useProperties(ticket.pipelineId);
  const edit = useEditTicket(ticket.id);

  if (properties.length === 0) return null;

  return (
    <PanelSection title={t('properties', 'Properties')}>
      {properties.map((property) => (
        <PanelField
          key={property.id}
          icon={PROPERTY_ICONS[property.type]}
          label={property.label}
          cell={false}
        >
          <PropertyInput
            property={property}
            value={ticket.propertiesData[property.id]}
            scope={`frontline-ticket.${ticket.id}.properties`}
            onChange={(value) => edit({ propertiesData: { [property.id]: value } })}
          />
        </PanelField>
      ))}
    </PanelSection>
  );
};

/** A new ticket's property rows, the required ones marked. */
export const PropertyRows = ({
  pipelineId,
  values,
  onChange,
}: {
  pipelineId: string;
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
}) =>
  useProperties(pipelineId).map((property) => (
    <PanelFormRow
      key={property.id}
      label={property.label}
      icon={PROPERTY_ICONS[property.type]}
      required={property.isRequired}
    >
      <PropertyInput
        property={property}
        value={values[property.id]}
        scope="frontline-ticket-new.properties"
        onChange={(value) => onChange(property.id, value)}
      />
    </PanelFormRow>
  ));
