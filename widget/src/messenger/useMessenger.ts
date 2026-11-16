import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Connected, Conversation, Identity, MessengerApi, Settings } from './api.ts';

/** Where the browser keeps the visitor's token, one per messenger. */
const tokenKey = (key: string) => `frontline:messenger:${key}`;

const storedToken = (key: string) => {
  try {
    return localStorage.getItem(tokenKey(key));
  } catch {
    return null;
  }
};

const storeToken = (key: string, token: string | null) => {
  try {
    if (token) localStorage.setItem(tokenKey(key), token);
    else localStorage.removeItem(tokenKey(key));
  } catch {
    // A browser that keeps nothing starts a new visitor on each page.
  }
};

/** The conversation a stream event names (`{ conversationId }`). */
const idOf = (event: Event) => {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return undefined;

  const data: unknown = JSON.parse(event.data);

  return data &&
    typeof data === 'object' &&
    'conversationId' in data &&
    typeof data.conversationId === 'string'
    ? data.conversationId
    : undefined;
};

/** How long a member's typing shows after their last keystroke. */
const TYPING_MS = 4000;

export type Session = { token: string; identified: boolean };

/**
 * The messenger as one visitor sees it. A returning visitor (one with a token) connects on load,
 * so their unread replies show; a new one connects when they open the messenger, so a page view
 * alone makes no customer. While connected, the stream says which conversation changed.
 */
export const useMessenger = (api: MessengerApi) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [changed, setChanged] = useState<{ id: string; at: number } | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const take = useCallback(
    (reply: Connected) => {
      storeToken(api.key, reply.token);
      setSettings(reply.messenger);
      setSession({ token: reply.token, identified: reply.identified });
      setConversations(reply.conversations);
    },
    [api],
  );

  const connect = useCallback(
    async (identity?: Identity) => take(await api.connect(storedToken(api.key), identity)),
    [api, take],
  );

  useEffect(() => {
    const load = storedToken(api.key)
      ? connect()
      : api.settings().then((reply) => setSettings(reply.messenger));

    load.catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : String(failure)),
    );
  }, [api, connect]);

  const token = session?.token;

  const refresh = useCallback(async () => {
    if (token) setConversations(await api.conversations(token));
  }, [api, token]);

  useEffect(() => {
    if (!token) return;

    const stream = api.stream(token);
    let quiet: ReturnType<typeof setTimeout> | undefined;

    stream.addEventListener('changed', (event) => {
      const id = idOf(event);

      if (id) setChanged({ id, at: Date.now() });
      void refresh();
    });
    stream.addEventListener('typing', (event) => {
      clearTimeout(quiet);
      setTyping(idOf(event) ?? null);
      quiet = setTimeout(() => setTyping(null), TYPING_MS);
    });

    return () => {
      clearTimeout(quiet);
      stream.close();
    };
  }, [api, token, refresh]);

  /** Forgets the visitor, as a messenger that signs visitors out once resolved asks. */
  const signOut = useCallback(() => {
    storeToken(api.key, null);
    setSession(null);
    setConversations([]);
  }, [api]);

  return { settings, session, conversations, changed, typing, error, connect, refresh, signOut };
};
