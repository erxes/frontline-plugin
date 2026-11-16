import { useEffect, useState } from 'preact/hooks';
import type { MessengerApi } from './api.ts';
import { Home } from './Home.tsx';
import { ChatIcon, CloseIcon } from './icons.tsx';
import { Thread } from './Thread.tsx';
import { useMessenger } from './useMessenger.ts';

/** A website opens a messenger it hides the launcher of with this event on `window`. */
const OPEN_EVENT = 'frontline:open-messenger';

type View = { name: 'home' } | { name: 'thread'; id: string | null };

/** The launcher in the page's corner and the panel it opens: the greeting, then a conversation. */
export const Messenger = ({ api }: { api: MessengerApi }) => {
  const messenger = useMessenger(api);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: 'home' });
  const { settings, session, conversations, connect } = messenger;

  useEffect(() => {
    if (open && !session) void connect().catch(() => setOpen(false));
  }, [open, session, connect]);

  useEffect(() => {
    const show = () => setOpen(true);

    window.addEventListener(OPEN_EVENT, show);

    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  if (!settings) return null;

  const unread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const launcher = settings.showLauncher && !(settings.hideWhenOffline && !settings.isOnline);

  return (
    <div
      class={`fl fl-hero-${settings.heroStyle}`}
      lang={settings.language}
      style={{
        '--fl-color': settings.color,
        '--fl-text': settings.textColor,
        ...(settings.backgroundColor ? { '--fl-page': settings.backgroundColor } : {}),
      }}
    >
      {open && (
        <section class="fl-panel" role="dialog" aria-label={settings.name}>
          <button
            type="button"
            class="fl-icon-button fl-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
          {view.name === 'home' ? (
            <Home
              settings={settings}
              conversations={conversations}
              onOpen={(id) => setView({ name: 'thread', id })}
            />
          ) : (
            <Thread
              api={api}
              messenger={messenger}
              conversationId={view.id}
              onStarted={(id) => setView({ name: 'thread', id })}
              onBack={() => setView({ name: 'home' })}
            />
          )}
        </section>
      )}
      {launcher && (
        <button
          type="button"
          class="fl-launcher"
          aria-label={open ? 'Close the messenger' : 'Open the messenger'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <CloseIcon />
          ) : settings.launcherLogo ? (
            <img src={settings.launcherLogo} alt="" />
          ) : (
            <ChatIcon />
          )}
          {!open && unread > 0 && <span class="fl-badge">{unread}</span>}
        </button>
      )}
    </div>
  );
};
