import { IconHistory, IconRobot, IconRobotOff, IconUser } from '@tabler/icons-react';
import { Badge, Button, cn, DropdownMenu, IconTip, useFormat } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Conversation, useVisitor, useVisitorTyping } from './queries.ts';
import { AgentActivity } from './AgentActivity.tsx';
import { useSetOperator } from './changes.ts';

/**
 * The header's bot button, for a messenger conversation or one its integration's AI agent
 * answers. Its look says who answers now: the bot, through automations or the agent, until a
 * member takes over, or a person until a member lets the bot answer again; an agent then answers
 * at once what the customer wrote meanwhile. With an agent it also opens what the agent did.
 */
export const ConversationMenu = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const setOperator = useSetOperator();
  const [activity, setActivity] = useState(false);
  const bot = conversation.operator === 'bot';
  const agent = Boolean(conversation.agentId);

  const label = bot
    ? agent
      ? t('agent-answering', 'The AI agent answers')
      : t('bot-answering', 'The bot answers')
    : t('person-answering', 'A person answers');

  const giveBack = agent
    ? t('let-agent-answer', 'Let the AI agent answer')
    : t('let-bot-answer', 'Let the bot answer');

  return (
    <>
      <DropdownMenu>
        <IconTip label={label}>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                tone={bot ? undefined : 'muted'}
                size="icon"
                aria-label={label}
              >
                {bot ? <IconRobot className="text-primary" /> : <IconRobotOff />}
              </Button>
            }
          />
        </IconTip>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item
            disabled={setOperator.isPending}
            onClick={() =>
              setOperator.mutate({ ids: [conversation.id], operator: bot ? 'person' : 'bot' })
            }
          >
            {bot ? <IconUser /> : <IconRobot />}
            {bot ? t('take-over', 'Take over') : giveBack}
          </DropdownMenu.Item>
          {agent && (
            <DropdownMenu.Item onClick={() => setActivity(true)}>
              <IconHistory />
              {t('agent-activity', 'Agent activity')}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
      {agent && (
        <AgentActivity conversation={conversation} open={activity} onOpenChange={setActivity} />
      )}
    </>
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
 * and the page of the latest one. `compact`, for the conversation header whose avatar marks online,
 * keeps the visits and puts the rest in its tooltip. `className` places it.
 */
export const VisitorPresence = ({
  conversation,
  compact = false,
  className,
}: {
  conversation: Conversation;
  compact?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const visitor = useVisitor(conversation);

  if (!visitor) return null;

  const lastSeen = visitor.lastSeenAt
    ? t('last-seen', 'Last seen {{when}}', { when: format.dateTime(visitor.lastSeenAt) })
    : '';

  return (
    <p
      aria-label={t('visitor-presence', 'Visitor presence')}
      title={compact ? [lastSeen, visitor.browser.url].filter(Boolean).join(' · ') : undefined}
      className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', className)}
    >
      {compact ? null : visitor.isOnline ? (
        <Badge variant="success" size="sm">
          {t('online', 'Online')}
        </Badge>
      ) : (
        !compact && lastSeen && <span className="shrink-0">{lastSeen}</span>
      )}
      <span className="shrink-0">
        {t('visits', {
          defaultValue_one: '{{count}} visit',
          defaultValue_other: '{{count}} visits',
          count: visitor.sessionCount,
        })}
      </span>
      {!compact && visitor.browser.url && <span className="truncate">{visitor.browser.url}</span>}
    </p>
  );
};
