import { Input, Label, Skeleton, Switch, Table } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { Field } from '../shared/SidePanel.tsx';
import {
  type Pipeline,
  useCanManage,
  usePipeline,
  usePipelineRoute,
  usePipelineUpdate,
} from './queries.ts';

/** Critical first: the order a support lead reads the promises in. */
const PRIORITIES = [4, 3, 2, 1, 0] as const;

type Hours = { firstResponse: string; resolution: string };

type Draft = { enabled: boolean; warnBefore: string; rules: Record<number, Hours> };

const useSlaDraft = draftsOf<Draft>();

const toHours = (minutes: number | undefined) =>
  minutes ? (Math.round((minutes / 60) * 100) / 100).toString() : '';

const toMinutes = (hours: string) => {
  const value = Number(hours);

  return hours && value > 0 ? Math.round(value * 60) : undefined;
};

const draftOf = ({ slaPolicy }: Pipeline): Draft => ({
  enabled: slaPolicy?.enabled ?? false,
  warnBefore: toHours(slaPolicy?.warnBeforeMinutes),
  rules: Object.fromEntries(
    PRIORITIES.map((priority) => {
      const rule = slaPolicy?.rules.find((item) => item.priority === priority);

      return [
        priority,
        {
          firstResponse: toHours(rule?.firstResponseMinutes),
          resolution: toHours(rule?.resolutionMinutes),
        },
      ];
    }),
  ),
});

/** One row per priority: hours to the first response and to the resolution. */
const RulesTable = ({
  rules,
  onChange,
}: {
  rules: Record<number, Hours>;
  onChange: (rules: Record<number, Hours>) => void;
}) => {
  const { t } = useTranslation('frontline');

  const priorities: Record<number, string> = {
    4: t('critical', 'Critical'),
    3: t('high', 'High'),
    2: t('medium', 'Medium'),
    1: t('minor', 'Minor'),
    0: t('no-priority', 'No priority'),
  };

  const setHours = (priority: number, patch: Partial<Hours>) =>
    onChange({
      ...rules,
      [priority]: { firstResponse: '', resolution: '', ...rules[priority], ...patch },
    });

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.Head>{t('priority', 'Priority')}</Table.Head>
          <Table.Head>{t('pipeline-sla-first-response', 'First response (hours)')}</Table.Head>
          <Table.Head>{t('pipeline-sla-resolution', 'Resolution (hours)')}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {PRIORITIES.map((priority) => (
          <Table.Row key={priority}>
            <Table.Cell>{priorities[priority]}</Table.Cell>
            <Table.Cell>
              <Input
                type="number"
                min={0}
                step={0.25}
                aria-label={t('sla-first-response-for', 'First response for {{priority}}', {
                  priority: priorities[priority],
                })}
                value={rules[priority]?.firstResponse ?? ''}
                onChange={(event) => setHours(priority, { firstResponse: event.target.value })}
              />
            </Table.Cell>
            <Table.Cell>
              <Input
                type="number"
                min={0}
                step={0.25}
                aria-label={t('sla-resolution-for', 'Resolution for {{priority}}', {
                  priority: priorities[priority],
                })}
                value={rules[priority]?.resolution ?? ''}
                onChange={(event) => setHours(priority, { resolution: event.target.value })}
              />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};

/** The switch, then the promises and the warning when it is on. */
const SlaFields = ({
  value,
  onChange,
}: {
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sla-enabled">{t('pipeline-sla-enabled', 'Keep an SLA')}</Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'pipeline-sla-description',
              'Each priority promises a first response and a resolution time.',
            )}
          </p>
        </div>
        <Switch
          id="sla-enabled"
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </div>
      {value.enabled && (
        <>
          <RulesTable rules={value.rules} onChange={(rules) => onChange({ rules })} />
          <p className="text-xs text-muted-foreground">
            {t('pipeline-sla-empty-row', 'Leave a row empty to keep no promise for that priority.')}
          </p>
          <Field
            id="sla-warn-before"
            label={t('pipeline-sla-warn-before', 'Warn before (hours)')}
            hint={t(
              'pipeline-sla-warn-description',
              'How long before a due time the warning comes.',
            )}
          >
            <Input
              id="sla-warn-before"
              type="number"
              min={0}
              step={0.25}
              value={value.warnBefore}
              onChange={(event) => onChange({ warnBefore: event.target.value })}
            />
          </Field>
        </>
      )}
    </>
  );
};

const SlaForm = ({ pipeline, canManage }: { pipeline: Pipeline; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const draft = useSlaDraft(pipeline.id, draftOf(pipeline));
  const { enabled, warnBefore, rules } = draft.value;
  const update = usePipelineUpdate(draft.clear);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({
      id: pipeline.id,
      slaPolicy: {
        enabled,
        warnBeforeMinutes: toMinutes(warnBefore),
        rules: PRIORITIES.map((priority) => ({
          priority,
          firstResponseMinutes: toMinutes(rules[priority]?.firstResponse ?? ''),
          resolutionMinutes: toMinutes(rules[priority]?.resolution ?? ''),
        })),
      },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 md:max-w-2xl">
      <fieldset disabled={!canManage} className="flex flex-col gap-4">
        <SlaFields value={draft.value} onChange={draft.change} />
      </fieldset>
      {canManage && (
        <FormActions
          dirty={draft.dirty}
          onDiscard={draft.clear}
          disabled={update.isPending || !draft.dirty}
          submit={update.isPending ? t('saving', 'Saving…') : t('save', 'Save')}
        />
      )}
    </form>
  );
};

/** The pipeline's SLA: a first response and a resolution time per ticket priority. */
export const PipelineSlaPage = () => {
  const { channelId, pipelineId } = usePipelineRoute();
  const canManage = useCanManage(channelId);
  const { data } = usePipeline(pipelineId);

  if (!data) return <Skeleton className="h-60 md:max-w-2xl" />;

  return <SlaForm key={data.id} pipeline={data} canManage={canManage} />;
};
