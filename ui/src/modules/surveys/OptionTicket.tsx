import { IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Label, Popover, Select } from 'erxes-ui';
import { type SubmitEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import type { SurveyStep } from './useSurveys.ts';

type Rule = NonNullable<SurveyStep['options'][number]['ticket']>;

/** The pipelines of the survey's channel and their statuses, as the member sees them. */
const useChannelChoices = (channelId: string) => {
  const choices = useQuery(orpc.pipelines.choices.queryOptions()).data;
  const pipelines = choices?.pipelines.filter((pipeline) => pipeline.channelId === channelId) ?? [];

  return {
    pipelines,
    statusesOf: (pipelineId: string) =>
      choices?.statuses.filter((status) => status.pipelineId === pipelineId) ?? [],
  };
};

/** A pick of one pipeline or status by name. */
const Choice = ({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { id: string; name: string }[];
  onChange: (id: string) => void;
}) => (
  <Select value={value} onValueChange={(next) => typeof next === 'string' && onChange(next)}>
    <Select.Trigger aria-label={label}>
      <Select.Value />
    </Select.Trigger>
    <Select.Content>
      {items.map((item) => (
        <Select.Item key={item.id} value={item.id}>
          {item.name}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
);

/** The rule's fields: at how many voters, and in which pipeline and status the ticket opens. */
const RuleForm = ({
  channelId,
  rule,
  onSave,
  onRemove,
}: {
  channelId: string;
  rule: Rule | null;
  onSave: (rule: Rule) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const { pipelines, statusesOf } = useChannelChoices(channelId);
  // Until one is picked, the first pipeline and its first status, once the choices load.
  const [pickedPipeline, setPipelineId] = useState(rule?.pipelineId ?? '');
  const [pickedStatus, setStatusId] = useState(rule?.statusId ?? '');
  const pipelineId = pickedPipeline || pipelines[0]?.id || '';
  const statuses = statusesOf(pipelineId);
  const statusId = pickedStatus || statuses[0]?.id || '';
  const thresholdId = useId();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const threshold = Number(new FormData(event.currentTarget).get('threshold'));

    if (pipelineId && statusId && threshold >= 1) onSave({ threshold, pipelineId, statusId });
  };

  if (pipelines.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'survey-ticket-no-pipeline',
          'Add a pipeline to this channel to open tickets from votes.',
        )}
      </p>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t('survey-ticket-help', 'One ticket opens when this many voters pick the option.')}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={thresholdId}>{t('survey-ticket-threshold', 'Voters')}</Label>
        <Input
          id={thresholdId}
          name="threshold"
          type="number"
          min={1}
          max={100_000}
          required
          defaultValue={rule?.threshold ?? 1}
        />
      </div>
      <Choice
        label={t('pipeline', 'Pipeline')}
        value={pipelineId}
        items={pipelines}
        onChange={(next) => {
          setPipelineId(next);
          setStatusId('');
        }}
      />
      <Choice
        label={t('status', 'Status')}
        value={statusId}
        items={statuses}
        onChange={setStatusId}
      />
      <div className="flex justify-between gap-2">
        {rule ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            {t('survey-ticket-remove', 'Stop opening tickets')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit">{t('save', 'Save')}</Button>
      </div>
    </form>
  );
};

/**
 * An option's ticket rule behind a button that shows its threshold once set: when that many
 * voters pick the option, a ticket opens in the rule's pipeline and status.
 */
export const OptionTicket = ({
  channelId,
  option,
  onChange,
}: {
  channelId: string;
  option: SurveyStep['options'][number];
  onChange: (rule: Rule | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const rule = option.ticket;

  const save = (next: Rule | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size={rule ? 'sm' : 'icon'}
            tone={rule ? 'primary' : 'muted'}
            aria-label={
              rule
                ? t('survey-ticket-at', 'Ticket for {{option}} at {{count}} voters', {
                    option: option.text,
                    count: rule.threshold,
                  })
                : t('survey-ticket-add', 'Open a ticket from {{option}}', { option: option.text })
            }
          />
        }
      >
        <IconTicket />
        {rule && rule.threshold}
      </Popover.Trigger>
      <Popover.Content align="end" className="w-72">
        <RuleForm channelId={channelId} rule={rule} onSave={save} onRemove={() => save(null)} />
      </Popover.Content>
    </Popover>
  );
};
