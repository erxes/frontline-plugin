import { contactQueries, memberQueries } from '@erxes/core-contract/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customerTitle,
  memberName,
  type TConditionGroup,
  type TConditionRule,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useCallStatusNames, useDirectionNames } from '@/calls/CallFields.tsx';
import { durationText } from '@/calls/queries.ts';
import { useStatusNames } from '@/inbox/InboxFilter.tsx';
import { usePriorityNames } from '@/pipelines/queries.ts';
import { orpc } from '~/orpc.ts';
import { CALL_TYPE, CONVERSATION_TYPE, TICKET_TYPE } from '~/plugin.ts';
import { useKindNames } from '~/shared/kinds.tsx';
import { between } from '~/shared/listPath.ts';
import { choicesQuery } from '~/shared/reference.ts';
import type { Records } from './cards.ts';

/** A list row's cell: text, or a member or a customer, shown and downloaded by name. */
export type Cell = string | { member: string | null } | { customer: string | null };

type Line = { id: string; cells: Cell[] };

export type Page = { lines: Line[]; nextCursor: string | null; totalCount?: number };

/** How many rows a page of the card shows, and how many an export asks for at a time. */
export const PAGE = 10;

/** The key every list card's pages are cached under. */
export const RECORDS_KEY = ['frontline', 'report-list'];
const EXPORT_PAGE = 50;

/** Whether a rule of `group`, at any depth, is on `path`. */
const names = (group: TConditionGroup | null, path: string): boolean =>
  group?.rules.some((part) => ('rules' in part ? names(part, path) : part.path === path)) ?? false;

/**
 * The list's filter: the card's, and the days of its period on the date the report counts by.
 * A conversation list shows every status and a ticket list archived tickets too, unless the
 * card's filter names them, as the report counts them all.
 */
export const listFilter = (
  records: Records,
  filter: TConditionGroup | null,
  range: { from: Date; to: Date },
  base: TConditionRule[] = [],
) => {
  const rules: TConditionGroup['rules'] = [
    ...base,
    ...between(records === 'calls' ? 'subject.startedAt' : 'subject.createdAt', range),
  ];

  if (records === 'conversations' && !names(filter, 'subject.status'))
    rules.push({ path: 'subject.status', op: 'in', value: ['new', 'open', 'resolved'] });

  if (records === 'tickets' && !names(filter, 'subject.state'))
    rules.push({ path: 'subject.state', op: 'in', value: ['active', 'archived'] });

  if (filter) rules.push(filter);

  return JSON.stringify({ match: 'all', rules });
};

/** The words a list's cells need. */
export const useListLabels = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return {
    t,
    date: (date: Date | null) => (date ? format.date(date, 'yyyy-MM-dd HH:mm') : ''),
    kinds: useKindNames(),
    conversationStatuses: useStatusNames(),
    priorities: usePriorityNames(),
    statuses: useQuery(choicesQuery).data?.statuses ?? [],
    callStatuses: useCallStatusNames(),
    directions: useDirectionNames(),
  };
};

type Labels = ReturnType<typeof useListLabels>;

/** Each list: its record type, its columns and a page of rows, from the list procedure. */
export const SOURCES = {
  conversations: {
    contentType: CONVERSATION_TYPE,
    heads: ({ t }: Labels) => [
      t('customer', 'Customer'),
      t('last-message', 'Last message'),
      t('channel', 'Channel'),
      t('source', 'Source'),
      t('status', 'Status'),
      t('assignee', 'Assignee'),
      t('created-at', 'Created at'),
    ],
    fetch: (filter: string, cursor: string | undefined, limit: number, labels: Labels) =>
      orpc.conversations.list.call({ filter, cursor, limit }).then((page) => ({
        ...page,
        lines: page.conversations.map((row) => ({
          id: row.id,
          cells: [
            { customer: row.customerId },
            row.content ?? '',
            row.channelName,
            labels.kinds[row.kind] ?? row.kind,
            labels.conversationStatuses[row.status],
            { member: row.assigneeId },
            labels.date(row.createdAt),
          ],
        })),
      })),
  },
  tickets: {
    contentType: TICKET_TYPE,
    heads: ({ t }: Labels) => [
      t('name', 'Name'),
      t('number', 'Number'),
      t('status', 'Status'),
      t('priority', 'Priority'),
      t('assignee', 'Assignee'),
      t('created-at', 'Created at'),
    ],
    fetch: (filter: string, cursor: string | undefined, limit: number, labels: Labels) =>
      orpc.tickets.list.call({ filter, cursor, limit, sort: 'createdAt' }).then((page) => ({
        ...page,
        lines: page.tickets.map((row) => ({
          id: row.id,
          cells: [
            row.name,
            row.number ?? '',
            labels.statuses.find((status) => status.id === row.statusId)?.name ?? '',
            labels.priorities[row.priority] ?? '',
            { member: row.assigneeId },
            labels.date(row.createdAt),
          ],
        })),
      })),
  },
  calls: {
    contentType: CALL_TYPE,
    heads: ({ t }: Labels) => [
      t('customer-phone', 'Customer phone'),
      t('direction', 'Direction'),
      t('status', 'Status'),
      t('answered-by', 'Answered by'),
      t('duration', 'Duration'),
      t('started-at', 'Started at'),
    ],
    fetch: (filter: string, cursor: string | undefined, limit: number, labels: Labels) =>
      orpc.calls.list.call({ filter, cursor, limit }).then((page) => ({
        ...page,
        lines: page.calls.map((row) => ({
          id: row.id,
          cells: [
            row.customerPhone,
            labels.directions[row.direction],
            labels.callStatuses[row.status],
            { member: row.answeredBy },
            durationText(row.durationSec),
            labels.date(row.startedAt),
          ],
        })),
      })),
  },
} satisfies Record<
  Records,
  {
    contentType: string;
    heads: (labels: Labels) => string[];
    fetch: (
      filter: string,
      cursor: string | undefined,
      limit: number,
      labels: Labels,
    ) => Promise<Page>;
  }
>;

/** The customer a cell names, if it names one. */
const customerIdOf = (cell: Cell) =>
  typeof cell === 'object' && 'customer' in cell ? cell.customer : null;

/** Every row of the list under `filter`, as text for a CSV, `EXPORT_PAGE` at a time, members by name. */
export const useExportRecords = (records: Records) => {
  const labels = useListLabels();
  const queryClient = useQueryClient();
  const source = SOURCES[records];

  return async (filter: string) => {
    const team = await queryClient.query(memberQueries.team);
    const members = new Map(team.data.map((member) => [member.id, memberName(member)]));
    const rows: string[][] = [];
    let cursor: string | undefined;

    do {
      const page = await source.fetch(filter, cursor, EXPORT_PAGE, labels);
      const cells = page.lines.flatMap((line) => line.cells);
      const customerIds = new Set(cells.flatMap((cell) => customerIdOf(cell) ?? []));

      const customers = new Map(
        await Promise.all(
          [...customerIds].map(async (id) => {
            const customer = await queryClient.query(contactQueries.customer(id));

            return [id, customerTitle(customer)] as const;
          }),
        ),
      );

      const text = (cell: Cell) => {
        if (typeof cell === 'string') return cell;

        if ('member' in cell) return cell.member ? (members.get(cell.member) ?? cell.member) : '';

        return (cell.customer && customers.get(cell.customer)) || labels.t('visitor', 'Visitor');
      };

      rows.push(...page.lines.map((line) => line.cells.map(text)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return { heads: source.heads(labels), rows };
  };
};
