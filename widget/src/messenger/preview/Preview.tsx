import {
  PREVIEW_MESSAGE,
  PREVIEW_READY,
  type PreviewMessage,
  visitorView,
} from '@frontline/api/messenger/view';
import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../api.ts';
import { Composer, Identify } from '../Composer.tsx';
import { Home } from '../Home.tsx';
import { hasLauncher, Shell } from '../Messenger.tsx';
import { Bar, BotMenu, TeamNote } from '../Thread.tsx';

const isPreview = (data: unknown): data is PreviewMessage =>
  typeof data === 'object' && data !== null && 'type' in data && data.type === PREVIEW_MESSAGE;

/** The settings the page last posted, as a visitor would see them now. */
const usePosted = () => {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const take = (event: MessageEvent) => {
      if (event.source !== window.parent || !isPreview(event.data)) return;

      const { name, config, supporters } = event.data;

      // A link half typed in the form isn't a URL yet, and the home page reads its host.
      const links = config.links.filter((link) => URL.canParse(link));

      setSettings(visitorView({ ...config, links, name }, supporters, new Date()));
    };

    window.addEventListener('message', take);
    window.parent.postMessage({ type: PREVIEW_READY }, '*');

    return () => window.removeEventListener('message', take);
  }, []);

  return settings;
};

/**
 * A new conversation as it opens: the welcome, the bot's greeting and menu, and the composer, or
 * the contact form a messenger that asks for one shows first. It follows the order `Thread` draws
 * them in; a change to one is a change to both.
 */
const NewConversation = ({ settings, onBack }: { settings: Settings; onBack: () => void }) => (
  <div class="fl-thread">
    <Bar settings={settings} onBack={onBack} />
    <div class="fl-scroll fl-messages">
      {settings.welcome && <TeamNote>{settings.welcome}</TeamNote>}
      {settings.botGreeting && <TeamNote>{settings.botGreeting}</TeamNote>}
      {settings.botMenu.length > 0 && <BotMenu settings={settings} onPick={() => undefined} />}
      {!settings.isOnline && settings.away && <TeamNote>{settings.away}</TeamNote>}
    </div>
    {settings.requireAuth ? (
      <Identify onSubmit={() => Promise.resolve()} />
    ) : (
      <Composer
        onSend={() => Promise.resolve()}
        onUpload={() => Promise.reject(new Error('The preview sends nothing'))}
        onTyping={() => undefined}
      />
    )}
  </div>
);

/**
 * The messenger as the settings page previews it, in an iframe: the real launcher and panel,
 * drawn from the settings the page posts, opened on the home page. It connects no visitor and
 * sends nothing.
 */
export const Preview = () => {
  const settings = usePosted();
  const [open, setOpen] = useState(true);
  const [thread, setThread] = useState(false);

  if (!settings) return null;

  return (
    // With no launcher to open it again, the panel stays open.
    <Shell settings={settings} shown={open || !hasLauncher(settings)} unread={0} onOpen={setOpen}>
      {thread ? (
        <NewConversation settings={settings} onBack={() => setThread(false)} />
      ) : (
        <Home
          settings={settings}
          conversations={[]}
          onOpen={() => setThread(true)}
          onTab={() => undefined}
        />
      )}
    </Shell>
  );
};
