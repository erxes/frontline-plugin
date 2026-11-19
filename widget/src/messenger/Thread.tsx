import type { ComponentChildren } from 'preact';
import type { Uploaded } from '../shared/http.ts';
import type { Attachment, Message, MessengerApi, Settings } from './api.ts';
import { Composer, Identify } from './Composer.tsx';
import { statusOf, timeOf } from './hours.ts';
import { BackIcon, FileIcon } from '../shared/icons.tsx';
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
}) => (
  <div class={message.fromVisitor ? 'fl-message fl-mine' : 'fl-message'}>
    <div class="fl-bubble">
      {message.content}
      {message.attachments.length > 0 && <Files files={message.attachments} urlOf={urlOf} />}
    </div>
    <time dateTime={message.createdAt}>{timeOf(message.createdAt, language)}</time>
  </div>
);

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
export const Bar = ({ settings, onBack }: { settings: Settings; onBack: () => void }) => (
  <header class="fl-bar">
    <button type="button" class="fl-icon-button" aria-label="Back" onClick={onBack}>
      <BackIcon />
    </button>
    <div>
      <strong>{settings.name}</strong>
      <span class={settings.isOnline ? 'fl-status fl-online' : 'fl-status'}>
        {statusOf(settings)}
      </span>
    </div>
  </header>
);

/** In place of a page or list that is still on its way. */
export const Loading = () => (
  <p class="fl-loading" role="status">
    Loading…
  </p>
);

/** The bot's menu: a link opens, anything else is sent as the visitor's message. */
export const BotMenu = ({
  settings,
  onPick,
}: {
  settings: Settings;
  onPick: (text: string) => void;
}) => (
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
);

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
  const { settings, typing, refresh } = messenger;

  const { token, conversation, messages, hasEarlier, loadEarlier, send } = useThread(
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
            <button type="button" class="fl-link" onClick={() => void loadEarlier()}>
              Earlier messages
            </button>
          )}
          {/* The settings page's preview draws a new conversation in this order too: `NewConversation`. */}
          {settings.welcome && !hasEarlier && <TeamNote>{settings.welcome}</TeamNote>}
          {withBot && settings.botGreeting && <TeamNote>{settings.botGreeting}</TeamNote>}
          <Messages api={api} token={token} messages={messages} language={settings.language} />
          {withBot && <BotMenu settings={settings} onPick={(text) => void send(text, [])} />}
          {withBot && conversationId && (
            <button
              type="button"
              class="fl-link"
              onClick={() => void api.askForPerson(token, conversationId).then(refresh)}
            >
              Talk to a person
            </button>
          )}
          {!settings.isOnline && settings.away && <TeamNote>{settings.away}</TeamNote>}
          {resolved && settings.thank && <TeamNote>{settings.thank}</TeamNote>}
          {conversationId && typing === conversationId && (
            <p class="fl-typing" role="status">
              Typing…
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
          Start a new conversation
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
