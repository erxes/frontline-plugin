import { IconAlertTriangle, IconRefresh, IconRobot } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, cn, Empty, RelativeDateDisplay, Sheet, Spinner, toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PanelSkeleton } from '~/shared/Panel.tsx';
import { useChange } from '~/shared/hooks.ts';
import type { AgentRun, Conversation } from './queries.ts';

/** One searchApi or callApi call: what it asked, and why a failed one failed, in red. */
const Call = ({ call }: { call: AgentRun['calls'][number] }) => (
  <li
    className={cn(
      'flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs',
      !call.ok && 'border-destructive bg-destructive/10 text-destructive-text',
    )}
  >
    <span className="flex items-center gap-1.5 font-mono">
      {!call.ok && <IconAlertTriangle className="size-3.5 shrink-0" />}
      <span className="font-medium">{call.tool}</span>
      <span className="truncate">{call.procedure ?? call.query}</span>
      {call.status !== null && <span className="ml-auto shrink-0">{call.status}</span>}
    </span>
    {!call.ok && (call.code ?? call.message) && (
      <span>{[call.code, call.message].filter(Boolean).join(': ')}</span>
    )}
  </li>
);

/** A run: when, the model, how it ended, what the customer wrote, the answer and the calls. */
const RunItem = ({ run }: { run: AgentRun }) => {
  const { t } = useTranslation('frontline');

  return (
    <li className="flex flex-col gap-2 border-b pb-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <RelativeDateDisplay value={run.at}>
          <RelativeDateDisplay.Value value={run.at} />
        </RelativeDateDisplay>
        {run.model && <span className="font-mono">{run.model}</span>}
        {run.status === 'failed' && (
          <Badge variant="destructive" size="sm">
            {t('agent-run-failed', 'Failed')}
          </Badge>
        )}
        {run.status === 'running' && (
          <Badge variant="info" size="sm">
            {t('agent-run-running', 'Running')}
          </Badge>
        )}
        {run.handedOff !== null && (
          <Badge variant="warning" size="sm">
            {t('agent-run-handed-off', 'Handed off')}
          </Badge>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">
        <span className="text-muted-foreground">{t('agent-run-customer', 'Customer')}: </span>
        {run.text}
      </p>
      {run.answer && (
        <p className="text-sm whitespace-pre-wrap">
          <span className="text-muted-foreground">{t('agent-run-answer', 'Agent')}: </span>
          {run.answer}
        </p>
      )}
      {run.failure && <p className="text-sm text-destructive-text">{run.failure}</p>}
      {run.handedOff && (
        <p className="text-sm text-muted-foreground">
          {t('agent-run-handed-off-why', 'Handed to a person: {{reason}}', {
            reason: run.handedOff,
          })}
        </p>
      )}
      {run.calls.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={t('agent-run-calls', 'API calls')}>
          {run.calls.map((call) => (
            <Call key={call.id} call={call} />
          ))}
        </ul>
      )}
    </li>
  );
};

/** The agent's latest runs in the conversation, newest first. */
const Runs = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');

  const runs = useQuery(
    orpc.conversations.agentRuns.queryOptions({ input: { id: conversationId } }),
  );

  if (runs.error)
    return (
      <p role="alert" className="text-sm text-destructive-text">
        {runs.error.message}
      </p>
    );

  if (!runs.data) return <PanelSkeleton rows={4} />;

  if (runs.data.runs.length === 0)
    return (
      <Empty>
        <Empty.Header>
          <Empty.Media>
            <IconRobot />
          </Empty.Media>
          <Empty.Title>{t('agent-runs-none', 'No runs yet')}</Empty.Title>
          <Empty.Description>
            {t('agent-runs-none-description', 'The agent hasn’t answered this conversation.')}
          </Empty.Description>
        </Empty.Header>
      </Empty>
    );

  return (
    <ul className="flex flex-col gap-4">
      {runs.data.runs.map((run) => (
        <RunItem key={`${run.at}-${run.text}`} run={run} />
      ))}
    </ul>
  );
};

/** Restart agent: the agent forgets the conversation, and the toast says what that means. */
const Restart = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const change = useChange(orpc.conversations.agentRuns.key());

  const restart = useMutation(
    orpc.conversations.restartAgent.mutationOptions({
      ...change,
      onSuccess: () => {
        change.onSuccess();
        toast({
          title: t('agent-restarted', 'Agent restarted'),
          description:
            conversation.operator === 'bot'
              ? t(
                  'agent-restarted-bot',
                  'It forgot this conversation and starts afresh with the customer’s next message.',
                )
              : t(
                  'agent-restarted-person',
                  'It forgot this conversation. A person answers it now, so the agent waits until the bot has it again.',
                ),
        });
      },
    }),
  );

  return (
    <Button
      variant="outline"
      disabled={restart.isPending}
      onClick={() => restart.mutate({ id: conversation.id })}
    >
      {restart.isPending ? <Spinner size="sm" /> : <IconRefresh />}
      {t('agent-restart', 'Restart agent')}
    </Button>
  );
};

/** What the conversation's core agent did, with Restart agent, in a sheet the bot menu opens. */
export const AgentActivity = ({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.View size="lg">
        <Sheet.Header>
          <Sheet.Title>{t('agent-activity', 'Agent activity')}</Sheet.Title>
          <Sheet.Description className="sr-only">
            {t('agent-activity-description', 'What the agent did in this conversation')}
          </Sheet.Description>
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Content>
          <Runs conversationId={conversation.id} />
        </Sheet.Content>
        <Sheet.Footer className="flex items-center justify-end">
          <Restart conversation={conversation} />
        </Sheet.Footer>
      </Sheet.View>
    </Sheet>
  );
};
