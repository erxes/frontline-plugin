import { useEffect, useState } from 'preact/hooks';
import type { MessengerApi, Settings, Ticket, TicketForms } from '../api.ts';
import { Identify } from '../Composer.tsx';
import { timeOf } from '../hours.ts';
import { Bar, Files, Loading } from '../Thread.tsx';
import { messageOf } from '../../shared/uploads.tsx';
import type { MessengerState } from '../useMessenger.ts';
import { TicketForm } from './TicketForm.tsx';
import styles from './tickets.css?inline';

/** Status types 4 and 5 are resolved and closed, 6 cancelled. */
const toneOf = (statusType: number) =>
  statusType === 6 ? 'fl-pill fl-muted' : statusType >= 4 ? 'fl-pill fl-done' : 'fl-pill';

/** The visitor's tickets, newest first, each opening to what they wrote and the files. */
const TicketList = ({
  tickets,
  settings,
  urlOf,
}: {
  tickets: Ticket[];
  settings: Settings;
  urlOf: (url: string) => string;
}) =>
  tickets.length === 0 ? (
    <p class="fl-empty">You have no tickets yet.</p>
  ) : (
    <ul class="fl-tickets" aria-label="Your tickets">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <details>
            <summary>
              <span class="fl-preview">
                {ticket.number && `${ticket.number} `}
                {ticket.name}
              </span>
              <span class={toneOf(ticket.statusType)}>{ticket.status}</span>
            </summary>
            <dl class="fl-hours">
              <div>
                <dt>Topic</dt>
                <dd>{ticket.pipeline}</dd>
              </div>
              <div>
                <dt>Filed</dt>
                <dd>{timeOf(ticket.createdAt, settings.language)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{timeOf(ticket.statusChangedAt, settings.language)}</dd>
              </div>
            </dl>
            {ticket.description && <p>{ticket.description}</p>}
            {ticket.attachments.length > 0 && <Files files={ticket.attachments} urlOf={urlOf} />}
          </details>
        </li>
      ))}
    </ul>
  );

/** What the visitor reads once they filed a ticket: its number, to copy, and where it goes on. */
const Filed = ({ ticket }: { ticket: Ticket }) => {
  const [copied, setCopied] = useState(false);
  const { number } = ticket;

  return (
    <div class="fl-filed" role="status">
      <p>
        {number ? `Ticket ${number} is filed.` : 'Your ticket is filed.'} Its status shows here as
        the team works on it.
      </p>
      {number && (
        <button
          type="button"
          class="fl-link"
          onClick={() =>
            void navigator.clipboard.writeText(number).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy the number'}
        </button>
      )}
    </div>
  );
};

/**
 * The visitor's tickets and the forms they file new ones with, loaded when the tab opens and
 * again whenever the stream says one of their tickets changed (`version`).
 */
const useTickets = (api: MessengerApi, token: string | undefined, version: number) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [forms, setForms] = useState<TicketForms | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let live = true;

    const load = async () => {
      try {
        const [list, offered] = await Promise.all([api.tickets(token), api.ticketForms(token)]);

        if (!live) return;

        setTickets(list);
        setForms(offered);
      } catch (failure) {
        if (live) setError(messageOf(failure));
      }
    };

    void load();

    return () => {
      live = false;
    };
  }, [api, token, version]);

  const filed = (ticket: Ticket) =>
    setTickets((list) => [ticket, ...list.filter((each) => each.id !== ticket.id)]);

  return { tickets, forms, error, filed };
};

/**
 * The tickets tab: what the visitor filed through this messenger and how far each got, and a
 * form to file another. The team answers by email or phone, so the visitor leaves one first.
 */
export const Tickets = ({
  api,
  messenger,
  onBack,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  onBack: () => void;
}) => {
  const { settings, session, connect, ticketsChanged } = messenger;
  const token = session?.token;
  const { tickets, forms, error, filed } = useTickets(api, token, ticketsChanged);
  const [filing, setFiling] = useState(false);
  const [justFiled, setJustFiled] = useState<Ticket | null>(null);

  if (!settings || !token) return null;

  return (
    <div class="fl-thread">
      {/* The tab's own styles come with its chunk, so the messenger's script stays small. */}
      <style>{styles}</style>
      <Bar settings={settings} onBack={filing ? () => setFiling(false) : onBack} />
      <div class="fl-scroll fl-body fl-flat">
        {error && (
          <p class="fl-error" role="alert">
            {error}
          </p>
        )}
        {filing && !session.identified ? (
          <Identify onSubmit={connect} />
        ) : filing && forms ? (
          <TicketForm
            api={api}
            token={token}
            forms={forms}
            onFiled={(ticket) => {
              filed(ticket);
              setJustFiled(ticket);
              setFiling(false);
            }}
          />
        ) : !forms && !error ? (
          <Loading />
        ) : (
          <>
            {justFiled && <Filed ticket={justFiled} />}
            {forms && forms.pipelines.length > 0 && (
              <button
                type="button"
                class="fl-primary"
                onClick={() => {
                  setJustFiled(null);
                  setFiling(true);
                }}
              >
                File a ticket
              </button>
            )}
            <TicketList
              tickets={tickets}
              settings={settings}
              urlOf={(url) => api.fileUrl(token, url)}
            />
          </>
        )}
      </div>
    </div>
  );
};
