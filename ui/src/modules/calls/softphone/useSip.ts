import type { InferClientOutputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import type { PhoneState } from '@frontline/desktop';
import { toast } from 'erxes-ui';
import { UA, WebSocketInterface } from 'jssip';
import { getI18n } from 'react-i18next';
import type { RTCSession } from 'jssip/lib/RTCSession';
import type { RTCSessionEvent } from 'jssip/lib/UA';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

export type Line = InferClientOutputs<Client>['calls']['phone']['lines'][number];

/** Signing in to the PBX, signed in and taking calls, or cut off from it. */
export type PhoneStatus = PhoneState['status'];

/** The call the phone is on: ringing until either side answers, then talking. */
export type PhoneCall = {
  session: RTCSession;
  number: string;
  direction: 'incoming' | 'outgoing';
  talking: boolean;
  since: Date | null;
  muted: boolean;
  held: boolean;
};

const AUDIO_ONLY = { audio: true, video: false };

/** The remote side's audio, as soon as the peer connection carries it. */
const playRemote = (session: RTCSession, audio: RefObject<HTMLAudioElement | null>) => {
  const listen = (connection: RTCPeerConnection) =>
    connection.addEventListener('track', ({ streams }) => {
      const [stream] = streams;

      if (audio.current && stream) {
        audio.current.srcObject = stream;
        void audio.current.play().catch(() => undefined);
      }
    });

  // An outgoing call has its connection already; an incoming one makes it on answer.
  if (session.connection) listen(session.connection);
  else session.on('peerconnection', ({ peerconnection }) => listen(peerconnection));
};

/** Shows `session` as the phone's call until it ends; `busy` holds while it lasts. */
const follow = (
  session: RTCSession,
  setCall: Dispatch<SetStateAction<PhoneCall | null>>,
  onNew: () => void,
  audio: RefObject<HTMLAudioElement | null>,
  busy: RefObject<boolean>,
) => {
  const { direction }: { direction: PhoneCall['direction'] } = session;

  const update = (patch: Partial<PhoneCall>) =>
    setCall((current) => (current?.session === session ? { ...current, ...patch } : current));

  const end = () => {
    busy.current = false;
    setCall((current) => (current?.session === session ? null : current));
  };

  busy.current = true;
  onNew();
  setCall({
    session,
    number: session.remote_identity.uri.user,
    direction,
    talking: false,
    since: null,
    muted: false,
    held: false,
  });
  playRemote(session, audio);
  session.on('confirmed', () => update({ talking: true, since: new Date() }));
  session.on('ended', end);
  session.on('failed', (event) => {
    const { cause, originator }: { cause: string; originator: string } = event;

    end();

    // A call the member made says why it went nowhere: busy, unavailable, rejected.
    if (direction === 'outgoing' && originator !== 'local') toast({ title: cause });
  });
  session.on('getusermediafailed', () =>
    toast({
      variant: 'destructive',
      title: getI18n().t('phone-no-microphone', {
        ns: 'frontline',
        defaultValue: 'The browser gave the phone no microphone',
      }),
    }),
  );
};

/**
 * A SIP phone signed in to the line's PBX over WebRTC (JsSIP), for as long as it is mounted. It
 * takes one call at a time: a second incoming call gets busy.
 */
export const useSip = (line: Line, audio: RefObject<HTMLAudioElement | null>) => {
  const [status, setStatus] = useState<PhoneStatus>('connecting');
  const [call, setCall] = useState<PhoneCall | null>(null);
  // How many calls the phone has had: what belongs to one call is kept under its number.
  const [callCount, setCallCount] = useState(0);
  const agent = useRef<UA | null>(null);
  const busy = useRef(false);
  const host = new URL(line.webSocketUrl).hostname;
  const pcConfig = { iceServers: line.iceServers };

  useEffect(() => {
    const ua = new UA({
      sockets: [new WebSocketInterface(line.webSocketUrl)],
      uri: `sip:${line.extension}@${new URL(line.webSocketUrl).hostname}`,
      password: line.password,
      session_timers: false,
    });

    const ready = () => setStatus('ready');
    const offline = () => setStatus('offline');
    const connecting = () => setStatus('connecting');

    const onNew = () => setCallCount((count) => count + 1);

    const session = ({ session: next }: RTCSessionEvent) => {
      if (busy.current) next.terminate({ status_code: 486 });
      else follow(next, setCall, onNew, audio, busy);
    };

    ua.on('registered', ready);
    ua.on('registrationFailed', offline);
    ua.on('unregistered', offline);
    ua.on('disconnected', offline);
    ua.on('connecting', connecting);
    ua.on('newRTCSession', session);
    ua.start();
    agent.current = ua;

    return () => {
      ua.off('registered', ready);
      ua.off('registrationFailed', offline);
      ua.off('unregistered', offline);
      ua.off('disconnected', offline);
      ua.off('connecting', connecting);
      ua.off('newRTCSession', session);
      ua.stop();
      agent.current = null;
      busy.current = false;
    };
  }, [line.webSocketUrl, line.extension, line.password, audio]);

  // Leaving or reloading the page ends the call, so the browser, or the desktop app, asks first.
  const onCall = Boolean(call);

  useEffect(() => {
    if (!onCall) return;

    const hold = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener('beforeunload', hold);

    return () => window.removeEventListener('beforeunload', hold);
  }, [onCall]);

  const update = (patch: Partial<PhoneCall>) =>
    setCall((current) => current && { ...current, ...patch });

  return {
    status,
    call,
    callCount,
    dial: (number: string) => {
      agent.current?.call(`sip:${number}@${host}`, { mediaConstraints: AUDIO_ONLY, pcConfig });
    },
    answer: () => call?.session.answer({ mediaConstraints: AUDIO_ONLY, pcConfig }),
    hangUp: () => call?.session.terminate(),
    press: (digit: string) => call?.session.sendDTMF(digit),
    toggleMute: () => {
      if (!call) return;

      if (call.muted) call.session.unmute({ audio: true });
      else call.session.mute({ audio: true });

      update({ muted: !call.muted });
    },
    toggleHold: () => {
      if (!call) return;

      if (call.held) call.session.unhold();
      else call.session.hold();

      update({ held: !call.held });
    },
  };
};

export type Phone = ReturnType<typeof useSip>;
