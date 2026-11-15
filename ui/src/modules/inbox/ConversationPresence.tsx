import { IconRobot, IconUser } from '@tabler/icons-react';
import { Badge, Button, useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { type Conversation, useSetOperator, useVisitor, useVisitorTyping } from './queries.ts';

/**
 * Who answers a messenger conversation: the bot, through automations, until a member takes it
 * over; Let the bot answer gives it back.
 */
export const OperatorButton = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const setOperator = useSetOperator();
  const bot = conversation.operator === 'bot';

  return (
    <Button
      variant="outline"
      disabled={setOperator.isPending}
      onClick={() =>
        setOperator.mutate({ ids: [conversation.id], operator: bot ? 'person' : 'bot' })
      }
    >
      {bot ? <IconUser /> : <IconRobot />}
      {bot ? t('take-over', 'Take over') : t('let-bot-answer', 'Let the bot answer')}
    </Button>
  );
};

/**
 * What the messenger knows of the visitor: online or last seen, how many visits, the page of the
 * latest one, and whether they are typing now.
 */
export const VisitorPresence = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const visitor = useVisitor(conversation.id);
  const typing = useVisitorTyping(conversation.id);

  if (!visitor) return null;

  return (
    <p
      aria-label={t('visitor-presence', 'Visitor presence')}
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      {visitor.isOnline ? (
        <Badge variant="success">{t('online', 'Online')}</Badge>
      ) : (
        visitor.lastSeenAt && (
          <span>
            {t('last-seen', 'Last seen {{when}}', { when: format.dateTime(visitor.lastSeenAt) })}
          </span>
        )
      )}
      <span>
        {t('visits', {
          defaultValue_one: '{{count}} visit',
          defaultValue_other: '{{count}} visits',
          count: visitor.sessionCount,
        })}
      </span>
      {visitor.browser.url && <span className="truncate">{visitor.browser.url}</span>}
      {typing && <span className="text-foreground">{t('visitor-typing', 'Typing…')}</span>}
    </p>
  );
};
