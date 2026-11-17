import type {
  Connected as ConnectReply,
  TicketForms as TicketFormsReply,
  VisitorConversation,
  VisitorMessage,
  VisitorTicket,
} from '@frontline/api/messenger';
import type { Jsonify } from 'type-fest';
import type { Article, Topic } from '../articles/api.ts';
import { bearer, publicApi, uploadFile } from '../shared/http.ts';

/** What `/connect` answers, as JSON carries it. */
export type Connected = Jsonify<ConnectReply>;

export type Settings = Connected['messenger'];

export type Conversation = Jsonify<VisitorConversation>;

export type Message = Jsonify<VisitorMessage>;

export type Attachment = Message['attachments'][number];

export type Identity = { email?: string; phone?: string; firstName?: string };

export type TicketForms = Jsonify<TicketFormsReply>;

/** A field the organisation adds to its tickets, as one ticket form asks it. */
export type Property = TicketForms['pipelines'][number]['properties'][number];

export type Ticket = Jsonify<VisitorTicket>;

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
    connect: (token: string | null, identity?: Identity) =>
      http
        .post(
          {
            key,
            token: token ?? undefined,
            identity,
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
    messages: (token: string, id: string) =>
      as(token)
        .get(`conversations/${encodeURIComponent(id)}/messages`)
        .json<Message[]>(),
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
    knowledgeBase: (token: string) => as(token).get('knowledge-base').json<Topic>(),
    article: (token: string, id: string) =>
      as(token)
        .get(`knowledge-base/articles/${encodeURIComponent(id)}`)
        .json<Article>(),
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
