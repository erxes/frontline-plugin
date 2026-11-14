import {
  IconAlignLeft,
  IconArrowBarToRight,
  IconCalendarPlus,
  IconCalendarUp,
  IconEdit,
  IconGitBranch,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Combobox,
  Command,
  CommandBar,
  Kbd,
  Popover,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  RelativeDateDisplay,
  Separator,
  useConfirm,
  useScopedHotkeys,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { ListEmpty, SearchSubHeader } from '../shared/List.tsx';
import { MoveTemplateDialog, ResponseTemplatePanel } from './ResponseTemplatePanel.tsx';
import {
  type ResponseTemplate,
  useResponseTemplates,
  useTemplateChange,
  useTemplatePanel,
} from './useResponseTemplates.ts';

/** Asks for "delete" to be typed, then deletes the templates. */
const useDeleteTemplates = () => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const change = useTemplateChange();
  const remove = useMutation(orpc.responseTemplates.remove.mutationOptions());

  const deleteTemplates = async (ids: string[], done?: () => void) => {
    await confirm({
      message: t('delete-templates-confirm', {
        defaultValue: "Delete {{count}} response templates? This can't be undone.",
        count: ids.length,
      }),
      options: { confirmationValue: 'delete', okLabel: t('delete', 'Delete') },
    });
    const results = await Promise.allSettled(ids.map((id) => remove.mutateAsync({ id })));
    const failed = results.find((result) => result.status === 'rejected');

    done?.();
    await change.onSuccess();

    if (failed?.reason instanceof Error) change.onError(failed.reason);
  };

  return { deleteTemplates, isPending: remove.isPending };
};

/** "Create response template", with C as its shortcut, for the channel's admins. */
export const CreateTemplate = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { canManage } = useResponseTemplates(channelId);
  const { open } = useTemplatePanel();

  useScopedHotkeys('c', () => canManage && open('new'), 'app');

  if (!canManage) return null;

  return (
    <Button onClick={() => open('new')}>
      <IconPlus />
      {t('create-response-template', 'Create response template')}
      <Kbd>C</Kbd>
    </Button>
  );
};

const MoreCell = ({ template }: { template: ResponseTemplate }) => {
  const { t } = useTranslation('frontline');
  const { open } = useTemplatePanel();
  const { deleteTemplates } = useDeleteTemplates();
  const [moving, setMoving] = useState(false);

  return (
    <>
      <Popover>
        <Popover.Trigger
          render={
            <RecordTable.MoreButton
              className="size-full"
              aria-label={t('template-actions', 'Actions for {{name}}', { name: template.name })}
            />
          }
        />
        <Combobox.Content>
          <Command shouldFilter={false}>
            <Command.List>
              <Command.Item value="edit" onSelect={() => open(template.id)}>
                <IconEdit /> {t('edit', 'Edit')}
              </Command.Item>
              <Command.Item value="move" onSelect={() => setMoving(true)}>
                <IconArrowBarToRight /> {t('move-to-channel', 'Move to channel')}
              </Command.Item>
              <Command.Item value="delete" onSelect={() => void deleteTemplates([template.id])}>
                <IconTrash /> {t('delete', 'Delete')}
              </Command.Item>
            </Command.List>
          </Command>
        </Combobox.Content>
      </Popover>
      {moving && <MoveTemplateDialog template={template} onClose={() => setMoving(false)} />}
    </>
  );
};

const NameCell = ({ template }: { template: ResponseTemplate }) => {
  const { open } = useTemplatePanel();

  return (
    <RecordTableInlineCell>
      <button type="button" className="truncate hover:underline" onClick={() => open(template.id)}>
        {template.name}
      </button>
    </RecordTableInlineCell>
  );
};

const DateCell = ({ date }: { date: Date }) => (
  <RecordTableInlineCell>
    <RelativeDateDisplay value={date.toISOString()}>
      <RelativeDateDisplay.Value value={date.toISOString()} />
    </RelativeDateDisplay>
  </RecordTableInlineCell>
);

const useColumns = (canManage: boolean): RecordTableColumnDef<ResponseTemplate>[] => {
  const { t } = useTranslation('frontline');

  const manage: RecordTableColumnDef<ResponseTemplate>[] = [
    { id: 'more', cell: ({ row }) => <MoreCell template={row.original} />, size: 33 },
    RecordTable.checkboxColumnOf<ResponseTemplate>(),
  ];

  return [
    ...(canManage ? manage : []),
    {
      id: 'name',
      header: () => <RecordTable.InlineHead label={t('title', 'Title')} icon={IconAlignLeft} />,
      cell: ({ row }) => <NameCell template={row.original} />,
      size: 400,
    },
    {
      id: 'createdAt',
      header: () => (
        <RecordTable.InlineHead label={t('created-at', 'Created at')} icon={IconCalendarPlus} />
      ),
      cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      size: 140,
    },
    {
      id: 'updatedAt',
      header: () => (
        <RecordTable.InlineHead label={t('updated-at', 'Updated at')} icon={IconCalendarUp} />
      ),
      cell: ({ row }) => <DateCell date={row.original.updatedAt} />,
      size: 140,
    },
  ];
};

/** Deletes the selected templates from the bar under the table. */
const TemplatesCommandBar = () => {
  const { t } = useTranslation('frontline');
  const { table } = RecordTable.useRecordTable();

  const selected = RecordTable.useRecordTableState((_, current) =>
    current.getFilteredSelectedRowModel().rows.map((row) => row.id),
  );

  const { deleteTemplates, isPending } = useDeleteTemplates();

  return (
    <CommandBar open={selected.length > 0}>
      <CommandBar.Bar>
        <CommandBar.Value onClose={() => table.resetRowSelection()}>
          {t('n-selected', { defaultValue: '{{count}} selected', count: selected.length })}
        </CommandBar.Value>
        <Separator.Inline />
        <Button
          variant="secondary"
          tone="destructive"
          disabled={isPending}
          onClick={() => void deleteTemplates(selected, () => table.resetRowSelection())}
        >
          <IconTrash />
          {t('delete', 'Delete')}
        </Button>
      </CommandBar.Bar>
    </CommandBar>
  );
};

/** A channel's response templates, newest first, with search, paging and bulk delete. */
export const ResponseTemplatesPage = () => {
  const { t } = useTranslation('frontline');
  const { id: channelId = '' } = useParams();

  const { templates, totalCount, canManage, isPending, error, hasNextPage, fetchNextPage } =
    useResponseTemplates(channelId);

  const columns = useColumns(canManage);

  return (
    <>
      <SearchSubHeader id="response-templates-filter" count={totalCount} />
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && templates.length === 0 ? (
        <ListEmpty
          icon={<IconGitBranch />}
          title={t('no-responses-yet', 'No responses yet')}
          description={t(
            'get-started-creating-first-response',
            'Get started by creating your first response',
          )}
          action={<CreateTemplate channelId={channelId} />}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_response_templates"
          columns={columns}
          data={templates}
          stickyColumns={['more', 'checkbox', 'name']}
          className="m-3"
        >
          <RecordTable.CursorProvider hasNextPage={hasNextPage} dataLength={templates.length}>
            <RecordTable>
              <RecordTable.Header />
              <RecordTable.Body>
                {isPending && <RecordTable.RowSkeleton rows={10} />}
                <RecordTable.RowList />
                <RecordTable.CursorForwardSkeleton handleFetchMore={() => void fetchNextPage()} />
              </RecordTable.Body>
            </RecordTable>
          </RecordTable.CursorProvider>
          {canManage && <TemplatesCommandBar />}
        </RecordTable.Provider>
      )}
      <ResponseTemplatePanel channelId={channelId} />
    </>
  );
};
