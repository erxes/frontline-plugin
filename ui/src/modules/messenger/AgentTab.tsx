import { orpc as core } from '@erxes/core-contract/client';
import { IconChevronRight, IconRobot } from '@tabler/icons-react';
import { useIntegration, useIntegrationChange } from '@/inbox/queries.ts';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
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
import { PanelSkeleton, ReadOnly } from '~/shared/Panel.tsx';

/** The Select's value for no agent. Agent ids are core's 17-character ids, never this. */
const OFF = 'off';

/** Core's page where admins make agents. */
const AGENTS_PATH = '/settings/agents';

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

/** The picker of the messenger's agent, or Off; a pick saves at once. */
const AgentPicker = ({
  integration,
}: {
  integration: { id: string; agentId: string | null; canManage: boolean };
}) => {
  const { t } = useTranslation('frontline');
  const agents = useQuery(core.agents.list.queryOptions());
  const change = useIntegrationChange();

  const setAgent = useMutation(
    orpc.integrations.messenger.setAgent.mutationOptions({
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

  if (agents.data.data.length === 0)
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
      </ReadOnly>
      <p className="px-3 text-sm text-muted-foreground">
        {t(
          'agent-hint',
          'It answers each conversation until a member replies or is assigned, or it has no answer.',
        )}
      </p>
      <MakeAgent />
    </PanelSection>
  );
};

/** The Bot tab of a messenger: the core agent that answers its visitors. */
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

  if (integration.data.kind !== 'messenger')
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t('bot-agent-messenger-only', 'An agent answers website messenger conversations only.')}
      </p>
    );

  return <AgentPicker integration={integration.data} />;
};
