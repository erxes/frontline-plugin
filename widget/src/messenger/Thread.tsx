import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Uploaded } from '../shared/http.ts';
import type { Attachment, Message, MessengerApi, Settings } from './api.ts';
import { Composer, Identify } from './Composer.tsx';
import { statusOf, timeOf } from './hours.ts';
import { BackIcon, FileIcon } from '../shared/icons.tsx';
import { useText } from '../shared/text.ts';
import type { MessengerState } from './useMessenger.ts';
import { useLazy } from './lazy.ts';
import { useNewestInView, useThread } from './useThread.ts';

const loadSurvey = async () => (await import('./survey/SurveyCard.tsx')).SurveyCard;

/** A message from the team, the bot or the messenger itself, on the left. */
export const TeamNote = ({ children }: { children: ComponentChildren }) => (
  <div class="fl-message">
    <div class="fl-bubble">{children}</div>
  </div>
);

/** A message's files: pictures shown, anything else a link that downloads it. */
export const Files = ({
  files,
  urlOf,
}: {
  files: Attachment[];
  urlOf: (url: string) => string;
}) => (
  <div class="fl-files">
    {files.map((file) =>
      file.type?.startsWith('image/') ? (
        <a key={file.url} href={urlOf(file.url)} target="_blank" rel="noopener">
          <img src={urlOf(file.url)} alt={file.name} />
        </a>
      ) : (
        <a key={file.url} class="fl-file" href={urlOf(file.url)} target="_blank" rel="noopener">
          <FileIcon />
          {file.name}
        </a>
      ),
    )}
  </div>
);

/** One message: the visitor's on the right in the messenger's colour, the team's on the left. */
const Bubble = ({
  message,
  language,
  urlOf,
}: {
  message: Message;
  language: string;
  urlOf: (url: string) => string;
}) => {
  const { t } = useText();

  return (
    <div class={message.fromVisitor ? 'fl-message fl-mine' : 'fl-message'}>
      <div class="fl-bubble">
        {message.content}
        {message.attachments.length > 0 && <Files files={message.attachments} urlOf={urlOf} />}
      </div>
      <time dateTime={message.createdAt}>{timeOf(message.createdAt, language, t)}</time>
    </div>
  );
};

/** The conversation's messages; a survey shows as the visitor's ballot, from a chunk of its own. */
const Messages = ({
  api,
  token,
  messages,
  language,
}: {
  api: MessengerApi;
  token: string;
  messages: Message[];
  language: string;
}) => {
  const Survey = useLazy(
    messages.some((message) => message.surveyId),
    loadSurvey,
  );

  const urlOf = (url: string) => api.fileUrl(token, url);

  return messages.map((message) =>
    message.surveyId ? (
      <div key={message.id} class="fl-message">
        {Survey && <Survey api={api} token={token} messageId={message.id} urlOf={urlOf} />}
      </div>
    ) : (
      <Bubble key={message.id} message={message} language={language} urlOf={urlOf} />
    ),
  );
};

/** The bar over a page of the panel: back to the start, and the messenger's name and status. */
export const Bar = ({ settings, onBack }: { settings: Settings; onBack: () => void }) => {
  const { t } = useText();

  return (
    <header class="fl-bar">
      <button type="button" class="fl-icon-button" aria-label={t('Back')} onClick={onBack}>
        <BackIcon />
      </button>
      <div>
        <strong>{settings.name}</strong>
        <span class={settings.isOnline ? 'fl-status fl-online' : 'fl-status'}>
          {statusOf(settings, t)}
        </span>
      </div>
    </header>
  );
};

/** In place of a page or list that is still on its way. */
export const Loading = () => {
  const { t } = useText();

  return (
    <p class="fl-loading" role="status">
      {t('Loading…')}
    </p>
  );
};

/**
 * The bot's menu: a link opens, anything else is sent as the visitor's message. Under it, once
 * the conversation exists, a way past the bot to a person.
 */
export const BotMenu = ({
  settings,
  onPick,
  onPerson,
}: {
  settings: Settings;
  onPick: (text: string) => void;
  onPerson: (() => void) | null;
}) => {
  const { t } = useText();

  return (
    <>
      <div class="fl-menu">
        {settings.botMenu.map((item) =>
          item.link ? (
            <a key={item.text} href={item.link} target="_blank" rel="noopener">
              {item.text}
            </a>
          ) : (
            <button key={item.text} type="button" onClick={() => onPick(item.text)}>
              {item.text}
            </button>
          ),
        )}
      </div>
      {onPerson && (
        <button type="button" class="fl-link" onClick={onPerson}>
          {t('Talk to a person')}
        </button>
      )}
    </>
  );
};

/** Runs what the visitor asked for, keeping why it failed to show them. */
const useAttempt = () => {
  const { messageOf } = useText();
  const [error, setError] = useState<string | null>(null);

  const attempt = (work: () => Promise<unknown>) => {
    setError(null);
    work().catch((failure: unknown) => setError(messageOf(failure)));
  };

  return { error, attempt };
};

/**
 * One conversation, or a new one when `conversationId` is null: the welcome and bot greeting,
 * the messages, who is typing, and the composer. The visitor's first message starts the
 * conversation; a messenger that requires it asks for an email or phone first.
 */
export const Thread = ({
  api,
  messenger,
  conversationId,
  open,
  onStarted,
  onBack,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  conversationId: string | null;
  open: boolean;
  onStarted: (id: string) => void;
  onBack: () => void;
}) => {
  const { settings, typing } = messenger;
  const { t } = useText();
  // A bot menu pick, a call for a person or older messages that failed says why under the messages.
  const { error, attempt } = useAttempt();

  const { token, conversation, messages, hasEarlier, loadEarlier, send, askForPerson } = useThread(
    api,
    messenger,
    conversationId,
    open,
    onStarted,
  );

  const { list, content } = useNewestInView(messages.at(-1)?.id, open, Boolean(settings && token));

  if (!settings || !token) return null;

  const hasBot = Boolean(settings.botGreeting) || settings.botMenu.length > 0;
  const withBot = hasBot && (conversation?.operator ?? 'bot') === 'bot';
  const resolved = conversation?.status === 'resolved';

  return (
    <div class="fl-thread">
      <Bar settings={settings} onBack={onBack} />
      <div ref={list} class="fl-scroll">
        <div ref={content} class="fl-messages" aria-live="polite">
          {hasEarlier && (
            <button type="button" class="fl-link" onClick={() => attempt(loadEarlier)}>
              {t('Earlier messages')}
            </button>
          )}
          {/* The settings page's preview draws a new conversation in this order too: `NewConversation`. */}
          {settings.welcome && !hasEarlier && <TeamNote>{settings.welcome}</TeamNote>}
          {withBot && settings.botGreeting && <TeamNote>{settings.botGreeting}</TeamNote>}
          <Messages api={api} token={token} messages={messages} language={settings.language} />
          {withBot && (
            <BotMenu
              settings={settings}
              onPick={(text) => attempt(async () => send(text, []))}
              onPerson={conversationId ? () => attempt(askForPerson) : null}
            />
          )}
          {!settings.isOnline && settings.away && <TeamNote>{settings.away}</TeamNote>}
          {resolved && settings.thank && <TeamNote>{settings.thank}</TeamNote>}
          {conversationId && typing === conversationId && (
            <p class="fl-typing" role="status">
              {t('Typing…')}
            </p>
          )}
          {error && (
            <p class="fl-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <Footer
        api={api}
        messenger={messenger}
        token={token}
        conversationId={conversationId}
        resolved={resolved}
        onSend={send}
        onBack={onBack}
      />
    </div>
  );
};

/**
 * Under the messages: the email or phone a messenger asks for first, a fresh start once a
 * messenger that signs visitors out resolved the conversation, or the composer.
 */
const Footer = ({
  api,
  messenger: { settings, session, connect, signOut },
  token,
  conversationId,
  resolved,
  onSend,
  onBack,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  token: string;
  conversationId: string | null;
  resolved: boolean;
  onSend: (content: string, files: Uploaded[]) => Promise<void>;
  onBack: () => void;
}) => {
  const { t } = useText();

  if (settings?.requireAuth && !session?.identified) return <Identify onSubmit={connect} />;

  if (resolved && settings?.forceLogoutWhenResolve)
    return (
      <div class="fl-composer">
        <button
          type="button"
          class="fl-primary"
          onClick={() => {
            signOut();
            onBack();
          }}
        >
          {t('Start a new conversation')}
        </button>
      </div>
    );

  return (
    <Composer
      onSend={onSend}
      onUpload={(file) => api.upload(token, file)}
      onTyping={() => {
        if (conversationId) void api.typing(token, conversationId);
      }}
    />
  );
};
