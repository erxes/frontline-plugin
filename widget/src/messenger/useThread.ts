import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Uploaded } from '../shared/http.ts';
import type { Message, MessengerApi } from './api.ts';
import type { MessengerState } from './useMessenger.ts';

/** What the thread has loaded of one conversation, oldest first, and the cursor for earlier ones. */
type Loaded = { id: string | null; messages: Message[]; earlier: string | null };

/**
 * A conversation's latest messages, refetched when the stream says it changed, with earlier ones
 * on request, and marked read while the visitor has the panel open on it. `send` starts the
 * conversation when there is none yet.
 */
export const useThread = (
  api: MessengerApi,
  { session, conversations, changed, refresh }: MessengerState,
  conversationId: string | null,
  open: boolean,
  onStarted: (id: string) => void,
) => {
  const [loaded, setLoaded] = useState<Loaded>({ id: null, messages: [], earlier: null });
  const shown = loaded.id === conversationId ? loaded : { messages: [], earlier: null };

  /**
   * Merges messages into conversation `id`, each once. Another conversation's start over with
   * `cursor`; the same one keeps its cursor unless these are its `earlier` messages.
   */
  const put = (id: string, items: Message[], cursor: string | null, earlier = false) =>
    setLoaded((was) => {
      const same = was.id === id;

      const byId = new Map(
        [...(same ? was.messages : []), ...items].map((each) => [each.id, each]),
      );

      return {
        id,
        messages: [...byId.values()].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)),
        earlier: same && !earlier ? was.earlier : cursor,
      };
    });

  const token = session?.token;
  const conversation = conversations.find((item) => item.id === conversationId);
  const unread = conversation?.unreadCount ?? 0;
  const version = changed?.id === conversationId ? changed.at : 0;

  useEffect(() => {
    if (!token || !conversationId) return;

    let live = true;

    const load = async () => {
      const page = await api.messages(token, conversationId);

      if (live) put(conversationId, page.items, page.nextCursor);
    };

    void load();

    return () => {
      live = false;
    };
  }, [api, token, conversationId, version]);

  useEffect(() => {
    if (open && token && conversationId && unread > 0)
      void api.read(token, conversationId).then(refresh);
  }, [api, open, token, conversationId, unread, refresh]);

  const send = async (content: string, files: Uploaded[]) => {
    if (!token) return;

    const sent = await api.send(token, {
      conversationId: conversationId ?? undefined,
      content,
      files: files.map((file) => file.receipt),
    });

    put(sent.conversationId, [sent], null);

    if (!conversationId) onStarted(sent.conversationId);

    await refresh();
  };

  const loadEarlier = async () => {
    if (!token || !conversationId || !shown.earlier) return;

    const page = await api.messages(token, conversationId, shown.earlier);

    put(conversationId, page.items, page.nextCursor, true);
  };

  return {
    token,
    conversation,
    messages: shown.messages,
    hasEarlier: shown.earlier !== null,
    loadEarlier,
    send,
  };
};

/** How close to its end, in pixels, the list counts as read to the end. */
const AT_END = 48;

/**
 * The scrolling list and its content. Opening the panel or a new newest message scrolls to the
 * end. While the visitor is at the end it stays there as pictures, a survey's ballot, the typing
 * line or a note grow the content; a visitor reading further up stays where they are.
 */
export const useNewestInView = (newest: string | undefined, open: boolean, shown: boolean) => {
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);

  useLayoutEffect(() => {
    if (!open || !list.current) return;

    atEnd.current = true;
    list.current.scrollTop = list.current.scrollHeight;
  }, [newest, open, shown]);

  useEffect(() => {
    const scroller = list.current;

    if (!scroller || !content.current) return;

    const onScroll = () => {
      atEnd.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < AT_END;
    };

    const grown = new ResizeObserver(() => {
      if (atEnd.current) scroller.scrollTop = scroller.scrollHeight;
    });

    scroller.addEventListener('scroll', onScroll);
    grown.observe(content.current);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      grown.disconnect();
    };
  }, [shown]);

  return { list, content };
};
