import { IconPlus, IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, IconTip, Popover, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { TICKET_TYPE } from '~/plugin.ts';
import { choicesQuery } from '~/shared/reference.ts';
import { type Conversation, useMessages } from './queries.ts';

/** How long a ticket name taken from a message gets, cut at a word. */
const NAME_LENGTH = 80;

/** The message's text on one line, cut to `NAME_LENGTH` at the last word that fits. */
const nameOf = (text: string) => {
  const line = text.replaceAll(/\s+/g, ' ').trim();

  if (line.length <= NAME_LENGTH) return line;

  const cut = line.slice(0, NAME_LENGTH);

  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : NAME_LENGTH)}…`;
};

/** How many of the conversation's tickets show as chips; the older ones fold under +N. */
const CHIPS = 2;

type Ticket = { id: string; name: string; number: string | null };

/** A ticket by its number, or its name when its pipeline doesn't number tickets; it opens in core's panel. */
const TicketChip = ({ ticket }: { ticket: Ticket }) => {
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

/** The conversation's tickets, oldest first: the newest as chips, the rest under +N. */
const TicketChips = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');

  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.conversationId', op: 'eq', value: conversationId },
      { path: 'subject.state', op: 'in', value: ['active', 'archived'] },
    ],
  };

  const tickets =
    useQuery(
      orpc.tickets.list.queryOptions({
        input: { filter: JSON.stringify(filter), sort: 'createdAt', ascending: true, limit: 50 },
      }),
    ).data?.tickets ?? [];

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

/**
 * The conversation's tickets, as the old inbox showed its `sourceConversationIds`, each opening
 * in core's side panel, then Create ticket, which drafts one there with the customer, a name from
 * their latest message and, when the conversation's channel has exactly one, its pipeline. It
 * waits for the messages, so the name is there. Only a member who may file tickets in some
 * pipeline sees them.
 */
export const ConversationTickets = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const thread = useMessages(conversation.id);
  const pipelines = useQuery(choicesQuery).data?.pipelines ?? [];

  if (pipelines.length === 0) return null;

  const create = () => {
    const latest = thread.messages.findLast(
      (message) => message.customerId && message.content.trim(),
    );

    const inChannel = pipelines.filter((row) => row.channelId === conversation.channelId);

    openNew(TICKET_TYPE, {
      conversationId: conversation.id,
      customerId: conversation.customerId,
      name: nameOf(latest?.content ?? ''),
      pipelineId: inChannel.length === 1 ? inChannel[0]?.id : undefined,
    });
  };

  return (
    <>
      <TicketChips conversationId={conversation.id} />
      {/* "Ticket" on the button leaves the crowded header room for the customer's name. */}
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
    </>
  );
};
