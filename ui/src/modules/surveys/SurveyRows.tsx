import {
  IconCalendarUp,
  IconCircles,
  IconDots,
  IconHelp,
  IconLetterCase,
  IconProgressCheck,
  IconSend,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import {
  Button,
  RecordList,
  type RecordListGroup,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  RelativeDateDisplay,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { ActionsMenu, RowActions, TextCell } from '~/shared/Records.tsx';
import type { Paging } from '~/shared/paging.ts';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { StatusBadge, SurveyTitle, useSurveyActions } from './SurveyCells.tsx';
import { SURVEY_STATUSES, type Survey, useStatusNames } from './useSurveys.ts';
import { MemberLine } from '~/shared/Person.tsx';

const RowMenu = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const actions = useSurveyActions(survey);

  if (actions.length === 0) return null;

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('survey-actions', 'Actions for {{title}}', { title: survey.title })}
        >
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** One survey: its title, channel, votes, author, when it changed, and its menu. */
const SurveyRow = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
      <span className="flex min-w-0 flex-1">
        <SurveyTitle survey={survey} />
      </span>
      <span className="hidden w-36 shrink-0 text-muted-foreground md:flex">
        <ChannelLabel id={survey.channelId} />
      </span>
      <span className="w-24 shrink-0 text-muted-foreground">
        {t('survey-vote-count', { defaultValue: '{{count}} votes', count: survey.voteCount })}
      </span>
      <span className="hidden w-36 shrink-0 md:block">
        <MemberLine id={survey.createdBy} />
      </span>
      <span className="w-24 shrink-0 text-muted-foreground">
        <RelativeDateDisplay value={survey.updatedAt.toISOString()}>
          <RelativeDateDisplay.Value value={survey.updatedAt.toISOString()} />
        </RelativeDateDisplay>
      </span>
      <RowMenu survey={survey} />
    </div>
  );
};

/**
 * The surveys grouped by status, what waits for review first, each group under a header that
 * folds it away. Inside `RecordList.Provider`, whose selection the bulk bar reads.
 */
export const SurveyList = ({ surveys }: { surveys: Survey[] }) => {
  const statuses = useStatusNames();
  const byStatus = Map.groupBy(surveys, (survey) => survey.status);

  const groups: RecordListGroup<Survey>[] = SURVEY_STATUSES.flatMap((status) => {
    const rows = byStatus.get(status) ?? [];

    return rows.length === 0 ? [] : [{ id: status, label: statuses[status], rows }];
  });

  return (
    <RecordList
      groups={groups}
      rowId={(survey) => survey.id}
      rowLabel={(survey) => survey.title}
      renderRow={(survey) => <SurveyRow survey={survey} />}
    />
  );
};

const column = columnOf<Survey>;

const MoreCell = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const actions = useSurveyActions(survey);

  if (actions.length === 0) return null;

  return (
    <RowActions
      label={t('survey-actions', 'Actions for {{title}}', { title: survey.title })}
      actions={actions}
    />
  );
};

const useColumns = (manage: boolean): RecordTableColumnDef<Survey>[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell survey={row.original} />,
      size: 33,
    },
    ...(manage ? [RecordTable.checkboxColumnOf<Survey>()] : []),
    column('title', t('title', 'Title'), IconLetterCase, 260, (survey) => (
      <RecordTableInlineCell>
        <SurveyTitle survey={survey} />
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 160, (survey) => (
      <RecordTableInlineCell>
        <StatusBadge status={survey.status} />
      </RecordTableInlineCell>
    )),
    column('channel', t('channel', 'Channel'), IconCircles, 180, (survey) => (
      <RecordTableInlineCell>
        <ChannelLabel id={survey.channelId} />
      </RecordTableInlineCell>
    )),
    column('question', t('survey-question', 'Question'), IconHelp, 280, (survey) => (
      <TextCell value={survey.steps[0]?.question ?? null} />
    )),
    column('voteCount', t('survey-votes', 'Votes'), IconUsers, 100, (survey) => (
      <RecordTableInlineCell>{survey.voteCount}</RecordTableInlineCell>
    )),
    column('sentCount', t('survey-sent', 'Sent'), IconSend, 100, (survey) => (
      <RecordTableInlineCell>{survey.sentCount}</RecordTableInlineCell>
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 200, (survey) => (
      <RecordTableInlineCell>
        <MemberLine id={survey.createdBy} />
      </RecordTableInlineCell>
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 140, (survey) => (
      <DateCell date={survey.updatedAt} />
    )),
  ];
};

/** The surveys as a table, a page at a time. */
export const SurveysTable = ({
  surveys,
  manage,
  paging,
  children,
}: {
  surveys: Survey[];
  /** Whether rows can be picked for the bulk bar (`children`). */
  manage: boolean;
  paging: Paging;
  children: ReactNode;
}) => (
  <RecordTable.Provider
    tableId="frontline_surveys"
    columns={useColumns(manage)}
    data={surveys}
    stickyColumns={['more', 'checkbox', 'title']}
    className="m-3"
  >
    <PagedRows paging={paging} count={surveys.length} />
    {children}
  </RecordTable.Provider>
);
