import {
  IconArrowForwardUp,
  IconDialpad,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneOff,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { Button, Select, cn } from 'erxes-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { durationText } from '@/calls/queries.ts';
import { PersonAvatar } from '~/shared/Person.tsx';
import { CallerContext } from './CallerContext.tsx';
import { CallNote, Transfer } from './CallTools.tsx';
import type { CurrentCall } from './current.ts';
import { DialPad, Dialer } from './DialPad.tsx';
import type { LivePhone } from './live.ts';
import type { Line, Phone, PhoneCall, PhoneStatus } from './useSip.ts';

/** Seconds since `since`, ticking while it is set. */
const useSeconds = (since: Date | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [since]);

  return since ? Math.max(0, (now - since.getTime()) / 1000) : null;
};

export const StatusDot = ({ status }: { status: PhoneStatus }) => (
  <span
    className={cn(
      'size-2 shrink-0 rounded-full',
      status === 'ready' && 'bg-success',
      status === 'connecting' && 'bg-warning',
      status === 'offline' && 'bg-destructive',
    )}
  />
);

/** What the call is doing: ringing, calling, or how long it has lasted. */
export const useCallText = (call: PhoneCall) => {
  const { t } = useTranslation('frontline');
  const seconds = useSeconds(call.since);

  if (call.talking) return durationText(seconds);

  return call.direction === 'incoming'
    ? t('incoming-call', 'Incoming call')
    : t('calling', 'Calling');
};

/** Who the phone is on a call with, by name when core has one, and how long it has lasted. */
const OnCallHeading = ({ call, caller }: { call: PhoneCall; caller: string | null }) => (
  <div className="flex flex-col items-center py-4 text-center">
    {caller && <PersonAvatar name={caller} className="mb-2" />}
    <div className="max-w-full truncate text-2xl font-semibold tabular-nums">
      {caller ?? call.number}
    </div>
    {caller && <div className="text-sm text-muted-foreground tabular-nums">{call.number}</div>}
    <div className="text-sm text-muted-foreground tabular-nums">{useCallText(call)}</div>
  </div>
);

/** The call the phone is on: who, how long, and what the member can do with it. */
const OnCall = ({
  phone,
  call,
  line,
  caller,
  current,
}: {
  phone: Phone;
  call: PhoneCall;
  line: Line;
  caller: string | null;
  current: CurrentCall;
}) => {
  const { t } = useTranslation('frontline');
  const [tool, setTool] = useState<'keys' | 'transfer' | null>(null);
  const ringing = call.direction === 'incoming' && !call.talking;

  const toggle = (next: 'keys' | 'transfer') => setTool(tool === next ? null : next);

  return (
    <div className="flex flex-col gap-4">
      <OnCallHeading call={call} caller={caller} />
      {current && <CallerContext call={current} />}
      {call.talking ? (
        <div className="grid grid-cols-4 gap-1">
          <Button
            variant={call.muted ? 'default' : 'secondary'}
            aria-pressed={call.muted}
            aria-label={t('mute', 'Mute')}
            onClick={phone.toggleMute}
          >
            {call.muted ? <IconMicrophoneOff /> : <IconMicrophone />}
          </Button>
          <Button
            variant={call.held ? 'default' : 'secondary'}
            aria-pressed={call.held}
            aria-label={t('hold', 'Hold')}
            onClick={phone.toggleHold}
          >
            {call.held ? <IconPlayerPlay /> : <IconPlayerPause />}
          </Button>
          <Button
            variant={tool === 'keys' ? 'default' : 'secondary'}
            aria-pressed={tool === 'keys'}
            aria-label={t('keypad', 'Keypad')}
            onClick={() => toggle('keys')}
          >
            <IconDialpad />
          </Button>
          <Button
            variant={tool === 'transfer' ? 'default' : 'secondary'}
            aria-pressed={tool === 'transfer'}
            aria-label={t('transfer', 'Transfer')}
            onClick={() => toggle('transfer')}
          >
            <IconArrowForwardUp />
          </Button>
        </div>
      ) : null}
      {tool === 'keys' && <DialPad onPress={phone.press} />}
      {tool === 'transfer' && <Transfer accountId={line.accountId} onDone={() => setTool(null)} />}
      <div className="flex gap-2">
        {ringing && (
          <Button className="flex-1" onClick={phone.answer}>
            <IconPhone />
            {t('answer', 'Answer')}
          </Button>
        )}
        <Button variant="destructive" className="flex-1" onClick={phone.hangUp}>
          <IconPhoneOff />
          {ringing ? t('decline', 'Decline') : t('hang-up', 'Hang up')}
        </Button>
      </div>
    </div>
  );
};

/**
 * The Phone page's phone: the line and whether it's signed in, then the dial pad, or the call
 * with its tools and, once the PBX reports it, its note.
 */
export const PhonePanel = ({
  live: { phone, line, lines, pickLine, current, caller, closedNote, closeNote },
}: {
  live: LivePhone;
}) => {
  const { t } = useTranslation('frontline');
  // The note comes with the talking, and stays after the call until the member closes it.
  const talkedTo = !phone.call || phone.call.talking;
  const note = current && talkedTo && current.id !== closedNote ? current : null;

  const statusText: Record<PhoneStatus, string> = {
    connecting: t('phone-connecting', 'Connecting'),
    ready: t('phone-ready', 'Ready'),
    offline: t('phone-offline', 'Offline'),
  };

  const lineName = ({ name, extension }: Line) =>
    t('phone-line-name', '{{name}}, ext. {{extension}}', { name, extension });

  return (
    <section
      aria-label={t('softphone', 'Phone')}
      className="mx-auto mt-8 flex w-full max-w-md flex-col gap-4 rounded-lg border bg-background p-5"
    >
      <div className="flex items-center justify-between gap-2">
        {lines.length > 1 ? (
          <Select value={line.accountId} onValueChange={(next) => next && pickLine(next)}>
            <Select.Trigger aria-label={t('phone-line', 'Line')}>
              <Select.Value>{() => lineName(line)}</Select.Value>
            </Select.Trigger>
            <Select.Content>
              {lines.map((other) => (
                <Select.Item key={other.accountId} value={other.accountId}>
                  {lineName(other)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : (
          <p className="text-sm font-medium">{lineName(line)}</p>
        )}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot status={phone.status} />
          {statusText[phone.status]}
        </span>
      </div>
      {phone.call ? (
        <OnCall phone={phone} call={phone.call} line={line} caller={caller} current={current} />
      ) : (
        <Dialer ready={phone.status === 'ready'} onDial={phone.dial} />
      )}
      {note && (
        <CallNote
          key={note.id}
          conversationId={note.conversationId}
          customerId={note.customerId}
          customerPhone={note.customerPhone}
          onClose={() => closeNote(note.id)}
        />
      )}
    </section>
  );
};
