import { IconCheck } from '@tabler/icons-react';
import { Badge, Skeleton, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannelScope } from '~/shared/channelScope.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { PersonAvatar, useCustomer } from '~/shared/Person.tsx';
import { VisitorPresence, VisitorTyping } from './ConversationPresence.tsx';
import { type Conversation, useVisitor } from './queries.ts';

/**
 * The customer's avatar, with a green dot while the messenger sees them online, as chat apps
 * mark who is there.
 */
const OnlineAvatar = ({
  conversation,
  name,
  src,
}: {
  conversation: Conversation;
  name: string;
  src?: string | null;
}) => {
  const { t } = useTranslation('frontline');
  const online = useVisitor(conversation)?.isOnline;

  return (
    <span className="relative flex-none">
      <PersonAvatar name={name} src={src} />
      {online && (
        <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-success ring-2 ring-background">
          <span className="sr-only">{t('online', 'Online')}</span>
        </span>
      )}
    </span>
  );
};

/**
 * Beside the name, a resolved conversation says so. Who answers it shows on the header's bot
 * button, and an open conversation needs no word.
 */
const ConversationState = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');

  return conversation.status === 'resolved' ? (
    <Badge variant="success" size="sm">
      <IconCheck />
      {t('resolved', 'Resolved')}
    </Badge>
  ) : null;
};

/**
 * Who the conversation is with and where it came from, on two lines: the customer's avatar and
 * name, which opens them in core's side panel, and under it the integration's mark, the channel
 * and the integration, then "Typing…" while the visitor writes. A visitor core has no record of
 * reads "Visitor", as in the list, and opens nothing.
 */
export const ConversationIdentity = ({ conversation }: { conversation: Conversation }) => {
  const { open } = useOpenRecord();
  const customer = useCustomer(conversation.customerId);

  // Inside a channel its name leads the page already; across channels it says where this came in.
  const source = useChannelScope()
    ? conversation.integrationName
    : `${conversation.channelName} · ${conversation.integrationName}`;

  const name = customer.isPending ? (
    <Skeleton className="h-4 w-32" />
  ) : customer.found ? (
    <button
      type="button"
      data-panel-inline=""
      title={customer.name}
      onClick={() => open({ contentType: 'core:customer', contentId: conversation.customerId })}
      className="min-w-0 truncate rounded-sm text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {customer.name}
    </button>
  ) : (
    <span className="min-w-0 truncate text-sm font-semibold">{customer.name}</span>
  );

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <OnlineAvatar conversation={conversation} name={customer.name} src={customer.avatarUrl} />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {name}
          <ConversationState conversation={conversation} />
        </span>
        <span
          title={source}
          className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
        >
          <KindIcon
            kind={conversation.kind}
            thread={conversation.externalId}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{source}</span>
          <VisitorTyping conversation={conversation} />
          <VisitorPresence
            compact
            conversation={conversation}
            className="hidden shrink-0 @xl:flex"
          />
        </span>
      </span>
    </span>
  );
};
