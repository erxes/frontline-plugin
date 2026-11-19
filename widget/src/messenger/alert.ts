import { useEffect, useRef } from 'preact/hooks';
import type { Conversation } from './api.ts';

/** The event a website hears the visitor's unread count on, as `detail.count`, on `window`. */
const UNREAD_EVENT = 'frontline:unread';

/** A short rising chime. A browser keeps it silent until the visitor has used the page. */
const chime = () => {
  const audio = new AudioContext();

  for (const [frequency, after] of [
    [880, 0],
    [1320, 0.12],
  ] as const) {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    const start = audio.currentTime + after;

    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.15, start);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    tone.connect(volume).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.4);
  }

  setTimeout(() => void audio.close(), 1000);
};

/**
 * A notification of the newest reply, which brings the page forward when clicked. Its tag keeps
 * the website's open tabs to one notification per reply. Android's Chrome allows only a service
 * worker's notifications and throws here, so the chime stands alone there.
 */
const notify = (title: string, conversations: Conversation[]) => {
  const newest = conversations.toSorted((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  )[0];

  try {
    const shown = new Notification(title, { body: newest?.content ?? '', tag: newest?.id });

    shown.addEventListener('click', () => {
      window.focus();
      shown.close();
    });
  } catch {
    // The chime already told the visitor.
  }
};

/**
 * Tells the visitor of a team reply in a conversation they aren't reading: a chime, and a
 * notification when the page is hidden and the website already may show them; the messenger never
 * asks for that. `reading` is the conversation open in the panel, if any. Each conversation's
 * count the visitor connects with is where it starts, so loading the page stays quiet. Returns the
 * unread count, which the website hears as `frontline:unread`.
 */
export const useReplyAlert = (
  conversations: Conversation[],
  connected: boolean,
  reading: string | null,
  title: string,
) => {
  const unread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const heard = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: { count: unread } }));
  }, [unread]);

  useEffect(() => {
    if (!connected) {
      heard.current = null;

      return;
    }

    const before = heard.current;

    heard.current = new Map(conversations.map(({ id, unreadCount }) => [id, unreadCount]));

    if (!before) return;

    const grew = conversations.filter(
      ({ id, unreadCount }) =>
        unreadCount > (before.get(id) ?? 0) && (document.hidden || id !== reading),
    );

    if (grew.length === 0) return;

    chime();

    if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
      notify(title, grew);
  }, [connected, reading, title, conversations]);

  return unread;
};
