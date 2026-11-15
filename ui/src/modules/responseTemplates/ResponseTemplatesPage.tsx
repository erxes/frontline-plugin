import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlignLeft,
  IconCalendarPlus,
  IconCalendarUp,
  IconLetterCase,
  IconMessageReply,
  IconPlus,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  editorText,
  ListFilter,
  MemberInline,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ChannelsHeader } from '@/channels/ChannelsHeader.tsx';
import { type Channel, useChannel } from '@/channels/useChannels.ts';
import { RESPONSE_TEMPLATE_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { DateCell, PagedRows } from '~/shared/Table.tsx';
import {
  type ResponseTemplate,
  useDeleteTemplates,
  useResponseTemplates,
} from './useResponseTemplates.ts';

/** The name opens the template in core's side panel, as a customer's name does. */
const NameCell = ({ template }: { template: ResponseTemplate }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: RESPONSE_TEMPLATE_TYPE, contentId: template.id })}
      >
        {template.name}
      </Button>
    </RecordTableInlineCell>
  );
};

const MoreCell = ({ template }: { template: ResponseTemplate }) => {
  const { t } = useTranslation('frontline');
  const { deleteTemplates } = useDeleteTemplates();

  return (
    <RowActions
      label={t('template-actions', 'Actions for {{name}}', { name: template.name })}
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteTemplates([template.id]),
        },
      ]}
    />
  );
};

/** Members who can't manage the channel get no row actions or selection. */
const useColumns = (canManage: boolean): RecordTableColumnDef<ResponseTemplate>[] => {
  const { t } = useTranslation('frontline');

  const manage: RecordTableColumnDef<ResponseTemplate>[] = [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell template={row.original} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<ResponseTemplate>(),
  ];

  return [
    ...(canManage ? manage : []),
    {
      id: 'name',
      header: () => <RecordTable.InlineHead label={t('name', 'Name')} icon={IconLetterCase} />,
      cell: ({ row }) => <NameCell template={row.original} />,
      size: 240,
    },
    {
      id: 'content',
      header: () => <RecordTable.InlineHead label={t('content', 'Content')} icon={IconAlignLeft} />,
      cell: ({ row }) => <TextCell value={editorText(row.original.content)} />,
      size: 320,
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
      size: 130,
    },
    {
      id: 'updatedAt',
      header: () => (
        <RecordTable.InlineHead label={t('updated-at', 'Updated at')} icon={IconCalendarUp} />
      ),
      cell: ({ row }) => <DateCell date={row.original.updatedAt} />,
      size: 130,
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

/** The fields the filter bar narrows templates by; the API applies their rules. */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
    { path: 'subject.content', label: t('content', 'Content'), type: 'text', icon: IconAlignLeft },
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
    {
      path: 'subject.updatedAt',
      label: t('updated-at', 'Updated at'),
      type: 'date',
      icon: IconCalendarUp,
    },
  ];
};

const TemplatesTable = ({ channel, onCreate }: { channel: Channel; onCreate: () => void }) => {
  const { t } = useTranslation('frontline');

  const { templates, totalCount, isPending, error, hasNextPage, fetchNextPage } =
    useResponseTemplates(channel.id);

  const columns = useColumns(channel.canManage);

  return (
    <>
      <ViewBar allLabel={t('all-response-templates', 'All response templates')}>
        <ListFilter
          id="frontline-response-templates"
          fields={useFields()}
          members={memberQueries}
          totalCount={totalCount}
        />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && templates.length === 0 ? (
        <ListEmpty
          icon={<IconMessageReply />}
          title={t('no-responses-yet', 'No responses yet')}
          description={t(
            'get-started-creating-first-response',
            'Get started by creating your first response',
          )}
          action={
            channel.canManage && (
              // The header's button holds the C shortcut; this one only clicks.
              <Button variant="secondary" onClick={onCreate}>
                <IconPlus />
                {t('create-response-template', 'Create response template')}
              </Button>
            )
          }
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
          {channel.canManage && <TemplatesCommandBar />}
        </RecordTable.Provider>
      )}
    </>
  );
};

/**
 * A channel's response templates, newest first, under core's list bar. A template opens in
 * core's side panel; Create response template drafts one there, in this channel.
 */
export const ResponseTemplatesPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '' } = useParams();
  const { data, error } = useChannel(id);
  const { openNew } = useOpenRecord();
  const create = () => openNew(RESPONSE_TEMPLATE_TYPE, { channelId: id });

  return (
    <PageContainer>
      <ChannelsHeader channelId={id} label={t('response-templates', 'Response templates')}>
        {data && (
          <CreateButton
            allowed={data.canManage}
            label={t('create-response-template', 'Create response template')}
            onClick={create}
          />
        )}
      </ChannelsHeader>
      {error && <p className="m-3 text-sm text-destructive-text">{error.message}</p>}
      {data && <TemplatesTable channel={data} onCreate={create} />}
    </PageContainer>
  );
};
