import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Uploaded } from '../shared/http.ts';
import type { Attachment, Message, MessengerApi, Settings } from './api.ts';
import { Composer, Identify } from './Composer.tsx';
import { statusOf, timeOf } from './hours.ts';
import { BackIcon, FileIcon } from '../shared/icons.tsx';
import type { MessengerState } from './useMessenger.ts';
import { useLazy } from './lazy.ts';

const loadSurvey = async () => (await import('./survey/SurveyCard.tsx')).SurveyCard;

/** A message from the team, the bot or the messenger itself, on the left. */
const TeamNote = ({ children }: { children: ComponentChildren }) => (
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

/** What the thread has loaded of one conversation, oldest first, and the cursor for earlier ones. */
type Loaded = { id: string | null; messages: Message[]; earlier: string | null };

/**
 * A conversation's latest messages, refetched when the stream says it changed, with earlier ones
 * on request, and marked read while the visitor has it open. `send` starts the conversation when
 * there is none yet.
 */
const useThread = (
  api: MessengerApi,
  { session, conversations, changed, refresh }: MessengerState,
  conversationId: string | null,
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
    if (token && conversationId && unread > 0) void api.read(token, conversationId).then(refresh);
  }, [api, token, conversationId, unread, refresh]);

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

/** The bot's menu: a link opens, anything else is sent as the visitor's message. */
const BotMenu = ({ settings, onPick }: { settings: Settings; onPick: (text: string) => void }) => (
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
  onStarted,
  onBack,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  conversationId: string | null;
  onStarted: (id: string) => void;
  onBack: () => void;
}) => {
  const { settings, session, typing, connect, refresh, signOut } = messenger;

  const { token, conversation, messages, hasEarlier, loadEarlier, send } = useThread(
    api,
    messenger,
    conversationId,
    onStarted,
  );

  if (!settings || !token) return null;

  const hasBot = Boolean(settings.botGreeting) || settings.botMenu.length > 0;
  const withBot = hasBot && (conversation?.operator ?? 'bot') === 'bot';
  const resolved = conversation?.status === 'resolved';

  return (
    <div class="fl-thread">
      <Bar settings={settings} onBack={onBack} />
      <div class="fl-scroll fl-messages" aria-live="polite">
        {hasEarlier && (
          <button type="button" class="fl-link" onClick={() => void loadEarlier()}>
            Earlier messages
          </button>
        )}
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
      {settings.requireAuth && !session?.identified ? (
        <Identify onSubmit={connect} />
      ) : resolved && settings.forceLogoutWhenResolve ? (
        <StartOver
          onClick={() => {
            signOut();
            onBack();
          }}
        />
      ) : (
        <Composer
          onSend={send}
          onUpload={(file) => api.upload(token, file)}
          onTyping={() => {
            if (conversationId) void api.typing(token, conversationId);
          }}
        />
      )}
    </div>
  );
};

/** In place of the composer once a messenger that signs visitors out resolved the conversation. */
const StartOver = ({ onClick }: { onClick: () => void }) => (
  <div class="fl-composer">
    <button type="button" class="fl-primary" onClick={onClick}>
      Start a new conversation
    </button>
  </div>
);
