import { memberQueries } from '@erxes/core-contract/client';
import {
  IconCalendarPlus,
  IconCalendarUp,
  IconChecklist,
  IconHelp,
  IconLetterCase,
  IconProgressCheck,
  IconSend,
} from '@tabler/icons-react';
import {
  DisplayMenu,
  ListFilter,
  PageContainer,
  RecordList,
  type TListFilterField,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { SURVEY_TYPE } from '~/plugin.ts';
import { useManagedChannels } from '~/shared/ChannelSelect.tsx';
import { ArchiveButtons } from '~/shared/ArchiveButtons.tsx';
import { AppHeader } from '~/shared/Header.tsx';
import { CreateButton, ListEmpty, ListError, LoadPage } from '~/shared/List.tsx';
import { DeleteButton, ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { SurveyList, SurveysTable } from './SurveyRows.tsx';
import {
  SURVEY_STATUSES,
  useDeleteSurveys,
  useSetSurveyStatus,
  useStatusNames,
  useSurveys,
} from './useSurveys.ts';
import { useChannelField } from '~/shared/channelField.ts';

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
  const channelField = useChannelField();

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
    ...channelField,
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

  const list = useSurveys();
  const { rows: surveys, totalCount, isPending, error } = list;

  const manage = surveys.some((survey) => survey.canManage);

  return (
    <PageContainer>
      <AppHeader icon={IconChecklist} app={{ label: t('surveys', 'Surveys') }}>
        <CreateButton
          allowed={canCreate}
          label={t('new-survey', 'New survey')}
          onClick={() => openNew(SURVEY_TYPE, {})}
        />
      </AppHeader>
      <ViewBar allLabel={t('all-surveys', 'All surveys')}>
        <ListFilter id={LIST} fields={useFields()} members={memberQueries} totalCount={totalCount}>
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <ListError error={error} />
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
        <SurveysTable surveys={surveys} manage={manage} paging={list}>
          {manage && <SelectionBar>{bulk}</SelectionBar>}
        </SurveysTable>
      ) : (
        <RecordList.Provider listId={LIST}>
          {isPending ? <RecordList.Skeleton /> : <SurveyList surveys={surveys} />}
          <LoadPage paging={list} />
          {manage && (
            <ListSelectionBar shown={surveys.map((survey) => survey.id)}>{bulk}</ListSelectionBar>
          )}
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
