import type { InferClientOutputs } from '@orpc/client';
import {
  IconCalendarPlus,
  IconCategory,
  IconDots,
  IconLetterCase,
  IconPalette,
  IconPlus,
  IconTag,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import {
  Button,
  ColorPicker,
  Input,
  RecordTableInlineCell,
  Select,
  TextField,
  useListFilterParams,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FormSheet } from '~/shared/FormSheet.tsx';
import { textOf } from '~/shared/hooks.ts';
import { TextCell } from '~/shared/Records.tsx';
import { column, DateCell } from '~/shared/Table.tsx';
import {
  DeleteRowAction,
  SettingsList,
  SheetField,
  useCanManageSettings,
  useDeleteRow,
  useSettingsChange,
} from './Settings.tsx';

type Tag = InferClientOutputs<Client>['tags']['get'];

type TagType = Tag['type'];

const TAG_TYPES: TagType[] = ['ticket', 'conversation', 'form'];

/** What each kind of tag labels, as the page names it. */
const useTagTypeNames = (): Record<TagType, string> => {
  const { t } = useTranslation('frontline');

  return {
    ticket: t('tickets', 'Tickets'),
    conversation: t('conversations', 'Conversations'),
    form: t('forms', 'Forms'),
  };
};

const DEFAULT_COLOR = '#6366F1';

const useUpdateTag = () => useMutation(orpc.tags.update.mutationOptions(useSettingsChange()));

const NameCell = ({ tag }: { tag: Tag }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTag();

  return (
    <TextField
      scope={`frontline-tags.${tag.id}.name`}
      value={tag.name}
      placeholder={t('name', 'Name')}
      onSave={(name) => {
        const next = name.trim();

        if (next && next !== tag.name) update.mutate({ id: tag.id, name: next });
      }}
    />
  );
};

const ColorCell = ({ tag }: { tag: Tag }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTag();

  return (
    <RecordTableInlineCell>
      <ColorPicker
        aria-label={t('tag-color', 'Colour of {{name}}', { name: tag.name })}
        value={tag.colorCode ?? DEFAULT_COLOR}
        onValueChange={(colorCode) => update.mutate({ id: tag.id, colorCode })}
        className="w-12 flex-none"
      />
    </RecordTableInlineCell>
  );
};

const MoreCell = ({ tag }: { tag: Tag }) => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.tags.remove.mutationOptions(useSettingsChange()));
  const deleteRow = useDeleteRow(remove.mutate);

  return (
    <DeleteRowAction
      label={t('tag-actions', 'Actions for {{name}}', { name: tag.name })}
      onDelete={() =>
        void deleteRow(tag.id, t('delete-tag-confirm', 'Delete the tag {{name}}?', tag))
      }
    />
  );
};

const AddTag = () => {
  const { t } = useTranslation('frontline');
  const types = useTagTypeNames();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TagType>('ticket');
  const [colorCode, setColorCode] = useState(DEFAULT_COLOR);
  const { onSuccess, onError } = useSettingsChange();

  const create = useMutation(
    orpc.tags.create.mutationOptions({
      onSuccess: () => {
        onSuccess();
        setOpen(false);
      },
      onError,
    }),
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        {t('add-tag', 'Add tag')}
      </Button>
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={t('add-tag', 'Add tag')}
        submitting={create.isPending}
        error={create.error}
        onSubmit={(form) =>
          create.mutate({ type, name: textOf(form.get('name')).trim(), colorCode })
        }
      >
        <SheetField label={t('name', 'Name')}>
          <Input name="name" required aria-label={t('name', 'Name')} />
        </SheetField>
        <SheetField label={t('tags-for', 'For')}>
          <Select
            value={type}
            onValueChange={(next) => setType(TAG_TYPES.find((row) => row === next) ?? 'ticket')}
          >
            <Select.Trigger aria-label={t('tags-for', 'For')}>
              <Select.Value>{types[type]}</Select.Value>
            </Select.Trigger>
            <Select.Content>
              {TAG_TYPES.map((row) => (
                <Select.Item key={row} value={row}>
                  {types[row]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </SheetField>
        <SheetField label={t('color', 'Colour')}>
          <ColorPicker
            aria-label={t('color', 'Colour')}
            value={colorCode}
            onValueChange={setColorCode}
            className="w-12"
          />
        </SheetField>
      </FormSheet>
    </>
  );
};

const useColumns = (canManage: boolean) => {
  const { t } = useTranslation('frontline');
  const types = useTagTypeNames();

  return [
    ...(canManage ? [column<Tag>('more', '', IconDots, 33, (tag) => <MoreCell tag={tag} />)] : []),
    column<Tag>('color', t('color', 'Colour'), IconPalette, 80, (tag) => <ColorCell tag={tag} />),
    column<Tag>('name', t('name', 'Name'), IconLetterCase, 280, (tag) => <NameCell tag={tag} />),
    column<Tag>('type', t('tags-for', 'For'), IconCategory, 140, (tag) => (
      <TextCell value={types[tag.type]} />
    )),
    column<Tag>('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 140, (tag) => (
      <DateCell date={tag.createdAt} />
    )),
  ];
};

/**
 * Settings › Tags: the tags members put on tickets, conversations and forms, renamed and
 * recoloured in place.
 */
export const TagsPage = () => {
  const { t } = useTranslation('frontline');
  const { filter, search } = useListFilterParams();
  const canManage = useCanManageSettings();
  const types = useTagTypeNames();
  const tags = useQuery(orpc.tags.list.queryOptions({ input: { filter, search } }));

  return (
    <SettingsList
      canManage={canManage}
      id="frontline-tags"
      label={t('tags', 'Tags')}
      allLabel={t('all-tags', 'All tags')}
      action={<AddTag />}
      fields={[
        { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
        {
          path: 'subject.type',
          label: t('tags-for', 'For'),
          type: 'select',
          icon: IconCategory,
          options: TAG_TYPES.map((type) => ({ value: type, label: types[type] })),
        },
        {
          path: 'subject.createdBy',
          label: t('created-by', 'Created by'),
          type: 'member',
          icon: IconUser,
        },
        {
          path: 'subject.createdAt',
          label: t('created-at', 'Created at'),
          type: 'date',
          icon: IconCalendarPlus,
        },
      ]}
      columns={useColumns(canManage)}
      rows={tags.data?.data ?? []}
      isPending={tags.isPending}
      error={tags.error}
      empty={{
        icon: <IconTag />,
        title: t('no-tags-yet', 'No tags yet'),
        description: t(
          'tags-empty',
          'Tags group tickets, conversations and forms by topic, such as billing or VIP.',
        ),
      }}
    />
  );
};
