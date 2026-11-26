import { useTranslation } from 'react-i18next';
import type { Call } from './queries.ts';

/** A call's recording as a player, or why there is none yet. */
export const RecordingPlayer = ({ call }: { call: Pick<Call, 'recording' | 'recordingFile'> }) => {
  const { t } = useTranslation('frontline');

  if (call.recording)
    return (
      <audio
        controls
        preload="metadata"
        src={call.recording.url}
        className="w-full px-2"
        aria-label={call.recording.name}
      >
        <track kind="captions" />
      </audio>
    );

  return (
    <p className="px-2 text-xs text-muted-foreground">
      {call.recordingFile
        ? t('recording-copying', 'The PBX recorded this call; the copy is on its way.')
        : t('no-recording', 'No recording')}
    </p>
  );
};
