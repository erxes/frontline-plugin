import {
  IconCircleDot,
  IconClockHour4,
  IconGitBranch,
  IconLock,
  IconMessageReply,
  IconPlugConnected,
  IconUsers,
} from '@tabler/icons-react';
import type { TRecordTab } from 'erxes-ui';
import { lazy } from 'react';
import { withText } from '~/i18n/withText.ts';

// Record types' own panel tabs. `./config` loads this on every page, so it holds only icons and
// lazy tabs.

const channel = withText(() => import('@/channels/slots.ts'));
const pipeline = withText(() => import('@/pipelines/slots.ts'));

/**
 * A channel's panel tabs after Detail. A channel is where conversations come in and turn into
 * tickets, so its tabs are what it takes in and works with, not an activity feed or notes.
 */
export const CHANNEL_TABS: TRecordTab[] = [
  {
    value: 'integrations',
    label: 'Integrations',
    icon: IconPlugConnected,
    component: lazy(async () => ({ default: (await channel()).IntegrationsTab })),
  },
  {
    value: 'pipelines',
    label: 'Ticket pipelines',
    icon: IconGitBranch,
    component: lazy(async () => ({ default: (await channel()).PipelinesTab })),
  },
  {
    value: 'members',
    label: 'Members',
    icon: IconUsers,
    component: lazy(async () => ({ default: (await channel()).MembersTab })),
  },
  {
    value: 'templates',
    label: 'Response templates',
    icon: IconMessageReply,
    component: lazy(async () => ({ default: (await channel()).TemplatesTab })),
  },
];

/** A pipeline's panel tabs after Detail: its statuses, SLA and who may work its tickets. */
export const PIPELINE_TABS: TRecordTab[] = [
  {
    value: 'statuses',
    label: 'Ticket statuses',
    icon: IconCircleDot,
    component: lazy(async () => ({ default: (await pipeline()).PipelineStatuses })),
  },
  {
    value: 'sla',
    label: 'SLA',
    icon: IconClockHour4,
    component: lazy(async () => ({ default: (await pipeline()).PipelineSla })),
  },
  {
    value: 'permissions',
    label: 'Permissions',
    icon: IconLock,
    component: lazy(async () => ({ default: (await pipeline()).PipelinePermissions })),
  },
];
