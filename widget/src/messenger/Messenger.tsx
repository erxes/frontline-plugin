import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useReplyAlert } from './alert.ts';
import type { MessengerApi, Settings } from './api.ts';
import { Home } from './Home.tsx';
import { ChatIcon, CloseIcon } from '../shared/icons.tsx';
import { languageOf, TextProvider, useText, useTextIn } from '../shared/text.ts';
import { Loading, Thread } from './Thread.tsx';
import { useLazy } from './lazy.ts';
import { type MessengerState, useMessenger } from './useMessenger.ts';

/** A website opens a messenger it hides the launcher of with this event on `window`. */
const OPEN_EVENT = 'frontline:open-messenger';

/** How much each of red, green and blue adds to a colour's WCAG relative luminance. */
const WEIGHTS = [0.2126, 0.7152, 0.0722];

/** The WCAG relative luminance of `hex`, a `#rrggbb` colour as the API stores them. */
const luminanceOf = (hex: string) =>
  WEIGHTS.reduce((sum, weight, index) => {
    const channel = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;

    return (
      sum + weight * (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    );
  }, 0);

/**
 * The colour scheme a configured background reads in: light above the luminance where dark and
 * light text contrast equally, dark below it. Without one, the visitor's system picks.
 */
const schemeOf = (background: string | null) =>
  background ? (luminanceOf(background) > 0.179 ? 'fl-light' : 'fl-dark') : '';

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
  open,
  onView,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  view: View;
  open: boolean;
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
      open={open}
      onStarted={(id) => onView({ name: 'thread', id })}
      onBack={home}
    />
  );
};

/**
 * Connects the visitor as the panel opens. When that fails, it says why under the page, with a
 * way to try again, rather than leaving the visitor a panel that can't send.
 */
const Connection = ({
  messenger: { session, connect },
  open,
}: {
  messenger: MessengerState;
  open: boolean;
}) => {
  const { t, messageOf } = useText();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    if (open && !session && !failure)
      void connect().catch((error: unknown) => setFailure({ error }));
  }, [open, session, connect, failure]);

  if (!failure || session) return null;

  return (
    <p class="fl-retry" role="alert">
      <span class="fl-error">{messageOf(failure.error)}</span>
      <button type="button" class="fl-link" onClick={() => setFailure(null)}>
        {t('Try again')}
      </button>
    </p>
  );
};

/**
 * The launcher in the page's corner and the panel it opens: the greeting, then a conversation.
 * Closing only hides the panel, so what the visitor was writing and where they were wait for them.
 */
export const Messenger = ({ api, language }: { api: MessengerApi; language?: string }) => {
  const messenger = useMessenger(api, language);
  // Null until the visitor first opens the panel, which mounts it from then on.
  const [shown, setOpen] = useState<boolean | null>(null);
  const open = shown === true;
  const [view, setView] = useState<View>({ name: 'home' });
  const { settings, session, conversations } = messenger;
  const reading = open && view.name === 'thread' ? view.id : null;
  const unread = useReplyAlert(conversations, Boolean(session), reading, settings?.name ?? '');

  useEffect(() => {
    const show = () => setOpen(true);

    window.addEventListener(OPEN_EVENT, show);

    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  if (!settings) return null;

  return (
    <Shell settings={settings} shown={shown} unread={unread} onOpen={setOpen}>
      <Page api={api} messenger={messenger} view={view} open={open} onView={setView} />
      <Connection messenger={messenger} open={open} />
    </Shell>
  );
};

/** Whether the messenger shows its launcher: it's on, and not hidden while the team is offline. */
export const hasLauncher = (settings: Settings) =>
  settings.showLauncher && !(settings.hideWhenOffline && !settings.isOnline);

/**
 * Focus follows the panel: into it as it opens, back to the launcher once it closes. On a phone
 * the launcher hides while the panel is open, so focus would otherwise drop to the page. A panel
 * that mounts open, as the settings page's preview does, leaves focus on the page.
 */
const useFollowingFocus = (shown: boolean | null) => {
  const panel = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const was = useRef(shown);

  useEffect(() => {
    if (was.current === shown) return;

    was.current = shown;

    if (shown) panel.current?.focus();
    else if (shown === false) toggle.current?.focus();
  }, [shown]);

  return { panel, toggle };
};

/**
 * The messenger in the page's corner, in its settings' colours and language: the launcher, and
 * once `shown`, the panel holding `children`, hidden while `shown` is false. The settings page's
 * preview draws the same.
 */
export const Shell = ({
  settings,
  shown,
  unread,
  onOpen,
  children,
}: {
  settings: Settings;
  shown: boolean | null;
  unread: number;
  onOpen: (open: boolean) => void;
  children: ComponentChildren;
}) => {
  const open = shown === true;
  const { panel, toggle } = useFollowingFocus(shown);
  const text = useTextIn(languageOf(settings.language));

  if (!text) return null;

  const { t } = text;
  const launcher = hasLauncher(settings);

  return (
    <TextProvider value={text}>
      <div
        class={`fl fl-hero-${settings.heroStyle} ${schemeOf(settings.backgroundColor)}`}
        lang={settings.language}
        style={{
          '--fl-color': settings.color,
          '--fl-text': settings.textColor,
          ...(settings.backgroundColor ? { '--fl-page': settings.backgroundColor } : {}),
        }}
      >
        {shown !== null && (
          <section
            ref={panel}
            class="fl-panel"
            role="dialog"
            aria-label={settings.name}
            tabIndex={-1}
            hidden={!open}
          >
            <button
              type="button"
              class="fl-icon-button fl-close"
              aria-label={t('Close')}
              onClick={() => onOpen(false)}
            >
              <CloseIcon />
            </button>
            {children}
          </section>
        )}
        {launcher && (
          <button
            ref={toggle}
            type="button"
            class="fl-launcher"
            aria-label={t(open ? 'Close the messenger' : 'Open the messenger')}
            aria-expanded={open}
            onClick={() => onOpen(!open)}
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
    </TextProvider>
  );
};
