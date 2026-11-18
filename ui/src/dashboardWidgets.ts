import { IconMessageCircle, IconPhone, IconTicket } from '@tabler/icons-react';
import type { TDashboardWidget } from 'erxes-ui';
import { lazy } from 'react';
import { withText } from '~/i18n/withText.ts';

// `./config` imports this, so like it, it holds only icons, names and lazy slots. A tile's icon
// says what it counts, the preview how it draws, so three icons, which `./config` has anyway.
const reports = withText(() => import('@/reports/tiles.ts'));

/** A report tile whose body is the `TILES` entry of its name; core draws its frame and title. */
const tile = ({
  wide,
  ...widget
}: Omit<TDashboardWidget, 'component' | 'size'> & {
  name: keyof Awaited<ReturnType<typeof reports>>['TILES'];
  wide?: boolean;
}): TDashboardWidget => ({
  ...widget,
  size: wide ? { w: 12, h: 4 } : { w: 6, h: 7 },
  component: lazy(async () => ({ default: (await reports()).TILES[widget.name] })),
});

/**
 * The tiles core's home dashboard offers under Frontline. Each picks its own period, 7, 30 or 90
 * days, and a ticket tile its pipeline, kept in the browser; it counts what the member's
 * channels hold. A tile's `name` is saved in members'
 * layouts, so renaming one drops it from their dashboards.
 */
export const DASHBOARD_WIDGETS = [
  tile({
    name: 'ticket-summary',
    title: 'Ticket summary',
    description: 'Created, resolved, open and overdue tickets',
    icon: IconTicket,
    preview: 'kpi',
    wide: true,
  }),
  tile({
    name: 'tickets-over-time',
    title: 'Tickets over time',
    description: 'Tickets created and resolved each day',
    icon: IconTicket,
    preview: 'area',
  }),
  tile({
    name: 'tickets-by-stage',
    title: 'Tickets by status',
    description: 'New tickets by status',
    icon: IconTicket,
    preview: 'bar',
  }),
  tile({
    name: 'tickets-by-priority',
    title: 'Tickets by priority',
    description: 'New tickets by priority',
    icon: IconTicket,
    preview: 'bar',
  }),
  tile({
    name: 'tickets-by-tag',
    title: 'Tickets by tag',
    description: 'The tags on new tickets',
    icon: IconTicket,
    preview: 'bar',
  }),
  tile({
    name: 'ticket-sla',
    title: 'Ticket SLA',
    description: 'SLAs met, missed and overdue',
    icon: IconTicket,
    preview: 'table',
  }),
  tile({
    name: 'tickets-by-assignee',
    title: 'Open tickets by assignee',
    description: 'Who holds open tickets',
    icon: IconTicket,
    preview: 'table',
  }),
  tile({
    name: 'conversation-summary',
    title: 'Conversation summary',
    description: 'Started, resolved and open conversations, and response times',
    icon: IconMessageCircle,
    preview: 'kpi',
    wide: true,
  }),
  tile({
    name: 'conversations-over-time',
    title: 'Conversations over time',
    description: 'Conversations started and resolved each day',
    icon: IconMessageCircle,
    preview: 'area',
  }),
  tile({
    name: 'conversations-by-source',
    title: 'Conversations by source',
    description: 'Conversations by the integration they came through',
    icon: IconMessageCircle,
    preview: 'bar',
  }),
  tile({
    name: 'conversations-by-tag',
    title: 'Conversations by tag',
    description: 'The tags on new conversations',
    icon: IconMessageCircle,
    preview: 'bar',
  }),
  tile({
    name: 'conversation-responders',
    title: 'Top responders',
    description: 'Members who replied to customers the most',
    icon: IconMessageCircle,
    preview: 'table',
  }),
  tile({
    name: 'meta-summary',
    title: 'Facebook and Instagram summary',
    description: 'Conversations, messages by sender, bot share, comments and posts',
    icon: IconMessageCircle,
    preview: 'kpi',
    wide: true,
  }),
  tile({
    name: 'meta-over-time',
    title: 'Facebook and Instagram over time',
    description: 'Conversations, messages and comments each day',
    icon: IconMessageCircle,
    preview: 'area',
  }),
  tile({
    name: 'call-summary',
    title: 'Call summary',
    description: 'Calls answered and missed, service level, wait and talk time',
    icon: IconPhone,
    preview: 'kpi',
    wide: true,
  }),
  tile({
    name: 'call-volume',
    title: 'Call volume',
    description: 'Incoming, outgoing and missed calls each day',
    icon: IconPhone,
    preview: 'area',
  }),
  tile({
    name: 'call-heatmap',
    title: 'Calls by hour',
    description: 'When calls come, by weekday and hour',
    icon: IconPhone,
    preview: 'heatmap',
  }),
  tile({
    name: 'call-agents',
    title: 'Top agents',
    description: 'Members who answered the most calls',
    icon: IconPhone,
    preview: 'table',
  }),
  tile({
    name: 'call-queues',
    title: 'Calls by queue',
    description: 'Each queue’s calls, answers, misses and wait',
    icon: IconPhone,
    preview: 'table',
  }),
  tile({
    name: 'call-numbers',
    title: 'Top numbers',
    description: 'The numbers that called or were called the most',
    icon: IconPhone,
    preview: 'table',
  }),
];
