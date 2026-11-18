import { useEffect, useState } from 'preact/hooks';
import type { MessengerApi } from './api.ts';
import { Home } from './Home.tsx';
import { ChatIcon, CloseIcon } from '../shared/icons.tsx';
import { Loading, Thread } from './Thread.tsx';
import { useLazy } from './lazy.ts';
import { type MessengerState, useMessenger } from './useMessenger.ts';

/** A website opens a messenger it hides the launcher of with this event on `window`. */
const OPEN_EVENT = 'frontline:open-messenger';

type View =
  | { name: 'home' }
  | { name: 'thread'; id: string | null }
  | { name: 'tickets' }
  | { name: 'articles' };

// Each tab is a chunk of its own, fetched once the visitor opens it.
const loadTickets = async () => (await import('./tickets/Tickets.tsx')).Tickets;

const loadArticles = async () => (await import('./articles/ArticlesTab.tsx')).ArticlesTab;

/** The panel's page: the greeting, a conversation, or the tickets or help articles tab. */
const Page = ({
  api,
  messenger,
  view,
  onView,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  view: View;
  onView: (view: View) => void;
}) => {
  const TicketsTab = useLazy(view.name === 'tickets', loadTickets);
  const HelpTab = useLazy(view.name === 'articles', loadArticles);
  const home = () => onView({ name: 'home' });

  if (!messenger.settings) return null;

  if (view.name === 'home')
    return (
      <Home
        settings={messenger.settings}
        conversations={messenger.conversations}
        onOpen={(id) => onView({ name: 'thread', id })}
        onTab={(name) => onView({ name })}
      />
    );

  if (view.name === 'tickets')
    return TicketsTab ? <TicketsTab api={api} messenger={messenger} onBack={home} /> : <Loading />;

  if (view.name === 'articles')
    return HelpTab ? <HelpTab api={api} messenger={messenger} onBack={home} /> : <Loading />;

  return (
    <Thread
      api={api}
      messenger={messenger}
      conversationId={view.id}
      onStarted={(id) => onView({ name: 'thread', id })}
      onBack={home}
    />
  );
};

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
          <Page api={api} messenger={messenger} view={view} onView={setView} />
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
