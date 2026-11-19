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
import { useQuery } from '@tanstack/react-query';
import { Button, Select, cn } from 'erxes-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { durationText, useCallsSignal } from '@/calls/queries.ts';
import { orpc } from '~/orpc.ts';
import { CallNote, Transfer } from './CallTools.tsx';
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

/** The call the phone is on: who, how long, and what the member can do with it. */
const OnCall = ({ phone, call, line }: { phone: Phone; call: PhoneCall; line: Line }) => {
  const { t } = useTranslation('frontline');
  const [tool, setTool] = useState<'keys' | 'transfer' | null>(null);
  const ringing = call.direction === 'incoming' && !call.talking;

  const toggle = (next: 'keys' | 'transfer') => setTool(tool === next ? null : next);

  return (
    <div className="flex flex-col gap-4">
      <div className="py-4 text-center">
        <div className="text-2xl font-semibold tabular-nums">{call.number}</div>
        <div className="text-sm text-muted-foreground tabular-nums">{useCallText(call)}</div>
      </div>
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

/** The call's conversation, once the PBX has reported the call, for its note. */
const useCallConversation = (line: Line, talking: boolean) => {
  useCallsSignal();

  const current = useQuery({
    ...orpc.calls.phone.current.queryOptions({ input: { accountId: line.accountId } }),
    enabled: talking,
  });

  return current.data ?? null;
};

/**
 * The Phone page's phone: the line and whether it's signed in, then the dial pad, or the call
 * with its tools and, once the PBX reports it, its note.
 */
export const PhonePanel = ({
  live: { phone, line, lines, pickLine, closedNote, closeNote },
}: {
  live: LivePhone;
}) => {
  const { t } = useTranslation('frontline');
  const current = useCallConversation(line, Boolean(phone.call?.talking));
  const note = current && current.id !== closedNote ? current : null;

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
      className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-background p-4 shadow-xs"
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
        <OnCall phone={phone} call={phone.call} line={line} />
      ) : (
        <Dialer ready={phone.status === 'ready'} onDial={phone.dial} />
      )}
      {note && (
        <CallNote
          key={note.id}
          conversationId={note.conversationId}
          onClose={() => closeNote(note.id)}
        />
      )}
    </section>
  );
};
