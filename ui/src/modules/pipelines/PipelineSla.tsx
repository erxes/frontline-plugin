import { IconAlarm, IconClockCheck, IconMessage2, IconShieldCheck } from '@tabler/icons-react';
import { NumberField, PanelField, PanelSection, Switch, type TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { WithPipeline } from './PipelinePanel.tsx';
import { type Pipeline, type PipelineFields, useEditPipeline } from './queries.ts';

type SlaPolicy = NonNullable<PipelineFields['slaPolicy']>;

type SlaRule = SlaPolicy['rules'][number];

/** Critical first: the order a support lead reads the promises in. */
const PRIORITIES = [4, 3, 2, 1, 0] as const;

const toHours = (minutes: number | undefined) =>
  minutes ? Math.round((minutes / 60) * 100) / 100 : 0;

const toMinutes = (hours: number) => (hours > 0 ? Math.round(hours * 60) : undefined);

/** An hours field edited in place; zero keeps no clock. */
const HoursField = ({
  scope,
  minutes,
  onSave,
}: {
  scope: string;
  minutes: number | undefined;
  onSave: (minutes: number | undefined) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <NumberField
      scope={scope}
      value={toHours(minutes)}
      formatValue={(hours) =>
        hours ? t('n-hours', '{{count}} h', { count: hours }) : t('not-kept', 'Not kept')
      }
      onSave={(hours) => onSave(toMinutes(hours))}
    />
  );
};

/** The SLA's switch, its warning and a first response and resolution time per priority. */
const SlaFields = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditPipeline(pipeline.id);
  const policy: SlaPolicy = pipeline.slaPolicy ?? { enabled: false, rules: [] };
  const scope = `frontline-pipeline.${pipeline.id}.sla`;

  const priorities: Record<number, string> = {
    4: t('critical', 'Critical'),
    3: t('high', 'High'),
    2: t('medium', 'Medium'),
    1: t('minor', 'Minor'),
    0: t('no-priority', 'No priority'),
  };

  const save = (patch: Partial<SlaPolicy>) => edit({ slaPolicy: { ...policy, ...patch } });

  const saveRule = (priority: number, patch: Partial<SlaRule>) =>
    save({
      rules: [
        ...policy.rules.filter((rule) => rule.priority !== priority),
        { ...policy.rules.find((rule) => rule.priority === priority), ...patch, priority },
      ],
    });

  return (
    <fieldset
      disabled={!pipeline.canManage}
      className="contents [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100"
    >
      <PanelSection title={t('pipeline-sla', 'SLA')}>
        <PanelField icon={IconShieldCheck} label={t('pipeline-sla-enabled', 'Keep an SLA')}>
          <Switch
            aria-label={t('pipeline-sla-enabled', 'Keep an SLA')}
            checked={policy.enabled}
            onCheckedChange={(enabled) => save({ enabled })}
            className="mx-2"
          />
        </PanelField>
        {policy.enabled && (
          <PanelField icon={IconAlarm} label={t('pipeline-sla-warn-before', 'Warn before')}>
            <HoursField
              scope={`${scope}.warnBefore`}
              minutes={policy.warnBeforeMinutes}
              onSave={(warnBeforeMinutes) => save({ warnBeforeMinutes })}
            />
          </PanelField>
        )}
      </PanelSection>
      {policy.enabled &&
        PRIORITIES.map((priority) => {
          const rule = policy.rules.find((item) => item.priority === priority);
          const name = priorities[priority] ?? '';

          return (
            <PanelSection key={priority} title={name}>
              <PanelField
                icon={IconMessage2}
                label={t('sla-first-response-for', 'First response for {{priority}}', {
                  priority: name,
                })}
              >
                <HoursField
                  scope={`${scope}.${priority}.firstResponse`}
                  minutes={rule?.firstResponseMinutes}
                  onSave={(firstResponseMinutes) => saveRule(priority, { firstResponseMinutes })}
                />
              </PanelField>
              <PanelField
                icon={IconClockCheck}
                label={t('sla-resolution-for', 'Resolution for {{priority}}', {
                  priority: name,
                })}
              >
                <HoursField
                  scope={`${scope}.${priority}.resolution`}
                  minutes={rule?.resolutionMinutes}
                  onSave={(resolutionMinutes) => saveRule(priority, { resolutionMinutes })}
                />
              </PanelField>
            </PanelSection>
          );
        })}
    </fieldset>
  );
};

/**
 * The pipeline's SLA tab: each priority promises a first response and a resolution time, in
 * hours, edited in place; a time left at zero keeps no promise.
 */
export const PipelineSla = ({ contentId }: TRecordSlotProps) => (
  <WithPipeline id={contentId}>{(pipeline) => <SlaFields pipeline={pipeline} />}</WithPipeline>
);
