import { IconPlus, IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, IconTip, Popover, useOpenRecord } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { TICKET_TYPE } from '~/plugin.ts';
import { choicesQuery } from '~/shared/reference.ts';
import { type Conversation, useMessages } from './queries.ts';

/** How long a ticket name taken from a message gets, cut at a word. */
const NAME_LENGTH = 80;

/** The message's text on one line, cut to `NAME_LENGTH` at the last word that fits. */
export const nameOf = (text: string) => {
  const line = text.replaceAll(/\s+/g, ' ').trim();

  if (line.length <= NAME_LENGTH) return line;

  const cut = line.slice(0, NAME_LENGTH);

  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : NAME_LENGTH)}…`;
};

/** How many of the conversation's tickets show as chips; the older ones fold under +N. */
const CHIPS = 2;

type Ticket = { id: string; name: string; number: string | null };

/** A ticket by its number, or its name when its pipeline doesn't number tickets; it opens in core's panel. */
export const TicketChip = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  return (
    <IconTip label={ticket.name}>
      <Button
        variant="secondary"
        size="xs"
        className="shrink-0"
        aria-label={t('open-ticket', 'Open ticket {{name}}', {
          name: ticket.number ?? ticket.name,
        })}
        onClick={() => open({ contentType: TICKET_TYPE, contentId: ticket.id })}
      >
        <IconTicket />
        {ticket.number ?? <span className="max-w-24 truncate">{ticket.name}</span>}
      </Button>
    </IconTip>
  );
};

/** The conversation's tickets, active and archived, oldest first. */
const useConversationTickets = (conversationId: string) => {
  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.conversationId', op: 'eq', value: conversationId },
      { path: 'subject.state', op: 'in', value: ['active', 'archived'] },
    ],
  };

  return (
    useQuery(
      orpc.tickets.list.queryOptions({
        input: { filter: JSON.stringify(filter), sort: 'createdAt', ascending: true, limit: 50 },
      }),
    ).data?.tickets ?? []
  );
};

/** The conversation's tickets, oldest first: the newest as chips, the rest under +N. */
export const TicketChips = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');
  const tickets = useConversationTickets(conversationId);

  const older = tickets.slice(0, -CHIPS);

  return (
    <>
      {older.length > 0 && (
        <Popover>
          <Popover.Trigger
            render={
              <Button
                variant="secondary"
                size="xs"
                className="shrink-0"
                aria-label={t('more-tickets', '{{count}} more tickets', { count: older.length })}
              >
                +{older.length}
              </Button>
            }
          />
          <Popover.Content align="end" className="w-auto">
            <div className="flex flex-wrap gap-1">
              {older.map((ticket) => (
                <TicketChip key={ticket.id} ticket={ticket} />
              ))}
            </div>
          </Popover.Content>
        </Popover>
      )}
      {tickets.slice(-CHIPS).map((ticket) => (
        <TicketChip key={ticket.id} ticket={ticket} />
      ))}
    </>
  );
};

/** A ticket in the header's list: its number, if its pipeline numbers them, and its name. */
const TicketRow = ({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start"
      aria-label={t('open-ticket', 'Open ticket {{name}}', { name: ticket.number ?? ticket.name })}
      onClick={() => {
        onOpen();
        open({ contentType: TICKET_TYPE, contentId: ticket.id });
      }}
    >
      <IconTicket />
      {ticket.number && <span className="shrink-0 text-muted-foreground">{ticket.number}</span>}
      <span className="min-w-0 truncate">{ticket.name}</span>
    </Button>
  );
};

/**
 * The conversation's tickets, as the old inbox showed its `sourceConversationIds`, behind one
 * header button: with none it is Create ticket; with some it counts them and lists them, each
 * opening in core's side panel, above Create ticket. A new ticket is drafted there with the
 * customer, a name from their latest message and, when the conversation's channel has exactly
 * one, its pipeline. It waits for the messages, so the name is there. Only a member who may file
 * tickets in some pipeline sees it.
 */
export const ConversationTickets = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const thread = useMessages(conversation.id);
  const pipelines = useQuery(choicesQuery).data?.pipelines ?? [];
  const tickets = useConversationTickets(conversation.id);
  const [listed, setListed] = useState(false);

  if (pipelines.length === 0) return null;

  const create = () => {
    const latest = thread.messages.findLast(
      (message) => message.customerId && message.content.trim(),
    );

    const inChannel = pipelines.filter((row) => row.channelId === conversation.channelId);

    setListed(false);
    openNew(TICKET_TYPE, {
      conversationId: conversation.id,
      customerId: conversation.customerId,
      name: nameOf(latest?.content ?? ''),
      pipelineId: inChannel.length === 1 ? inChannel[0]?.id : undefined,
    });
  };

  if (tickets.length === 0)
    return (
      <IconTip label={t('create-ticket', 'Create ticket')}>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={t('create-ticket', 'Create ticket')}
          disabled={thread.isPending}
          onClick={create}
        >
          <IconPlus />
          {/* A narrow header keeps the icon, named on hover and by its label. */}
          <span aria-hidden className="hidden @3xl:inline">
            {t('ticket', 'Ticket')}
          </span>
        </Button>
      </IconTip>
    );

  const label = t('conversation-tickets', 'Tickets: {{count}}', { count: tickets.length });

  return (
    <Popover open={listed} onOpenChange={setListed}>
      <IconTip label={label}>
        <Popover.Trigger
          render={
            <Button variant="outline" size="sm" className="shrink-0" aria-label={label}>
              <IconTicket />
              {tickets.length}
            </Button>
          }
        />
      </IconTip>
      <Popover.Content align="end" className="w-72">
        <div className="flex flex-col gap-0.5">
          {tickets.toReversed().map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onOpen={() => setListed(false)} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={thread.isPending}
            onClick={create}
          >
            <IconPlus />
            {t('create-ticket', 'Create ticket')}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
};
