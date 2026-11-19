import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneIncoming,
  IconPhoneOff,
} from '@tabler/icons-react';
import { addPluginStyles, Button } from 'erxes-ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { PHONE_PATH } from '@/calls/queries.ts';
import { PLUGIN } from '~/plugin.ts';
import { useCurrentCall } from './current.ts';
import { DesktopLink, desktop } from './DesktopLink.tsx';
import { publishPhone } from './live.ts';
import { StatusDot, useCallText } from './PhonePanel.tsx';
import css from './styles.css?inline';
import { type Line, type Phone, type PhoneCall, useSip } from './useSip.ts';

// The ring card and the call bar show on pages the plugin's stylesheet never loads on.
addPluginStyles(`${PLUGIN}:softphone`, css);

type OverPage = { phone: Phone; call: PhoneCall; caller: string | null };

/** An incoming call over whatever page the member is on: who, and Answer or Decline. */
const RingCard = ({ phone, call, caller }: OverPage) => {
  const { t } = useTranslation('frontline');

  return (
    <section
      aria-label={t('incoming-call', 'Incoming call')}
      className="flex w-72 flex-col gap-3 rounded-lg border bg-background p-3 shadow-lg"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconPhoneIncoming className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold tabular-nums">{caller ?? call.number}</div>
          <div className="truncate text-sm text-muted-foreground tabular-nums">
            {caller ? call.number : t('incoming-call', 'Incoming call')}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={phone.answer}>
          <IconPhone />
          {t('answer', 'Answer')}
        </Button>
        <Button variant="destructive" className="flex-1" onClick={phone.hangUp}>
          <IconPhoneOff />
          {t('decline', 'Decline')}
        </Button>
      </div>
    </section>
  );
};

/** The call the member is on, while they work on another page: back to the phone, mute, hang up. */
const CallBar = ({ phone, call, caller }: OverPage) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-lg">
      <Button variant="ghost" onClick={() => void navigate(PHONE_PATH)}>
        <StatusDot status={phone.status} />
        <span className="max-w-40 truncate font-medium tabular-nums">{caller ?? call.number}</span>
        <span className="text-muted-foreground tabular-nums">{useCallText(call)}</span>
      </Button>
      {call.talking && (
        <Button
          variant={call.muted ? 'default' : 'ghost'}
          size="icon"
          aria-pressed={call.muted}
          aria-label={t('mute', 'Mute')}
          onClick={phone.toggleMute}
        >
          {call.muted ? <IconMicrophoneOff /> : <IconMicrophone />}
        </Button>
      )}
      <Button
        variant="destructive"
        size="icon"
        aria-label={t('hang-up', 'Hang up')}
        onClick={phone.hangUp}
      >
        <IconPhoneOff />
      </Button>
    </div>
  );
};

/**
 * The phone signed in on one line, for as long as the member is in erxes. It draws nothing
 * while idle: the Phone page draws it. Over other pages a call rings as a card, and a call on
 * shows as a bar.
 */
const LinePhone = ({
  line,
  lines,
  pickLine,
}: {
  line: Line;
  lines: Line[];
  pickLine: (accountId: string) => void;
}) => {
  const audio = useRef<HTMLAudioElement>(null);
  const phone = useSip(line, audio);
  const navigate = useNavigate();
  const onPhonePage = useLocation().pathname === PHONE_PATH;
  const [closedNote, closeNote] = useState<string | null>(null);
  const { call } = phone;
  const { current, caller } = useCurrentCall(line, phone.callCount, Boolean(call));

  useEffect(
    () => publishPhone({ phone, line, lines, pickLine, current, caller, closedNote, closeNote }),
    [phone, line, lines, pickLine, current, caller, closedNote],
  );
  useEffect(() => () => publishPhone(null), []);

  return (
    <>
      {call &&
        !onPhonePage &&
        (call.direction === 'incoming' && !call.talking ? (
          <RingCard phone={phone} call={call} caller={caller} />
        ) : (
          <CallBar phone={phone} call={call} caller={caller} />
        ))}
      {desktop && (
        <DesktopLink
          bridge={desktop}
          phone={phone}
          caller={caller}
          onOpen={() => void navigate(PHONE_PATH)}
        />
      )}
      {/* The other side's voice. */}
      <audio ref={audio} hidden>
        <track kind="captions" />
      </audio>
    </>
  );
};

/** The member's softphone on one of their lines at a time. */
export const SipPhone = ({ lines }: { lines: [Line, ...Line[]] }) => {
  const [first] = lines;
  const [accountId, setAccountId] = useState(first.accountId);
  const line = lines.find((other) => other.accountId === accountId) ?? first;

  return <LinePhone key={line.accountId} line={line} lines={lines} pickLine={setAccountId} />;
};
