import { orpc as core } from '@erxes/core-contract/client';
import { IconAlertTriangle, IconChevronRight, IconClockPlay, IconRobot } from '@tabler/icons-react';
import { useIntegration, useIntegrationChange } from '@/inbox/queries.ts';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  buttonVariants,
  Empty,
  PanelField,
  PanelSection,
  Select,
  type TRecordSlotProps,
  toast,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { takesNotesOnly } from '~/shared/kinds.tsx';
import { PanelSkeleton, ReadOnly } from '~/shared/Panel.tsx';
import { useSpanText } from '~/shared/spanText.ts';

/** The Select's value for no agent. Agent ids are core's 17-character ids, never this. */
const OFF = 'off';

/** Core's page where admins make agents. */
const AGENTS_PATH = '/settings/agents';

/** The templates whose agents take orders or bookings, which they do through a portal. */
const SELLING_TEMPLATES = new Set<string | null>(['shop', 'hotel', 'tours']);

/** Says a selling agent can't take orders or bookings here without a portal, and links its settings. */
const NoPortal = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation('frontline');

  return (
    <Alert variant="warning" className="mx-3 w-auto">
      <IconAlertTriangle />
      <Alert.Description>
        <Link to={`${AGENTS_PATH}/${agentId}`} className="underline underline-offset-2">
          {t(
            'bot-agent-no-portal',
            'This agent has no portal: it can’t take orders or bookings here.',
          )}
        </Link>
      </Alert.Description>
    </Alert>
  );
};

const MakeAgent = () => {
  const { t } = useTranslation('frontline');

  return (
    <Link
      to={AGENTS_PATH}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'justify-start' })}
    >
      {t('bot-agent-make', 'Make an agent')}
      <IconChevronRight />
    </Link>
  );
};

const NoAgents = () => {
  const { t } = useTranslation('frontline');

  return (
    <Empty variant="outline" className="m-3">
      <Empty.Header>
        <Empty.Media>
          <IconRobot />
        </Empty.Media>
        <Empty.Title>{t('bot-agent-none', 'No agents yet')}</Empty.Title>
        <Empty.Description>
          {t('bot-agent-none-description', 'Make one in Settings › Agents, then pick it here.')}
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <MakeAgent />
      </Empty.Content>
    </Empty>
  );
};

/** The waits a member picks from before the agent answers again. */
const TAKE_BACK_MINUTES = [15, 60, 240, 1440, 4320];

/**
 * How long a customer waits on a person before the agent answers again, or Never; a pick saves
 * at once.
 */
const TakeBack = ({
  minutes,
  onChange,
}: {
  minutes: number | null;
  onChange: (minutes: number | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const span = useSpanText();
  const label = t('bot-agent-take-back', 'Answers again after');

  const options = [...new Set([...TAKE_BACK_MINUTES, ...(minutes ? [minutes] : [])])].toSorted(
    (a, b) => a - b,
  );

  return (
    <PanelField icon={IconClockPlay} label={label} cell={false}>
      <Select
        value={minutes ? String(minutes) : OFF}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next === OFF ? null : Number(next));
        }}
      >
        <Select.Trigger variant="flush" aria-label={label}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={OFF}>{t('bot-agent-take-back-never', 'Never')}</Select.Item>
          {options.map((option) => (
            <Select.Item key={option} value={String(option)}>
              {span(option * 60)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </PanelField>
  );
};

/** When the agent answers, and what each kind of integration leaves to people. */
const AgentHints = ({ kind, agentId }: { kind: string; agentId: string | null }) => {
  const { t } = useTranslation('frontline');

  const kindHints: Record<string, string> = {
    facebook: t(
      'bot-agent-meta-hint',
      'It answers direct messages. Comments on posts, and taps on the page bot’s buttons, wait for a member or an automation.',
    ),
    telegram: t('bot-agent-telegram-hint', 'It answers private chats, not groups.'),
    discord: t('bot-agent-discord-hint', 'It answers direct messages and mentions of the bot.'),
    mail: t('bot-agent-mail-hint', 'It skips auto-replies, mailing lists and bulk mail.'),
  };

  const kindHint = kindHints[kind === 'instagram' ? 'facebook' : kind];

  return (
    <>
      <p className="px-3 text-sm text-muted-foreground">
        {t(
          'bot-agent-hint',
          'It answers each conversation until a member replies or is assigned, or it has no answer.',
        )}
      </p>
      {agentId && (
        <p className="px-3 text-sm text-muted-foreground">
          {t(
            'bot-agent-take-back-hint',
            'It answers again when a member lets it from the conversation’s bot button, when the conversation is resolved, or when the customer waits on a person this long.',
          )}
        </p>
      )}
      {kindHint && <p className="px-3 text-sm text-muted-foreground">{kindHint}</p>}
    </>
  );
};

/** The picker of the integration's agent, or Off, and its wait; a pick saves at once. */
const AgentPicker = ({
  integration,
}: {
  integration: {
    id: string;
    kind: string;
    agentId: string | null;
    agentTakeBackMinutes: number | null;
    canManage: boolean;
  };
}) => {
  const { t } = useTranslation('frontline');
  const agents = useQuery(core.agents.list.queryOptions());
  const change = useIntegrationChange();

  const setAgent = useMutation(
    orpc.integrations.setAgent.mutationOptions({
      ...change,
      onSuccess: () => {
        change.onSuccess();
        toast({ title: t('bot-agent-saved', 'Bot saved') });
      },
    }),
  );

  if (agents.error)
    return (
      <p role="alert" className="px-3 text-sm text-destructive-text">
        {agents.error.message}
      </p>
    );

  if (!agents.data) return <PanelSkeleton rows={2} />;

  if (agents.data.data.length === 0) return <NoAgents />;

  const chosen = agents.data.data.find((agent) => agent.id === integration.agentId);

  return (
    <PanelSection title={t('bot-agent', 'Agent')} icon={IconRobot}>
      <ReadOnly when={!integration.canManage}>
        <PanelField icon={IconRobot} label={t('bot-agent-answers', 'Answers')} cell={false}>
          <Select
            value={integration.agentId ?? OFF}
            onValueChange={(next) => {
              if (typeof next !== 'string') return;

              setAgent.mutate({ id: integration.id, agentId: next === OFF ? null : next });
            }}
          >
            <Select.Trigger variant="flush" aria-label={t('bot-agent', 'Agent')}>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={OFF}>{t('bot-agent-off', 'Off')}</Select.Item>
              {agents.data.data.map((agent) => (
                <Select.Item key={agent.id} value={agent.id}>
                  {agent.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </PanelField>
        {integration.agentId && (
          <TakeBack
            minutes={integration.agentTakeBackMinutes}
            onChange={(takeBackMinutes) => setAgent.mutate({ id: integration.id, takeBackMinutes })}
          />
        )}
      </ReadOnly>
      {chosen && SELLING_TEMPLATES.has(chosen.template) && !chosen.portalId && (
        <NoPortal agentId={chosen.id} />
      )}
      <AgentHints kind={integration.kind} agentId={integration.agentId} />
      <MakeAgent />
    </PanelSection>
  );
};

/** The Bot tab of an integration that chats or mails: the core agent that answers it. */
export const AgentTab = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const integration = useIntegration(contentId);

  if (integration.error)
    return (
      <p role="alert" className="p-3 text-sm text-destructive-text">
        {integration.error.message}
      </p>
    );

  if (!integration.data) return <PanelSkeleton rows={2} />;

  if (takesNotesOnly(integration.data.kind))
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t('bot-agent-kinds', 'An agent answers chats and email, not calls.')}
      </p>
    );

  return <AgentPicker integration={integration.data} />;
};
