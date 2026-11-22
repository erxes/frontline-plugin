import { IconDots, IconRobot, IconUser } from '@tabler/icons-react';
import { Badge, Button, cn, DropdownMenu, useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { type Conversation, useVisitor, useVisitorTyping } from './queries.ts';
import { useSetOperator } from './changes.ts';

/**
 * The header's overflow menu for a messenger conversation: who answers it, the bot through
 * automations until a member takes it over, and Let the bot answer gives it back.
 */
export const ConversationMenu = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const setOperator = useSetOperator();
  const bot = conversation.operator === 'bot';

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('conversation-actions', 'Conversation actions')}
          >
            <IconDots />
          </Button>
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item
          disabled={setOperator.isPending}
          onClick={() =>
            setOperator.mutate({ ids: [conversation.id], operator: bot ? 'person' : 'bot' })
          }
        >
          {bot ? <IconUser /> : <IconRobot />}
          {bot ? t('take-over', 'Take over') : t('let-bot-answer', 'Let the bot answer')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** "Typing…" beside the customer's name while the visitor writes. */
export const VisitorTyping = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');

  return useVisitorTyping(conversation.id) ? (
    <span className="text-xs text-muted-foreground">{t('visitor-typing', 'Typing…')}</span>
  ) : null;
};

/**
 * What the messenger knows of the visitor, as one line: online or last seen, how many visits,
 * and the page of the latest one. `className` places it, in the conversation header or a panel.
 */
export const VisitorPresence = ({
  conversation,
  className,
}: {
  conversation: Conversation;
  className?: string;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const visitor = useVisitor(conversation);

  if (!visitor) return null;

  return (
    <p
      aria-label={t('visitor-presence', 'Visitor presence')}
      className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', className)}
    >
      {visitor.isOnline ? (
        <Badge variant="success" size="sm">
          {t('online', 'Online')}
        </Badge>
      ) : (
        visitor.lastSeenAt && (
          <span className="shrink-0">
            {t('last-seen', 'Last seen {{when}}', { when: format.dateTime(visitor.lastSeenAt) })}
          </span>
        )
      )}
      <span className="shrink-0">
        {t('visits', {
          defaultValue_one: '{{count}} visit',
          defaultValue_other: '{{count}} visits',
          count: visitor.sessionCount,
        })}
      </span>
      {visitor.browser.url && <span className="truncate">{visitor.browser.url}</span>}
    </p>
  );
};
