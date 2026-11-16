import { memberQueries } from '@erxes/core-contract/client';
import {
  IconCalendarPlus,
  IconCalendarUp,
  IconChecklist,
  IconCircles,
  IconHelp,
  IconLetterCase,
  IconProgressCheck,
  IconSend,
} from '@tabler/icons-react';
import {
  Button,
  DisplayMenu,
  ListFilter,
  PageContainer,
  PageHeader,
  RecordList,
  type TListFilterField,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';
import { SURVEY_TYPE } from '~/plugin.ts';
import { useManagedChannels } from '~/shared/ChannelSelect.tsx';
import { ArchiveButtons } from '~/shared/ArchiveButtons.tsx';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { DeleteButton, ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { SurveyList, SurveysTable } from './SurveyRows.tsx';
import {
  SURVEY_STATUSES,
  useDeleteSurveys,
  useSetSurveyStatus,
  useStatusNames,
  useSurveys,
} from './useSurveys.ts';

const LIST = 'frontline-surveys';

/** Grouped by status first; the table shows every column. */
const DISPLAYS = ['list', 'table'] as const;

/** Archives, reactivates or deletes the selected surveys, each in one request. */
const BulkActions = ({ selected, clear }: { selected: string[]; clear: () => void }) => {
  const setStatus = useSetSurveyStatus();
  const { deleteSurveys, isPending } = useDeleteSurveys();

  return (
    <>
      <ArchiveButtons
        disabled={setStatus.isPending}
        set={(status) => setStatus.mutate({ ids: selected, status }, { onSuccess: clear })}
      />
      <DeleteButton disabled={isPending} onClick={() => void deleteSurveys(selected, clear)} />
    </>
  );
};

const bulk = (selected: string[], clear: () => void) => (
  <BulkActions selected={selected} clear={clear} />
);

/** What the surveys list's filter bar offers; the API applies it (`surveys.ts`). */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const channels = useChannels().data?.channels ?? [];

  return [
    { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.question',
      label: t('survey-question', 'Question'),
      type: 'text',
      icon: IconHelp,
    },
    {
      path: 'subject.status',
      label: t('status', 'Status'),
      type: 'select',
      icon: IconProgressCheck,
      options: SURVEY_STATUSES.map((status) => ({ value: status, label: statuses[status] })),
    },
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
    { path: 'subject.sentCount', label: t('survey-sent', 'Sent'), type: 'number', icon: IconSend },
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
 * The surveys of the member's channels under core's list bar, grouped by status or as a table
 * (the Display menu), newest first and a page at a time. A survey opens in core's side panel, and
 * New survey drafts one there.
 */
export const SurveysPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const [display] = useListDisplay(LIST, DISPLAYS);
  const canCreate = useManagedChannels().length > 0;

  const { surveys, totalCount, isPending, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSurveys();

  const manage = surveys.some((survey) => survey.canManage);

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
            <IconChecklist />
            {t('surveys', 'Surveys')}
          </span>
        </PageHeader.Start>
        <PageHeader.End>
          <CreateButton
            allowed={canCreate}
            label={t('new-survey', 'New survey')}
            onClick={() => openNew(SURVEY_TYPE, {})}
          />
        </PageHeader.End>
      </PageHeader>
      <ViewBar allLabel={t('all-surveys', 'All surveys')}>
        <ListFilter id={LIST} fields={useFields()} members={memberQueries} totalCount={totalCount}>
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && surveys.length === 0 ? (
        <ListEmpty
          icon={<IconChecklist />}
          title={t('no-surveys-yet', 'No surveys yet')}
          description={t(
            'no-surveys-description',
            'Ask customers a quick question and see how they vote.',
          )}
        />
      ) : display === 'table' ? (
        <SurveysTable
          surveys={surveys}
          manage={manage}
          isPending={isPending}
          hasNextPage={hasNextPage}
          fetchNextPage={() => void fetchNextPage()}
        >
          {manage && <SelectionBar>{bulk}</SelectionBar>}
        </SurveysTable>
      ) : (
        <RecordList.Provider listId={LIST}>
          {isPending ? <RecordList.Skeleton /> : <SurveyList surveys={surveys} />}
          {hasNextPage && (
            <Button
              variant="ghost"
              className="m-3 self-center"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {t('load-more', 'Load more')}
            </Button>
          )}
          {manage && (
            <ListSelectionBar shown={surveys.map((survey) => survey.id)}>{bulk}</ListSelectionBar>
          )}
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
