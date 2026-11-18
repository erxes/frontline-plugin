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
import type { SubmitEvent } from 'react';
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
import { type TicketDraft, useDiscard, useOpener, useTicketDraft } from './ticketDraft.ts';

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
type Plan = Pick<TicketDraft, 'priority' | 'assigneeId' | 'startDate' | 'targetDate'>;

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
type Labels = Pick<TicketDraft, 'tagIds' | 'propertiesData'>;

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
 * statusId })`), else the first pipeline and its first status. What is typed is kept as a draft
 * until the ticket is created or Cancel discards it, so closing the panel, leaving the page or
 * reloading loses none of it, as the old create sheet kept it.
 */
export const TicketNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const { pipelines } = useChoices();
  const draft = useTicketDraft();
  const discard = useDiscard(draft, onCancel);

  useOpener(draft, textOf(defaults.pipelineId), textOf(defaults.statusId));

  const { pipelineId: picked, statusId: pickedStatus, name, description, ...fields } = draft.value;
  const pipelineId = picked || textOf(defaults.pipelineId) || (pipelines[0]?.id ?? '');
  const statusId = picked ? pickedStatus : textOf(defaults.statusId);

  // Every save pins the filing the form shows, so its properties never follow another pipeline.
  const save = (patch: Partial<TicketDraft>) =>
    draft.save((last) => ({ ...last, pipelineId, statusId, ...patch }));

  const { onSuccess } = useTicketChange();

  const create = useMutation(
    orpc.tickets.create.mutationOptions({
      onSuccess: (ticket) => {
        draft.clear();
        onSuccess();
        onCreated(ticket.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ pipelineId, statusId: statusId || undefined, name, description, ...fields });
  };

  return (
    <form
      onSubmit={submit}
      onChange={(event) => save({ name: textOf(new FormData(event.currentTarget).get('name')) })}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelFormLayout
        onCancel={discard}
        saving={create.isPending}
        saveLabel={t('create-ticket', 'Create ticket')}
      >
        <FilingRows
          pipelineId={pipelineId}
          statusId={statusId}
          onPipeline={(next) => save({ pipelineId: next, statusId: '', propertiesData: {} })}
          onStatus={(next) => save({ statusId: next })}
        />
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          defaultValue={name}
          required
          placeholder={t('name', 'Name')}
        />
        <PlanRows plan={fields} onChange={save} />
        <LabelRows pipelineId={pipelineId} labels={fields} onChange={save} />
        <PanelFormRow label={t('description', 'Description')} icon={IconAlignLeft}>
          <Editor
            initialContent={description}
            onChange={(next) => save({ description: next })}
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
