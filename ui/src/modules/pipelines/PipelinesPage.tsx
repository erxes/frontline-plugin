import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconCalendarPlus,
  IconCalendarUp,
  IconFileDescription,
  IconGitBranch,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { useParams } from 'react-router-dom';
import { ChannelsHeader } from '@/channels/ChannelsHeader.tsx';
import { useChannel } from '@/channels/useChannels.ts';
import { PIPELINE_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { DeleteButton, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { PipelineMenu } from './PipelinePanel.tsx';
import { type Pipeline, useDeletePipelines, usePipelines } from './queries.ts';

const column = columnOf<Pipeline>;

/** The name opens the pipeline in core's side panel, as a customer's name does. */
const NameCell = ({ pipeline }: { pipeline: Pipeline }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: PIPELINE_TYPE, contentId: pipeline.id })}
      >
        {pipeline.name}
      </Button>
    </RecordTableInlineCell>
  );
};

const MoreCell = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');

  return (
    <PipelineMenu
      pipeline={pipeline}
      trigger={
        <RecordTable.MoreButton
          className="size-full"
          aria-label={t('pipeline-actions', 'Actions for {{name}}', { name: pipeline.name })}
        />
      }
    />
  );
};

/** Members who can't change the channel's pipelines get no row actions or selection. */
const useColumns = (canManage: boolean): RecordTableColumnDef<Pipeline>[] => {
  const { t } = useTranslation('frontline');

  const manage: RecordTableColumnDef<Pipeline>[] = [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell pipeline={row.original} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<Pipeline>(),
  ];

  return [
    ...(canManage ? manage : []),
    column('name', t('name', 'Name'), IconAlignLeft, 240, (pipeline) => (
      <NameCell pipeline={pipeline} />
    )),
    column('description', t('description', 'Description'), IconFileDescription, 260, (pipeline) => (
      <TextCell value={pipeline.description} />
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 180, (pipeline) => (
      <RecordTableInlineCell>
        <MemberLine id={pipeline.createdBy} />
      </RecordTableInlineCell>
    )),
    column('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 130, (pipeline) => (
      <DateCell date={pipeline.createdAt} />
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 130, (pipeline) => (
      <DateCell date={pipeline.updatedAt} />
    )),
  ];
};

/** Deletes the selected pipelines from the bar under the table. */
const PipelinesCommandBar = () => {
  const { deletePipelines, isPending } = useDeletePipelines();

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton disabled={isPending} onClick={() => void deletePipelines(selected, clear)} />
      )}
    </SelectionBar>
  );
};

const usePipelineFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconAlignLeft },
    {
      path: 'subject.description',
      label: t('description', 'Description'),
      type: 'text',
      icon: IconFileDescription,
    },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
    {
      path: 'subject.updatedAt',
      label: t('updated-at', 'Updated at'),
      type: 'date',
      icon: IconCalendarUp,
    },
  ];
};

/**
 * A channel's pipelines, newest first, under core's list bar: the filter (`F`) on the fields
 * above, whose rules the API applies (`api/src/modules/pipelines/pipelines.ts`). A pipeline opens
 * in core's side panel, with its statuses and SLA in the panel's tabs; Create pipeline drafts one
 * there. The channel's admins move and delete them.
 */
export const PipelinesPage = () => {
  const { t } = useTranslation('frontline');
  const { id: channelId = '' } = useParams();
  const { openNew } = useOpenRecord();
  const canManage = useChannel(channelId).data?.canManage ?? false;

  const { pipelines, totalCount, isPending, error, hasNextPage, fetchNextPage } =
    usePipelines(channelId);

  const columns = useColumns(canManage);
  const create = () => openNew(PIPELINE_TYPE, { channelId });

  return (
    <PageContainer>
      <ChannelsHeader channelId={channelId} label={t('pipelines', 'Pipelines')}>
        <CreateButton
          allowed={canManage}
          label={t('create-pipeline', 'Create pipeline')}
          onClick={create}
        />
      </ChannelsHeader>
      <ViewBar allLabel={t('all-pipelines', 'All pipelines')}>
        <ListFilter
          id="frontline-pipelines"
          fields={usePipelineFields()}
          members={memberQueries}
          totalCount={totalCount}
        />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && pipelines.length === 0 ? (
        <ListEmpty
          icon={<IconGitBranch />}
          title={t('no-pipelines-yet', 'No pipelines yet')}
          description={t(
            'no-pipelines-description',
            'A pipeline holds the statuses and SLA a channel works its tickets by.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_pipelines"
          columns={columns}
          data={pipelines}
          stickyColumns={['more', 'checkbox', 'name']}
          className="m-3"
        >
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={pipelines.length}
            fetchNextPage={() => void fetchNextPage()}
          />
          <PipelinesCommandBar />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
