import { IconArrowsSplit } from '@tabler/icons-react';
import { PanelField, PanelSection, Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';
import type { Queue } from './PbxLines.tsx';

/** The pick that keeps a queue's calls in the account's own channel. */
const OWN = 'own';

/**
 * Where each queue's calls go: the account's own channel, or another one the member is an admin
 * of, as when one number's phone menu leads to each branch's queue.
 */
export const QueueChannels = ({
  queues,
  onChange,
}: {
  queues: Queue[];
  onChange: (queues: Queue[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const all = useChannels().data?.channels ?? [];

  if (queues.length === 0) return null;

  const pick = (queue: string, channelId: string) =>
    onChange(
      queues.map((each) =>
        each.queue === queue ? { ...each, channelId: channelId === OWN ? null : channelId } : each,
      ),
    );

  return (
    <PanelSection title={t('queue-channels', 'Queue channels')} icon={IconArrowsSplit}>
      {queues.map((queue) => (
        <PanelField key={queue.queue} label={queue.queue} cell={false}>
          <Select
            value={queue.channelId ?? OWN}
            onValueChange={(next) => typeof next === 'string' && pick(queue.queue, next)}
          >
            <Select.Trigger
              aria-label={t('queue-channel', 'Channel of queue {{queue}}', { queue: queue.queue })}
            >
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={OWN}>{t('account-channel', "The account's channel")}</Select.Item>
              {all
                .filter((channel) => channel.canManage || channel.id === queue.channelId)
                .map((channel) => (
                  <Select.Item key={channel.id} value={channel.id}>
                    {channel.name}
                  </Select.Item>
                ))}
            </Select.Content>
          </Select>
        </PanelField>
      ))}
    </PanelSection>
  );
};
