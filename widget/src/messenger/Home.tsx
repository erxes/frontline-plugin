import type { Conversation, Settings } from './api.ts';
import { hoursOf, statusOf, timeOf } from './hours.ts';
import { ChatIcon } from '../shared/icons.tsx';
import { useText } from '../shared/text.ts';

/** A supporter's picture, or their initials when it has none or it won't load. */
const Avatar = ({ name, url }: { name: string; url: string | null }) => (
  <span class="fl-avatar" title={name}>
    {url ? <img src={url} alt={name} onError={(event) => event.currentTarget.remove()} /> : null}
    {name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')}
  </span>
);

/** The greeting over the panel: logo, title, message, team and whether they're online. */
const Hero = ({ settings }: { settings: Settings }) => {
  const { t } = useText();

  return (
    <header class="fl-hero">
      {settings.logo && <img class="fl-logo" src={settings.logo} alt="" />}
      <h2>{settings.greetingTitle || settings.name}</h2>
      {settings.greetingMessage && <p>{settings.greetingMessage}</p>}
      <div class="fl-team">
        {settings.supporters.length > 0 && (
          <span class="fl-avatars">
            {settings.supporters.slice(0, 5).map((supporter) => (
              <Avatar key={supporter.id} name={supporter.name ?? ''} url={supporter.avatarUrl} />
            ))}
          </span>
        )}
        <span class={settings.isOnline ? 'fl-status fl-online' : 'fl-status'}>
          {statusOf(settings, t)}
        </span>
      </div>
    </header>
  );
};

/** A button to write, and the visitor's conversations with their unread replies. */
const Chats = ({
  settings,
  conversations,
  onOpen,
}: {
  settings: Settings;
  conversations: Conversation[];
  onOpen: (id: string | null) => void;
}) => {
  const { t } = useText();

  return (
    <div class="fl-card">
      <button type="button" class="fl-primary" onClick={() => onOpen(null)}>
        <ChatIcon />
        {t('Send us a message')}
      </button>
      {conversations.length > 0 && (
        <ul class="fl-list" aria-label={t('Your conversations')}>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" onClick={() => onOpen(conversation.id)}>
                <span class="fl-preview">{conversation.content || t('Attachment')}</span>
                <span class="fl-meta">
                  {timeOf(conversation.lastMessageAt, settings.language, t)}
                  {conversation.unreadCount > 0 && (
                    <span class="fl-count">{conversation.unreadCount}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * The messenger's first page: the greeting, a button to write, the visitor's conversations,
 * their tickets, the help articles, the online hours, the website's own pages and links.
 */
export const Home = ({
  settings,
  conversations,
  onOpen,
  onTab,
}: {
  settings: Settings;
  conversations: Conversation[];
  onOpen: (id: string | null) => void;
  onTab: (name: 'tickets' | 'articles') => void;
}) => {
  const { t } = useText();
  const hours = hoursOf(settings, t);

  return (
    <div class="fl-scroll">
      <Hero settings={settings} />
      <div class="fl-body">
        {settings.showChat && (
          <Chats settings={settings} conversations={conversations} onOpen={onOpen} />
        )}
        {settings.tickets && (
          <button type="button" class="fl-card fl-app" onClick={() => onTab('tickets')}>
            <strong>{t('Tickets')}</strong>
            <span>{t('File a ticket and follow how it goes.')}</span>
          </button>
        )}
        {settings.knowledgeBaseTopicId && (
          <button type="button" class="fl-card fl-app" onClick={() => onTab('articles')}>
            <strong>{t('Help articles')}</strong>
            <span>{t('Search our answers to common questions.')}</span>
          </button>
        )}
        {hours.length > 0 && (
          <div class="fl-card">
            <h3>{t('Online hours')}</h3>
            <dl class="fl-hours">
              {hours.map((row) => (
                <div key={row.day + row.time}>
                  <dt>{row.day}</dt>
                  <dd>{row.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {settings.websiteApps.map((app) => (
          <a key={app.url} class="fl-card fl-app" href={app.url} target="_blank" rel="noopener">
            <strong>{app.buttonText}</strong>
            {app.description && <span>{app.description}</span>}
          </a>
        ))}
        {settings.links.length > 0 && (
          <nav class="fl-links" aria-label={t('Links')}>
            {settings.links.map((link) => (
              <a key={link} href={link} target="_blank" rel="noopener">
                {new URL(link).hostname.replace(/^www\./, '')}
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
};
