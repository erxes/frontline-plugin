import {
  IconAsterisk,
  IconCalendarPlus,
  IconCategory,
  IconDots,
  IconForms,
  IconGitBranch,
  IconLetterCase,
  IconList,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Popover,
  RecordTableInlineCell,
  StringArrayInput,
  Switch,
  TextField,
  useListFilterParams,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChoices } from '@/tickets/queries.ts';
import { orpc } from '~/orpc.ts';
import { Badges, PickerField } from '~/shared/Pickers.tsx';
import { column, DateCell } from '~/shared/Table.tsx';
import {
  DeleteRowAction,
  SettingsList,
  useCanManageSettings,
  useDeleteRow,
  useSettingsChange,
} from './Settings.tsx';
import { AddProperty, hasChoices, type Property, TYPES, useTypeNames } from './AddProperty.tsx';

const useUpdateProperty = () =>
  useMutation(orpc.tickets.properties.update.mutationOptions(useSettingsChange()));

const LabelCell = ({ property }: { property: Property }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateProperty();

  return (
    <TextField
      scope={`frontline-properties.${property.id}.label`}
      value={property.label}
      placeholder={t('label', 'Label')}
      onSave={(label) => {
        const next = label.trim();

        if (next && next !== property.label) update.mutate({ id: property.id, label: next });
      }}
    />
  );
};

/** A choice property's options, edited as badges; other types have none. */
const OptionsCell = ({ property }: { property: Property }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateProperty();
  const [options, setOptions] = useState(property.options);

  if (!hasChoices(property.type)) return <RecordTableInlineCell />;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setOptions(property.options);
        else if (options.join('\n') !== property.options.join('\n'))
          update.mutate({ id: property.id, options });
      }}
    >
      <RecordTableInlineCell.Trigger aria-label={t('choices', 'Choices')}>
        <Badges labels={property.options} />
      </RecordTableInlineCell.Trigger>
      <RecordTableInlineCell.Content>
        <StringArrayInput
          value={options}
          onValueChange={setOptions}
          placeholder={t('add-choice', 'Add a choice')}
        />
      </RecordTableInlineCell.Content>
    </Popover>
  );
};

const RequiredCell = ({ property }: { property: Property }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateProperty();

  return (
    <RecordTableInlineCell>
      <Switch
        aria-label={t('required-of', '{{label}} is required', { label: property.label })}
        checked={property.isRequired}
        onCheckedChange={(isRequired) => update.mutate({ id: property.id, isRequired })}
      />
    </RecordTableInlineCell>
  );
};

/** The pipelines whose tickets show it; none means every pipeline. */
const PipelinesCell = ({ property }: { property: Property }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateProperty();
  const { pipelines } = useChoices();
  const name = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));

  return (
    <PickerField
      label={t('pipelines', 'Pipelines')}
      placeholder={t('every-pipeline', 'Every pipeline')}
      display={<Badges labels={property.pipelineIds.map((id) => name.get(id) ?? '')} />}
      options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
      value={property.pipelineIds}
      onValueChange={(pipelineIds) => update.mutate({ id: property.id, pipelineIds })}
      multiple
    />
  );
};

const MoreCell = ({ property }: { property: Property }) => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.tickets.properties.remove.mutationOptions(useSettingsChange()));
  const deleteRow = useDeleteRow(remove.mutate);

  return (
    <DeleteRowAction
      label={t('property-actions', 'Actions for {{label}}', { label: property.label })}
      onDelete={() =>
        void deleteRow(
          property.id,
          t('delete-property-confirm', 'Delete {{label}} and its value on every ticket?', {
            label: property.label,
          }),
        )
      }
    />
  );
};

const useColumns = (canManage: boolean) => {
  const { t } = useTranslation('frontline');
  const names = useTypeNames();

  return [
    ...(canManage
      ? [column<Property>('more', '', IconDots, 33, (row) => <MoreCell property={row} />)]
      : []),
    column<Property>('label', t('label', 'Label'), IconLetterCase, 220, (row) => (
      <LabelCell property={row} />
    )),
    column<Property>('type', t('type', 'Type'), IconCategory, 140, (row) => (
      <RecordTableInlineCell>
        <Badge variant="secondary">{names[row.type]}</Badge>
      </RecordTableInlineCell>
    )),
    column<Property>('options', t('choices', 'Choices'), IconList, 240, (row) => (
      <OptionsCell property={row} />
    )),
    column<Property>('isRequired', t('required', 'Required'), IconAsterisk, 100, (row) => (
      <RequiredCell property={row} />
    )),
    column<Property>('pipelines', t('pipelines', 'Pipelines'), IconGitBranch, 220, (row) => (
      <PipelinesCell property={row} />
    )),
    column<Property>('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 140, (row) => (
      <DateCell date={row.createdAt} />
    )),
  ];
};

/**
 * Settings › Ticket properties: the extra fields tickets carry, for every pipeline or a few,
 * edited in place. The old plugin's per-pipeline form layouts became these.
 */
export const PropertiesPage = () => {
  const { t } = useTranslation('frontline');
  const names = useTypeNames();
  const { filter, search } = useListFilterParams();
  const canManage = useCanManageSettings();

  const properties = useQuery(
    orpc.tickets.properties.list.queryOptions({ input: { filter, search } }),
  );

  return (
    <SettingsList
      id="frontline-ticket-properties"
      label={t('ticket-properties', 'Ticket properties')}
      allLabel={t('all-properties', 'All properties')}
      action={<AddProperty />}
      fields={[
        { path: 'subject.label', label: t('label', 'Label'), type: 'text', icon: IconLetterCase },
        {
          path: 'subject.type',
          label: t('type', 'Type'),
          type: 'select',
          icon: IconCategory,
          options: TYPES.map((type) => ({ value: type, label: names[type] })),
        },
        {
          path: 'subject.isRequired',
          label: t('required', 'Required'),
          type: 'boolean',
          icon: IconAsterisk,
        },
        {
          path: 'subject.createdAt',
          label: t('created-at', 'Created at'),
          type: 'date',
          icon: IconCalendarPlus,
        },
      ]}
      columns={useColumns(canManage)}
      rows={properties.data ?? []}
      isPending={properties.isPending}
      error={properties.error}
      empty={{
        icon: <IconForms />,
        title: t('no-properties-yet', 'No ticket properties yet'),
        description: t(
          'properties-empty',
          'A property is a field every ticket fills in, such as an order number.',
        ),
      }}
    />
  );
};
