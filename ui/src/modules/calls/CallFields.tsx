import {
  IconArrowsExchange,
  IconCalendarBolt,
  IconCircles,
  IconClock,
  IconHash,
  IconPhone,
  IconPhoneCall,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconProgressCheck,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Badge, type BadgeProps, type TListFilterField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { channelsQuery } from '~/shared/reference.ts';
import type { Call } from './queries.ts';

type Status = Call['status'];

const BADGES: Record<Status, BadgeProps['variant']> = {
  ringing: 'info',
  active: 'info',
  answered: 'success',
  missed: 'destructive',
  busy: 'warning',
  failed: 'destructive',
  voicemail: 'secondary',
};

/** Each call status's name. */
export const useCallStatusNames = (): Record<Status, string> => {
  const { t } = useTranslation('frontline');

  return {
    ringing: t('call-ringing', 'Ringing'),
    active: t('call-active', 'On the line'),
    answered: t('call-answered', 'Answered'),
    missed: t('call-missed', 'Missed'),
    busy: t('call-busy', 'Busy'),
    failed: t('call-failed', 'Failed'),
    voicemail: t('call-voicemail', 'Voicemail'),
  };
};

/** Each direction's name. */
export const useDirectionNames = (): Record<Call['direction'], string> => {
  const { t } = useTranslation('frontline');

  return {
    incoming: t('call-incoming', 'Incoming'),
    outgoing: t('call-outgoing', 'Outgoing'),
  };
};

/** The queue by its name from settings with its PBX number after it, or the number alone. */
export const queueLabel = (call: Pick<Call, 'queue' | 'queueName'>) =>
  call.queue && call.queueName ? `${call.queueName} · ${call.queue}` : call.queue;

export const CallStatus = ({ status }: { status: Status }) => (
  <Badge variant={BADGES[status]}>{useCallStatusNames()[status]}</Badge>
);

/** The call's direction as its icon, named for screen readers. */
export const DirectionIcon = ({ direction }: { direction: Call['direction'] }) => {
  const Icon = direction === 'incoming' ? IconPhoneIncoming : IconPhoneOutgoing;

  return <Icon className="size-4 shrink-0" aria-label={useDirectionNames()[direction]} />;
};

/** One icon per call field, the same in the table, the filter and the panel. */
export const CALL_ICONS = {
  customerPhone: IconPhone,
  status: IconProgressCheck,
  direction: IconArrowsExchange,
  number: IconPhoneCall,
  queue: IconUsersGroup,
  extension: IconHash,
  answeredBy: IconUser,
  startedAt: IconCalendarBolt,
  durationSec: IconClock,
};

/** Every field the call history narrows by, on the API's `subject.<column>` paths. */
export const useCallFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const statuses = useCallStatusNames();
  const directions = useDirectionNames();
  const channels = useQuery(channelsQuery).data?.channels ?? [];

  return [
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
    {
      path: 'subject.status',
      label: t('status', 'Status'),
      type: 'select',
      icon: CALL_ICONS.status,
      options: Object.entries(statuses).map(([value, label]) => ({ value, label })),
    },
    {
      path: 'subject.direction',
      label: t('direction', 'Direction'),
      type: 'select',
      icon: CALL_ICONS.direction,
      options: Object.entries(directions).map(([value, label]) => ({ value, label })),
    },
    {
      path: 'subject.customerPhone',
      label: t('customer-phone', 'Customer phone'),
      type: 'text',
      icon: CALL_ICONS.customerPhone,
    },
    {
      path: 'subject.number',
      label: t('line', 'Line'),
      type: 'text',
      icon: CALL_ICONS.number,
    },
    { path: 'subject.queue', label: t('queue', 'Queue'), type: 'text', icon: CALL_ICONS.queue },
    {
      path: 'subject.extension',
      label: t('extension', 'Extension'),
      type: 'text',
      icon: CALL_ICONS.extension,
    },
    {
      path: 'subject.answeredBy',
      label: t('answered-by', 'Answered by'),
      type: 'member',
      icon: CALL_ICONS.answeredBy,
    },
    {
      path: 'subject.startedAt',
      label: t('started-at', 'Started at'),
      type: 'date',
      icon: CALL_ICONS.startedAt,
    },
    {
      path: 'subject.durationSec',
      label: t('duration-seconds', 'Duration (seconds)'),
      type: 'number',
      icon: CALL_ICONS.durationSec,
    },
  ];
};
