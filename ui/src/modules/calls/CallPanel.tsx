import {
  IconCalendarCheck,
  IconCalendarX,
  IconDots,
  IconDownload,
  IconMessage,
  IconMicrophone,
  IconUserCircle,
} from '@tabler/icons-react';
import {
  Button,
  PanelField,
  PanelSection,
  Skeleton,
  toast,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { conversationPath } from '~/plugin.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import { CALL_ICONS, CallStatus, queueLabel, useDirectionNames } from './CallFields.tsx';
import { type Call, durationText, useCall, useFetchRecording } from './queries.ts';
import { InfoRow, PanelSkeleton } from '~/shared/Panel.tsx';
import { ContactChip, MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: who called, or who was called. */
export const CallTitle = ({ contentId }: TRecordSlotProps) => {
  const call = useCall(contentId);

  if (call.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{call.data?.customerPhone ?? call.error?.message}</span>;
};

/** The header's menu: ask the PBX again for an answered call's recording. */
export const CallActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const call = useCall(contentId).data;
  const fetch = useFetchRecording();

  if (call?.provider !== 'call' || call.status !== 'answered' || call.recording) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('call-menu', 'Call actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'fetch-recording',
          icon: <IconDownload />,
          label: t('fetch-recording', 'Fetch recording'),
          onSelect: () =>
            fetch.mutate(
              { id: contentId },
              {
                onSuccess: () =>
                  toast({ title: t('recording-requested', 'Asked the PBX for the recording') }),
              },
            ),
        },
      ]}
    />
  );
};

const Fields = ({ call }: { call: Call }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const directions = useDirectionNames();

  return (
    <PanelSection title={t('call', 'Call')}>
      <InfoRow icon={CALL_ICONS.status} label={t('status', 'Status')}>
        <CallStatus status={call.status} />
      </InfoRow>
      <InfoRow icon={CALL_ICONS.direction} label={t('direction', 'Direction')}>
        {directions[call.direction]}
      </InfoRow>
      <PanelField icon={IconUserCircle} label={t('customer', 'Customer')} cell={false}>
        <ContactChip contentId={call.customerId} placeholder={call.customerPhone} />
      </PanelField>
      <InfoRow icon={CALL_ICONS.customerPhone} label={t('customer-phone', 'Customer phone')}>
        {call.customerPhone}
      </InfoRow>
      <InfoRow icon={CALL_ICONS.number} label={t('line', 'Line')}>
        {call.number}
      </InfoRow>
      <InfoRow icon={CALL_ICONS.queue} label={t('queue', 'Queue')}>
        {queueLabel(call)}
      </InfoRow>
      <InfoRow icon={CALL_ICONS.extension} label={t('extension', 'Extension')}>
        {call.extension}
      </InfoRow>
      <InfoRow icon={CALL_ICONS.answeredBy} label={t('answered-by', 'Answered by')}>
        <MemberChip id={call.answeredBy} />
      </InfoRow>
      <InfoRow icon={CALL_ICONS.startedAt} label={t('started-at', 'Started at')}>
        {format.dateTime(call.startedAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarCheck} label={t('answered-at', 'Answered at')}>
        {call.answeredAt && format.dateTime(call.answeredAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarX} label={t('ended-at', 'Ended at')}>
        {call.endedAt && format.dateTime(call.endedAt)}
      </InfoRow>
      <InfoRow icon={CALL_ICONS.durationSec} label={t('duration', 'Duration')}>
        {durationText(call.durationSec)}
      </InfoRow>
      <PanelField icon={IconMessage} label={t('conversation', 'Conversation')} cell={false}>
        <Link
          to={conversationPath(call.conversationId)}
          className="truncate px-2 text-xs underline-offset-2 hover:underline"
        >
          {t('open-in-inbox', 'Open in inbox')}
        </Link>
      </PanelField>
    </PanelSection>
  );
};

/** The recording as a player, or why there is none yet. */
const Recording = ({ call }: { call: Call }) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelSection title={t('recording', 'Recording')} icon={IconMicrophone}>
      {call.recording ? (
        <audio
          controls
          src={call.recording.url}
          className="w-full px-2"
          aria-label={call.recording.name}
        >
          <track kind="captions" />
        </audio>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">
          {call.recordingFile
            ? t('recording-copying', 'The PBX recorded this call; the copy is on its way.')
            : t('no-recording', 'No recording')}
        </p>
      )}
    </PanelSection>
  );
};

/** The Detail tab: the call's fields and its recording. */
export const CallDetail = ({ contentId }: TRecordSlotProps) => {
  const call = useCall(contentId);

  if (call.isPending) return <PanelSkeleton />;

  if (call.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {call.error.message}
      </p>
    );

  return (
    <>
      <Fields call={call.data} />
      <Recording call={call.data} />
    </>
  );
};
