import { IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, IconTip, useOpenRecord } from 'erxes-ui';
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

/**
 * The conversation's tickets, as the old inbox showed its `sourceConversationIds`: a chip per
 * ticket with its number, opening it in core's side panel, then Create ticket, which drafts one
 * there with the customer, a name from their latest message and, when the conversation's channel
 * has exactly one, its pipeline. Only a member who may file tickets in some pipeline sees them.
 */
export const ConversationTickets = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { open, openNew } = useOpenRecord();
  const { messages } = useMessages(conversation.id);
  const pipelines = useQuery(choicesQuery).data?.pipelines ?? [];

  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.conversationId', op: 'eq', value: conversation.id },
      { path: 'subject.state', op: 'in', value: ['active', 'archived'] },
    ],
  };

  const tickets = useQuery({
    ...orpc.tickets.list.queryOptions({
      input: { filter: JSON.stringify(filter), sort: 'createdAt', ascending: true, limit: 20 },
    }),
    enabled: pipelines.length > 0,
  }).data?.tickets;

  if (pipelines.length === 0) return null;

  const create = () => {
    const latest = messages.findLast((message) => message.customerId && message.content.trim());
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
      {tickets?.map((ticket) => (
        <IconTip key={ticket.id} label={ticket.name}>
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
      ))}
      <Button variant="outline" size="sm" className="shrink-0" onClick={create}>
        <IconTicket />
        {t('create-ticket', 'Create ticket')}
      </Button>
    </>
  );
};
