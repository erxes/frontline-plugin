import { IconChevronRight, IconMicrophone, IconPhone } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, IconTip, PanelSection, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { CALL_ICONS, CallStatus } from '@/calls/CallFields.tsx';
import { RecordingPlayer } from '@/calls/RecordingPlayer.tsx';
import { durationText, useCallsSignal } from '@/calls/queries.ts';
import { orpc } from '~/orpc.ts';
import { CALL_TYPE } from '~/plugin.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import type { Conversation } from './queries.ts';

/** A call conversation's call; none for any other kind, or for a member who may not see calls. */
const useConversationCall = (conversation: Conversation) => {
  useCallsSignal();

  return useQuery({
    ...orpc.calls.get.queryOptions({ input: { conversationId: conversation.id } }),
    enabled: conversation.kind === 'call' || conversation.kind === 'callpro',
    retry: false,
  }).data;
};

/**
 * A call conversation's call in its header: how long it lasted, and whether it has a recording.
 * It opens the call in core's side panel, beside the conversation, with its times, operator,
 * recording and Fetch recording, as the old inbox showed them under the call. A member who may
 * not see calls gets nothing.
 */
export const ConversationCall = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const call = useConversationCall(conversation);

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

/**
 * A call conversation's call in its side panel: its status and length, the recording to listen
 * to, and the call's own panel for the rest.
 */
export const ConversationCallSection = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const call = useConversationCall(conversation);

  if (!call) return null;

  return (
    <PanelSection title={t('call', 'Call')} icon={IconPhone}>
      <InfoRow icon={CALL_ICONS.status} label={t('status', 'Status')}>
        <CallStatus status={call.status} />
      </InfoRow>
      {call.durationSec !== null && (
        <InfoRow icon={CALL_ICONS.durationSec} label={t('duration', 'Duration')}>
          <span className="tabular-nums">{durationText(call.durationSec)}</span>
        </InfoRow>
      )}
      <RecordingPlayer call={call} />
      <button
        type="button"
        onClick={() => open({ contentType: CALL_TYPE, contentId: call.id })}
        className="flex h-8 w-full items-center justify-between rounded px-2 text-xs hover:bg-accent"
      >
        <span>{t('open-call', 'Open the call')}</span>
        <IconChevronRight className="size-4 text-muted-foreground" />
      </button>
    </PanelSection>
  );
};
