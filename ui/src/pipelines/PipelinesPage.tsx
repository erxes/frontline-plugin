import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconArrowBarToRight,
  IconCalendarPlus,
  IconCalendarUp,
  IconEdit,
  IconGitBranch,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  MemberInline,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  toast,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { CreateButton, ListEmpty } from '../shared/List.tsx';
import { MoveToChannelDialog } from '../shared/MoveToChannel.tsx';
import { RowActions, TextCell, useConfirmDelete } from '../shared/Records.tsx';
import { DateCell, PagedRows } from '../shared/Table.tsx';
import { PipelinePanel } from './PipelinePanel.tsx';
import {
  type Pipeline,
  pipelinePath,
  useCanManage,
  usePipelineChange,
  usePipelinePanel,
  usePipelineRoute,
  usePipelines,
} from './queries.ts';

/** "Create pipeline", with C as its shortcut, for the channel's admins. */
export const CreatePipeline = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { open } = usePipelinePanel();

  return (
    <CreateButton
      allowed={useCanManage(channelId)}
      label={t('create-pipeline', 'Create pipeline')}
      onClick={() => open('new')}
    />
  );
};

/** Asks for "delete" to be typed, then deletes the pipeline and its statuses. */
const useDeletePipeline = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const change = usePipelineChange();

  const remove = useMutation(
    orpc.pipelines.remove.mutationOptions({
      ...change,
      onSuccess: async () => {
        toast({ title: t('pipeline-removed-successfully', 'Pipeline removed successfully') });
        await change.onSuccess();
      },
    }),
  );

  return async (pipeline: Pipeline) => {
    await confirm(t('confirm-remove-pipeline', 'Are you sure you want to delete this pipeline?'));
    remove.mutate({ id: pipeline.id });
  };
};

const MoreCell = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const deletePipeline = useDeletePipeline();
  const move = useMutation(orpc.pipelines.update.mutationOptions(usePipelineChange()));
  const [moving, setMoving] = useState(false);

  return (
    <>
      <RowActions
        label={t('pipeline-actions', 'Actions for {{name}}', { name: pipeline.name })}
        actions={[
          {
            value: 'edit',
            icon: <IconEdit />,
            label: t('edit', 'Edit'),
            onSelect: () => void navigate(pipelinePath(pipeline.channelId, pipeline.id)),
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
            onSelect: () => void deletePipeline(pipeline),
          },
        ]}
      />
      {moving && (
        <MoveToChannelDialog
          name={pipeline.name}
          channelId={pipeline.channelId}
          onMove={(channelId) => move.mutateAsync({ id: pipeline.id, channelId })}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
};

const manage: RecordTableColumnDef<Pipeline>[] = [
  { id: 'more', cell: ({ row }) => <MoreCell pipeline={row.original} />, size: 33 },
];

const useColumns = (canManage: boolean): RecordTableColumnDef<Pipeline>[] => {
  const { t } = useTranslation('frontline');

  return [
    ...(canManage ? manage : []),
    {
      id: 'name',
      header: () => <RecordTable.InlineHead label={t('name', 'Name')} icon={IconGitBranch} />,
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <Link
            to={pipelinePath(row.original.channelId, row.original.id)}
            className="truncate font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        </RecordTableInlineCell>
      ),
      size: 280,
    },
    {
      id: 'description',
      header: () => (
        <RecordTable.InlineHead label={t('description', 'Description')} icon={IconAlignLeft} />
      ),
      cell: ({ row }) => <TextCell value={row.original.description} />,
      size: 280,
    },
    {
      id: 'createdBy',
      header: () => (
        <RecordTable.InlineHead label={t('created-by', 'Created by')} icon={IconUser} />
      ),
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <MemberInline memberId={row.original.createdBy} members={memberQueries} />
        </RecordTableInlineCell>
      ),
      size: 180,
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

/** A channel's pipelines, newest first; its admins create, move and delete them. */
export const PipelinesPage = () => {
  const { t } = useTranslation('frontline');
  const { channelId } = usePipelineRoute();
  const canManage = useCanManage(channelId);
  const { pipelines, isPending, error, hasNextPage, fetchNextPage } = usePipelines(channelId);
  const columns = useColumns(canManage);

  return (
    <>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && pipelines.length === 0 ? (
        <ListEmpty
          icon={<IconGitBranch />}
          title={t('no-pipelines-yet', 'No pipelines yet')}
          description={t(
            'no-pipelines-description',
            'Get started by creating your first pipeline to organize and manage your workflow processes.',
          )}
          action={<CreatePipeline channelId={channelId} />}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_pipelines"
          columns={columns}
          data={pipelines}
          stickyColumns={['more', 'name']}
          className="m-3"
        >
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={pipelines.length}
            fetchNextPage={() => void fetchNextPage()}
          />
        </RecordTable.Provider>
      )}
      <PipelinePanel channelId={channelId} />
    </>
  );
};
