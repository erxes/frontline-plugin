import {
  IconAlarm,
  IconAlertSquareRounded,
  IconArchive,
  IconCalendarBolt,
  IconCalendarClock,
  IconCalendarPlus,
  IconCalendarUp,
  IconCalendarX,
  IconCheck,
  IconBuildingStore,
  IconCircles,
  IconClockCheck,
  IconEye,
  IconGitBranch,
  IconHash,
  IconLetterCase,
  IconProgressCheck,
  IconSortAscending,
  IconSitemap,
  IconSortDescending,
  IconTag,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { Button, type TListFilterField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';
import { PRIORITIES, usePriorityNames } from '@/pipelines/queries.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import { useTeams } from './TicketLinks.tsx';
import { useChoices, useSlaNames, useTicketSort } from './queries.ts';

/** The fields that pick from the member's channels, pipelines and statuses. */
const useFilingFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const channels = useChannels().data?.channels ?? [];
  const { pipelines, statuses } = useChoices();
  const pipelineName = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));

  return [
    {
      path: 'subject.statusId',
      label: t('status', 'Status'),
      type: 'select',
      icon: IconProgressCheck,
      options: statuses.map((status) => ({
        value: status.id,
        label:
          pipelines.length > 1
            ? `${pipelineName.get(status.pipelineId) ?? ''} › ${status.name}`
            : status.name,
      })),
    },
    {
      path: 'subject.pipelineId',
      label: t('pipeline', 'Pipeline'),
      type: 'select',
      icon: IconGitBranch,
      options: pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name })),
    },
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
  ];
};

const teamOptions = (rows: { id: string; name: string }[]) =>
  rows.map((row) => ({ value: row.id, label: row.name }));

/** Who works or follows the ticket, its tags, branch and department. */
const useLinkFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      path: 'subject.assignedMemberIds',
      label: t('assigned-members', 'Assigned members'),
      type: 'member',
      icon: IconUsers,
    },
    {
      path: 'subject.subscribedUserIds',
      label: t('followers', 'Followers'),
      type: 'member',
      icon: IconEye,
    },
    { path: 'subject.tagIds', label: t('tags', 'Tags'), type: 'tags', icon: IconTag },
    {
      path: 'subject.branchId',
      label: t('branch', 'Branch'),
      type: 'select',
      icon: IconBuildingStore,
      options: teamOptions(useTeams('branch')),
    },
    {
      path: 'subject.departmentId',
      label: t('department', 'Department'),
      type: 'select',
      icon: IconSitemap,
      options: teamOptions(useTeams('department')),
    },
  ];
};

/** A date field on the ticket's `name` column. */
const dateField = (
  name: string,
  label: string,
  icon: TListFilterField['icon'],
): TListFilterField => ({ path: `subject.${name}`, label, type: 'date', icon });

/** The dates a ticket carries. */
const useDateFields = () => {
  const { t } = useTranslation('frontline');

  return [
    dateField('createdAt', t('created-at', 'Created at'), IconCalendarPlus),
    dateField('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp),
    dateField('startDate', t('start-date', 'Start date'), IconCalendarBolt),
    dateField('targetDate', t('target-date', 'Target date'), IconCalendarX),
    dateField('statusChangedAt', t('status-changed-at', 'Status changed'), IconCalendarClock),
  ];
};

/**
 * Every field the tickets list narrows by, as the old page's filters had them; the API applies
 * them (`api/src/modules/tickets/tickets.ts`). A status reads with its pipeline's name when the
 * member sees several pipelines.
 */
export const useTicketFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();
  const sla = useSlaNames();
  const slaOptions = Object.entries(sla).map(([value, label]) => ({ value, label }));

  return [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
    { path: 'subject.number', label: t('number', 'Number'), type: 'text', icon: IconHash },
    ...useFilingFields(),
    {
      path: 'subject.priority',
      label: t('priority', 'Priority'),
      type: 'select',
      icon: IconAlertSquareRounded,
      options: PRIORITIES.map((priority) => ({
        value: String(priority),
        label: priorities[priority] ?? '',
      })),
    },
    {
      path: 'subject.assigneeId',
      label: t('assignee', 'Assignee'),
      type: 'member',
      icon: IconUser,
    },
    ...useLinkFields(),
    {
      path: 'subject.state',
      label: t('state', 'State'),
      type: 'select',
      icon: IconArchive,
      options: [
        { value: 'active', label: t('active', 'Active') },
        { value: 'archived', label: t('archived', 'Archived') },
      ],
    },
    {
      path: 'subject.firstResponseSla',
      label: t('first-response-sla', 'First response SLA'),
      type: 'select',
      icon: IconAlarm,
      options: slaOptions,
    },
    {
      path: 'subject.resolutionSla',
      label: t('resolution-sla', 'Resolution SLA'),
      type: 'select',
      icon: IconClockCheck,
      options: slaOptions,
    },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    ...useDateFields(),
  ];
};

/** A menu row's mark: a check when it is the current choice. */
const check = (on: boolean) => (on ? <IconCheck /> : <span className="size-4" />);

/**
 * "Sort" in the list's bar, beside Display: by the last change or creation, newest or oldest
 * first, kept in the address with the filter. erxes-ui's bar has no sort of its own.
 */
export const SortMenu = () => {
  const { t } = useTranslation('frontline');
  const [{ sort, direction }, setSort] = useTicketSort();

  const fields = {
    updatedAt: t('updated-at', 'Updated at'),
    createdAt: t('created-at', 'Created at'),
  } as const;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost">
          {direction === 'asc' ? <IconSortAscending /> : <IconSortDescending />}
          {t('sort-by-field', 'Sort: {{field}}', { field: fields[sort] })}
        </Button>
      }
      actions={[
        ...(['updatedAt', 'createdAt'] as const).map((value) => ({
          value,
          icon: check(sort === value),
          label: fields[value],
          onSelect: () => void setSort({ sort: value }),
        })),
        {
          value: 'desc',
          icon: check(direction === 'desc'),
          label: t('newest-first', 'Newest first'),
          onSelect: () => void setSort({ direction: 'desc' }),
        },
        {
          value: 'asc',
          icon: check(direction === 'asc'),
          label: t('oldest-first', 'Oldest first'),
          onSelect: () => void setSort({ direction: 'asc' }),
        },
      ]}
    />
  );
};
