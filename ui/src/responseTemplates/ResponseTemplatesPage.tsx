import {
  IconAlignLeft,
  IconArrowBarToRight,
  IconCalendarPlus,
  IconCalendarUp,
  IconEdit,
  IconGitBranch,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { RecordTable, type RecordTableColumnDef, RecordTableInlineCell } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { CreateButton, ListEmpty, SearchSubHeader } from '../shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, useConfirmDelete } from '../shared/Records.tsx';
import { DateCell, PagedRows } from '../shared/Table.tsx';
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
  const confirm = useConfirmDelete();
  const change = useTemplateChange();
  const remove = useMutation(orpc.responseTemplates.remove.mutationOptions());

  const deleteTemplates = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-templates-confirm', {
        defaultValue: 'Delete {{count}} response templates?',
        count: ids.length,
      }),
    );
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

  return (
    <CreateButton
      allowed={canManage}
      label={t('create-response-template', 'Create response template')}
      onClick={() => open('new')}
    />
  );
};

const MoreCell = ({ template }: { template: ResponseTemplate }) => {
  const { t } = useTranslation('frontline');
  const { open } = useTemplatePanel();
  const { deleteTemplates } = useDeleteTemplates();
  const [moving, setMoving] = useState(false);

  return (
    <>
      <RowActions
        label={t('template-actions', 'Actions for {{name}}', { name: template.name })}
        actions={[
          {
            value: 'edit',
            icon: <IconEdit />,
            label: t('edit', 'Edit'),
            onSelect: () => open(template.id),
          },
          {
            value: 'move',
            icon: <IconArrowBarToRight />,
            label: t('move-to-channel', 'Move to channel'),
            onSelect: () => setMoving(true),
          },
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void deleteTemplates([template.id]),
          },
        ]}
      />
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
  const { deleteTemplates, isPending } = useDeleteTemplates();

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton disabled={isPending} onClick={() => void deleteTemplates(selected, clear)} />
      )}
    </SelectionBar>
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
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={templates.length}
            fetchNextPage={() => void fetchNextPage()}
          />
          {canManage && <TemplatesCommandBar />}
        </RecordTable.Provider>
      )}
      <ResponseTemplatePanel channelId={channelId} />
    </>
  );
};
