import type {
  Connected as ConnectReply,
  Identity,
  TicketForms as TicketFormsReply,
  VisitorConversation,
  VisitorMessage,
  VisitorMessages,
  VisitorSurvey,
  VisitorTicket,
} from '@frontline/api/messenger';
import type { Jsonify } from 'type-fest';
import type { Article, ArticleSummary, Page, Reactions, Topic } from '../articles/api.ts';
import { bearer, publicApi, uploadFile } from '../shared/http.ts';

/** What `/connect` answers, as JSON carries it. */
export type Connected = Jsonify<ConnectReply>;

export type Settings = Connected['messenger'];

export type Conversation = Jsonify<VisitorConversation>;

export type Message = Jsonify<VisitorMessage>;

/** A page of a conversation's messages, newest first, and the cursor for earlier ones. */
export type MessagePage = Jsonify<VisitorMessages>;

export type Attachment = Message['attachments'][number];

export type { Identity };

declare global {
  interface Window {
    /**
     * The visitor the website names before the script loads: an `email`, `phone` or `userId`
     * and its `hash`, signed on the website's server. Unsigned, an email or phone only fills in
     * the visitor's own contact. `/connect` checks it.
     */
    frontlineMessenger?: Identity;
  }
}

export type TicketForms = Jsonify<TicketFormsReply>;

/** A field the organisation adds to its tickets, as one ticket form asks it. */
export type Property = TicketForms['pipelines'][number]['properties'][number];

export type Ticket = Jsonify<VisitorTicket>;

/** A survey sent in a message, as the visitor votes on it. */
export type Survey = Jsonify<VisitorSurvey>;

/** The address of the core file an attachment names, as core's own pages link it. */
const FILE = /\/files\/([\w-]+)\/download$/;

/** The messenger's signed-out API, `/api/public/messenger` under `base`, for one messenger. */
export const messengerApi = (base: URL, key: string) => {
  const http = publicApi(base);

  /** What the visitor with `token` calls. */
  const as = (token: string) => http.headers(bearer(token));

  /** A POST about one conversation that answers nothing. */
  const notify = async (token: string, id: string, what: string) => {
    await as(token)
      .post(undefined, `conversations/${encodeURIComponent(id)}/${what}`)
      .res();
  };

  return {
    key,
    settings: () =>
      http.get(`settings?key=${encodeURIComponent(key)}`).json<Pick<Connected, 'messenger'>>(),
    /** Connects the visitor, as who they typed, else as whom the website names. */
    connect: (token: string | null, typed?: Identity) =>
      http
        .post(
          {
            key,
            token: token ?? undefined,
            identity: typed ?? window.frontlineMessenger,
            browser: {
              url: location.href,
              hostname: location.hostname,
              language: navigator.language,
              userAgent: navigator.userAgent,
            },
          },
          'connect',
        )
        .json<Connected>(),
    conversations: (token: string) => as(token).get('conversations').json<Conversation[]>(),
    messages: (token: string, id: string, cursor?: string) =>
      as(token)
        .get(
          `conversations/${encodeURIComponent(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        )
        .json<MessagePage>(),
    send: (token: string, body: { conversationId?: string; content: string; files: string[] }) =>
      as(token).post(body, 'messages').json<Message>(),
    read: (token: string, id: string) => notify(token, id, 'read'),
    typing: (token: string, id: string) => notify(token, id, 'typing'),
    askForPerson: (token: string, id: string) => notify(token, id, 'person'),
    upload: (token: string, file: File) => uploadFile(as(token), 'files', file),
    /** Where the visitor opens an attachment: core's files through the messenger, others as they are. */
    fileUrl: (token: string, url: string) => {
      const id = FILE.exec(url)?.[1];

      return id ? new URL(`files/${id}?token=${encodeURIComponent(token)}`, base).href : url;
    },
    stream: (token: string) =>
      new EventSource(new URL(`stream?token=${encodeURIComponent(token)}`, base)),
    ticketForms: (token: string) => as(token).get('tickets/forms').json<TicketForms>(),
    tickets: (token: string) => as(token).get('tickets').json<Ticket[]>(),
    fileTicket: (token: string, body: NewTicket) => as(token).post(body, 'tickets').json<Ticket>(),
    /** The API as the visitor with `token`, for the calls a lazy chunk makes itself. */
    as,
    knowledgeBase: (token: string) => as(token).get('knowledge-base').json<Topic>(),
    categoryArticles: (token: string, id: string, page: number) =>
      as(token)
        .get(`knowledge-base/categories/${encodeURIComponent(id)}/articles?page=${page}`)
        .json<Page>(),
    /** One article, with its reactions and how the visitor sets theirs. */
    article: async (token: string, id: string): Promise<Article> => {
      const path = `knowledge-base/articles/${encodeURIComponent(id)}`;

      const { reactions, ...article } = await as(token)
        .get(path)
        .json<Article & { reactions: Reactions }>();

      const react = (choice: string | null) =>
        as(token).post({ choice }, `${path}/reaction`).json<Reactions>();

      return reactions.length > 0 ? { ...article, reactable: { reactions, react } } : article;
    },
    searchArticles: (token: string, term: string) =>
      as(token)
        .get(`knowledge-base/search?q=${encodeURIComponent(term)}`)
        .json<ArticleSummary[]>(),
  };
};

/** What a visitor fills in to file a ticket, as `/tickets` takes it. */
export type NewTicket = {
  pipelineId: string;
  name: string;
  description: string;
  files: string[];
  tagIds: string[];
  propertiesData: Record<string, unknown>;
};

export type MessengerApi = ReturnType<typeof messengerApi>;
