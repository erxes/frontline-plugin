import { getPluginRuntime } from 'erxes-ui';
import { useEffect } from 'react';
import { PLUGIN } from '~/plugin.ts';
import { useOpenConversation } from './queries.ts';

/** The topic the API signals a channel's members on when a customer writes, then the conversation. */
const ARRIVED = 'arrived.';

let audio: AudioContext | undefined;

/** Two short rising notes at half volume, the old inbox's notify sound's loudness. */
const chime = () => {
  audio ??= new AudioContext();

  const at = audio.currentTime;
  const gain = audio.createGain();

  gain.connect(audio.destination);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);

  for (const [frequency, start] of [
    [880, 0],
    [1320, 0.12],
  ] as const) {
    const tone = audio.createOscillator();

    tone.frequency.value = frequency;
    tone.connect(gain);
    tone.start(at + start);
    tone.stop(at + 0.45);
  }
};

/**
 * Chimes when a customer writes in a conversation of the member's channels, unless it is the one
 * open on a screen they can see. A page the member hasn't clicked yet stays silent, as browsers
 * allow no sound before that.
 */
export const useArrivalSound = () => {
  const [openId] = useOpenConversation();

  useEffect(() => {
    const open = openId.toLowerCase();

    return getPluginRuntime()?.subscribe((message) => {
      if ('resync' in message || message.plugin !== PLUGIN) return;

      const arrived = message.topics.flatMap((topic) =>
        topic.startsWith(ARRIVED) ? [topic.slice(ARRIVED.length)] : [],
      );

      if (!navigator.userActivation.hasBeenActive) return;

      if (arrived.some((id) => document.hidden || id !== open)) chime();
    });
  }, [openId]);
};
