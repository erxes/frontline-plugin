import { IconMicrophone, IconPhone } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, IconTip, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { durationText } from '@/calls/queries.ts';
import { orpc } from '~/orpc.ts';
import { CALL_TYPE } from '~/plugin.ts';
import type { Conversation } from './queries.ts';

/**
 * A call conversation's call in its header: how long it lasted, and whether it has a recording.
 * It opens the call in core's side panel, beside the conversation, with its times, operator,
 * recording and Fetch recording, as the old inbox showed them under the call. A member who may
 * not see calls gets nothing.
 */
export const ConversationCall = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  const call = useQuery({
    ...orpc.calls.get.queryOptions({ input: { conversationId: conversation.id } }),
    enabled: conversation.kind === 'call' || conversation.kind === 'callpro',
    retry: false,
  }).data;

  if (!call) return null;

  const duration = durationText(call.durationSec);

  return (
    <IconTip label={t('open-call', 'Open the call')}>
      <Button
        variant="secondary"
        size="xs"
        className="shrink-0"
        aria-label={t('open-call', 'Open the call')}
        onClick={() => open({ contentType: CALL_TYPE, contentId: call.id })}
      >
        <IconPhone />
        {duration && <span className="tabular-nums">{duration}</span>}
        {call.recording && (
          <IconMicrophone aria-label={t('recording', 'Recording')} className="text-success" />
        )}
      </Button>
    </IconTip>
  );
};
