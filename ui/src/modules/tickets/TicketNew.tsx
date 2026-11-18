import {
  IconAlertSquareRounded,
  IconAlignLeft,
  IconCalendarBolt,
  IconCalendarX,
  IconGitBranch,
  IconLetterCase,
  IconProgressCheck,
  IconTag,
  IconUser,
} from '@tabler/icons-react';
import type { CustomValue } from '@erxes/core-contract';
import { useMutation } from '@tanstack/react-query';
import {
  DatePicker,
  Editor,
  PanelFormLayout,
  PanelFormRow,
  Select,
  type TRecordDraftProps,
  textOf,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';
import { orpc } from '~/orpc.ts';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { TagsField } from '~/shared/Pickers.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { PrioritySelect, StatusSelect } from './TicketCells.tsx';
import { dayOf } from './TicketFields.tsx';
import { ticketTags } from './TicketLinks.tsx';
import { PropertyRows } from './TicketProperties.tsx';
import { useChoices, useTicketChange } from './queries.ts';

/** The pipelines of the member's channels, each after its channel's name. */
const PipelineSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (pipelineId: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const { pipelines } = useChoices();
  const channels = useChannels().data?.channels ?? [];
  const channelName = new Map(channels.map((channel) => [channel.id, channel.name]));

  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <Select.Trigger aria-label={t('pipeline', 'Pipeline')}>
        <Select.Value placeholder={t('pipeline', 'Pipeline')} />
      </Select.Trigger>
      <Select.Content>
        {pipelines.map((pipeline) => (
          <Select.Item key={pipeline.id} value={pipeline.id}>
            {`${channelName.get(pipeline.channelId) ?? ''} › ${pipeline.name}`}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The draft's pipeline and its status; an empty status files it under the pipeline's first. */
const FilingRows = ({
  pipelineId,
  statusId,
  onPipeline,
  onStatus,
}: {
  pipelineId: string;
  statusId: string;
  onPipeline: (pipelineId: string) => void;
  onStatus: (statusId: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const { pipelines } = useChoices();

  return (
    <>
      <PanelFormRow
        label={t('pipeline', 'Pipeline')}
        icon={IconGitBranch}
        required
        error={
          pipelines.length === 0
            ? t('ticket-pipeline-first', 'Add a pipeline to one of your channels first.')
            : undefined
        }
      >
        <PipelineSelect value={pipelineId} onChange={onPipeline} />
      </PanelFormRow>
      <PanelFormRow label={t('status', 'Status')} icon={IconProgressCheck}>
        <StatusSelect
          pipelineId={pipelineId}
          value={statusId}
          onChange={onStatus}
          label={t('status-first-when-empty', 'The first status')}
        />
      </PanelFormRow>
    </>
  );
};

/** What a new ticket is planned with, beside its filing and name. */
type Plan = {
  priority: number;
  assigneeId: string | null;
  startDate: Date | null;
  targetDate: Date | null;
};

const NO_PLAN: Plan = { priority: 0, assigneeId: null, startDate: null, targetDate: null };

/** The draft's priority, assignee and dates; each change patches `plan`. */
const PlanRows = ({ plan, onChange }: { plan: Plan; onChange: (patch: Partial<Plan>) => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <PanelFormRow label={t('priority', 'Priority')} icon={IconAlertSquareRounded}>
        <PrioritySelect
          value={plan.priority}
          onChange={(priority) => onChange({ priority })}
          label={t('priority', 'Priority')}
        />
      </PanelFormRow>
      <PanelFormRow label={t('assignee', 'Assignee')} icon={IconUser}>
        <MemberSelect
          value={plan.assigneeId}
          onValueChange={(assigneeId) => onChange({ assigneeId })}
          noneLabel={t('no-assignee', 'No assignee')}
          placeholder={t('no-assignee', 'No assignee')}
        />
      </PanelFormRow>
      <PanelFormRow label={t('start-date', 'Start date')} icon={IconCalendarBolt}>
        <DatePicker
          value={plan.startDate ?? undefined}
          onChange={(day) => onChange({ startDate: dayOf(day) })}
          placeholder={t('start-date', 'Start date')}
          clearable
        />
      </PanelFormRow>
      <PanelFormRow label={t('target-date', 'Target date')} icon={IconCalendarX}>
        <DatePicker
          value={plan.targetDate ?? undefined}
          onChange={(day) => onChange({ targetDate: dayOf(day) })}
          placeholder={t('target-date', 'Target date')}
          clearable
        />
      </PanelFormRow>
    </>
  );
};

/** A new ticket's tags and the properties its pipeline shows. */
type Labels = { tagIds: string[]; propertiesData: Record<string, CustomValue | null> };

const NO_LABELS: Labels = { tagIds: [], propertiesData: {} };

const LabelRows = ({
  pipelineId,
  labels,
  onChange,
}: {
  pipelineId: string;
  labels: Labels;
  onChange: (patch: Partial<Labels>) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <PanelFormRow label={t('tags', 'Tags')} icon={IconTag}>
        <TagsField
          tags={ticketTags}
          value={labels.tagIds}
          onChange={(tagIds) => onChange({ tagIds })}
        />
      </PanelFormRow>
      <PropertyRows
        pipelineId={pipelineId}
        values={labels.propertiesData}
        onChange={(propertiesData) => onChange({ propertiesData })}
      />
    </>
  );
};

/**
 * A new ticket in core's side panel: its pipeline and status, name, priority, assignee, dates and
 * description. It starts in the opener's pipeline and status (`openNew(TICKET_TYPE, { pipelineId,
 * statusId })`), else the first pipeline and its first status. Nothing saves until Save; the
 * ticket then takes the draft's place.
 */
export const TicketNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const { pipelines } = useChoices();
  const [picked, setPipelineId] = useState(() => textOf(defaults.pipelineId));
  const [statusId, setStatusId] = useState(() => textOf(defaults.statusId));
  const [plan, setPlan] = useState(NO_PLAN);
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState(NO_LABELS);
  const pipelineId = picked || (pipelines[0]?.id ?? '');
  const { onSuccess } = useTicketChange();

  const create = useMutation(
    orpc.tickets.create.mutationOptions({
      onSuccess: (ticket) => {
        onSuccess();
        onCreated(ticket.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      pipelineId,
      statusId: statusId || undefined,
      name: textOf(form.get('name')),
      description,
      ...labels,
      ...plan,
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-ticket', 'Create ticket')}
      >
        <FilingRows
          pipelineId={pipelineId}
          statusId={statusId}
          onPipeline={(next) => {
            setPipelineId(next);
            setStatusId('');
            setLabels((last) => ({ ...last, propertiesData: {} }));
          }}
          onStatus={setStatusId}
        />
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          placeholder={t('name', 'Name')}
        />
        <PlanRows plan={plan} onChange={(patch) => setPlan((last) => ({ ...last, ...patch }))} />
        <LabelRows
          pipelineId={pipelineId}
          labels={labels}
          onChange={(patch) => setLabels((last) => ({ ...last, ...patch }))}
        />
        <PanelFormRow label={t('description', 'Description')} icon={IconAlignLeft}>
          <Editor
            onChange={setDescription}
            label={t('description', 'Description')}
            variant="outline"
            className="min-h-24"
          />
        </PanelFormRow>
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
