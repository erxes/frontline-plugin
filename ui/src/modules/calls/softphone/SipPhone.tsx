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
import { addPluginStyles, Button, Select, cn } from 'erxes-ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { durationText, useCallsSignal } from '@/calls/queries.ts';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { CallNote, Transfer } from './CallTools.tsx';
import { DialPad, Dialer } from './DialPad.tsx';
import css from './styles.css?inline';
import { type Line, type Phone, type PhoneCall, type PhoneStatus, useSip } from './useSip.ts';

// The phone shows on pages the plugin's stylesheet never loads on.
addPluginStyles(`${PLUGIN}:softphone`, css);

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

const StatusDot = ({ status }: { status: PhoneStatus }) => (
  <span
    className={cn(
      'size-2 rounded-full',
      status === 'ready' && 'bg-success',
      status === 'connecting' && 'bg-warning',
      status === 'offline' && 'bg-destructive',
    )}
  />
);

/** The call the phone is on: who, how long, and what the member can do with it. */
const OnCall = ({ phone, call, line }: { phone: Phone; call: PhoneCall; line: Line }) => {
  const { t } = useTranslation('frontline');
  const [tool, setTool] = useState<'keys' | 'transfer' | null>(null);
  const seconds = useSeconds(call.since);
  const incoming = call.direction === 'incoming';

  const toggle = (next: 'keys' | 'transfer') => setTool(tool === next ? null : next);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <div className="text-lg font-semibold">{call.number}</div>
        <div className="text-sm text-muted-foreground">
          {call.talking
            ? durationText(seconds)
            : incoming
              ? t('incoming-call', 'Incoming call')
              : t('calling', 'Calling')}
        </div>
      </div>
      {call.talking ? (
        <div className="grid grid-cols-4 gap-1">
          <Button
            variant={call.muted ? 'default' : 'secondary'}
            size="icon"
            aria-pressed={call.muted}
            aria-label={t('mute', 'Mute')}
            onClick={phone.toggleMute}
          >
            {call.muted ? <IconMicrophoneOff /> : <IconMicrophone />}
          </Button>
          <Button
            variant={call.held ? 'default' : 'secondary'}
            size="icon"
            aria-pressed={call.held}
            aria-label={t('hold', 'Hold')}
            onClick={phone.toggleHold}
          >
            {call.held ? <IconPlayerPlay /> : <IconPlayerPause />}
          </Button>
          <Button
            variant={tool === 'keys' ? 'default' : 'secondary'}
            size="icon"
            aria-pressed={tool === 'keys'}
            aria-label={t('keypad', 'Keypad')}
            onClick={() => toggle('keys')}
          >
            <IconDialpad />
          </Button>
          <Button
            variant={tool === 'transfer' ? 'default' : 'secondary'}
            size="icon"
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
        {incoming && !call.talking && (
          <Button className="flex-1" onClick={phone.answer}>
            <IconPhone />
            {t('answer', 'Answer')}
          </Button>
        )}
        <Button variant="destructive" className="flex-1" onClick={phone.hangUp}>
          <IconPhoneOff />
          {incoming && !call.talking ? t('decline', 'Decline') : t('hang-up', 'Hang up')}
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

const LinePhone = ({
  line,
  lines,
  onLine,
}: {
  line: Line;
  lines: Line[];
  onLine: (id: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const audio = useRef<HTMLAudioElement>(null);
  const phone = useSip(line, audio);
  const [open, setOpen] = useState(false);
  const [closedNote, setClosedNote] = useState<string | null>(null);
  const current = useCallConversation(line, Boolean(phone.call?.talking));
  const ringing = phone.call?.direction === 'incoming' && !phone.call.talking;
  const note = current && current.id !== closedNote ? current : null;

  return (
    <div className="flex flex-col items-end gap-2">
      {(open || ringing) && (
        <section
          aria-label={t('softphone', 'Phone')}
          className="flex w-72 flex-col gap-3 rounded-lg border bg-background p-3 shadow-lg"
        >
          {lines.length > 1 ? (
            <Select value={line.accountId} onValueChange={(next) => next && onLine(next)}>
              <Select.Trigger aria-label={t('phone-line', 'Line')}>
                <Select.Value>{() => `${line.name} ${line.extension}`}</Select.Value>
              </Select.Trigger>
              <Select.Content>
                {lines.map((other) => (
                  <Select.Item key={other.accountId} value={other.accountId}>
                    {other.name} {other.extension}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          ) : (
            <p className="text-sm font-medium">
              {line.name} {line.extension}
            </p>
          )}
          {phone.call ? (
            <OnCall phone={phone} call={phone.call} line={line} />
          ) : (
            <Dialer ready={phone.status === 'ready'} onDial={phone.dial} />
          )}
          {note && (
            <CallNote
              key={note.id}
              conversationId={note.conversationId}
              onClose={() => setClosedNote(note.id)}
            />
          )}
        </section>
      )}
      <Button size="lg" aria-expanded={open || ringing} onClick={() => setOpen(!open)}>
        <StatusDot status={phone.status} />
        <IconPhone />
        {phone.call ? phone.call.number : t('softphone', 'Phone')}
      </Button>
      {/* The other side's voice. */}
      <audio ref={audio} hidden>
        <track kind="captions" />
      </audio>
    </div>
  );
};

/** The member's softphone on one of their lines at a time. */
export const SipPhone = ({ lines }: { lines: [Line, ...Line[]] }) => {
  const [first] = lines;
  const [accountId, setAccountId] = useState(first.accountId);
  const line = lines.find((other) => other.accountId === accountId) ?? first;

  return <LinePhone key={line.accountId} line={line} lines={lines} onLine={setAccountId} />;
};
