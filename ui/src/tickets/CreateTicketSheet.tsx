import { memberQueries } from '@erxes/core-contract/client';
import { useMutation } from '@tanstack/react-query';
import { DatePicker, Editor, Input, SelectMember } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { Field, SidePanel } from '../shared/SidePanel.tsx';
import { ChannelSelect, PipelineSelect, PrioritySelect, StatusSelect } from './TicketFields.tsx';
import { ticketPath, useTicketChange, useTicketFilters, useTicketPanel } from './useTickets.ts';

type Draft = {
  channelId: string;
  pipelineId: string;
  statusId: string;
  name: string;
  description: string;
  priority: number;
  assigneeId: string | null;
  startDate: Date | null;
  targetDate: Date | null;
};

const useTicketDraft = draftsOf<Draft>();

/** A picked day, or null when the picker clears. */
const dayOf = (value: unknown) => (value instanceof Date ? value : null);

/** Where the ticket starts, how urgent it is, who has it and when it's due. */
const PlanFields = ({ draft }: { draft: ReturnType<typeof useTicketDraft> }) => {
  const { t } = useTranslation('frontline');
  const { value, change } = draft;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('status', 'Status')} hint={t('status-hint', 'The first status when empty')}>
        <StatusSelect
          pipelineId={value.pipelineId}
          value={value.statusId || null}
          onChange={(next) => change({ statusId: next ?? '' })}
        />
      </Field>
      <Field label={t('priority', 'Priority')}>
        <PrioritySelect
          value={value.priority}
          onChange={(priority) => change({ priority: priority ?? 0 })}
        />
      </Field>
      <Field id="ticket-assignee" label={t('assignee', 'Assignee')}>
        <SelectMember.Field
          id="ticket-assignee"
          value={value.assigneeId}
          onValueChange={(assigneeId) => change({ assigneeId })}
          members={memberQueries}
          noneLabel={t('no-assignee', 'No assignee')}
          placeholder={t('no-assignee', 'No assignee')}
        />
      </Field>
      <Field label={t('start-date', 'Start date')}>
        <DatePicker
          value={value.startDate ?? undefined}
          onChange={(day) => change({ startDate: dayOf(day) })}
          placeholder={t('start-date', 'Start date')}
          clearable
        />
      </Field>
      <Field label={t('target-date', 'Target date')}>
        <DatePicker
          value={value.targetDate ?? undefined}
          onChange={(day) => change({ targetDate: dayOf(day) })}
          placeholder={t('target-date', 'Target date')}
          clearable
        />
      </Field>
    </div>
  );
};

/** Creates the ticket, then clears `onCreated`'s draft, closes the sheet and opens the ticket. */
const useCreateTicket = (onCreated: () => void) => {
  const navigate = useNavigate();
  const { close } = useTicketPanel();
  const change = useTicketChange();

  return useMutation(
    orpc.tickets.create.mutationOptions({
      ...change,
      onSuccess: async (ticket) => {
        onCreated();
        await change.onSuccess();
        close();
        void navigate(ticketPath(ticket.id));
      },
    }),
  );
};

/** The new ticket's fields; it starts in the filters' channel and pipeline. Saving opens it. */
const CreateTicketForm = () => {
  const { t } = useTranslation('frontline');
  const [filters] = useTicketFilters();

  const draft = useTicketDraft('new', {
    channelId: filters.channelId ?? '',
    pipelineId: filters.pipelineId ?? '',
    statusId: '',
    name: '',
    description: '',
    priority: 0,
    assigneeId: null,
    startDate: null,
    targetDate: null,
  });

  // The editor reads its content once, so a discard mounts a fresh one.
  const [revision, setRevision] = useState(0);
  const { channelId, pipelineId, statusId, ...fields } = draft.value;

  const create = useCreateTicket(draft.clear);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ ...fields, pipelineId, statusId: statusId || undefined });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('channel', 'Channel')}>
          <ChannelSelect
            value={channelId || null}
            onChange={(next) =>
              draft.change({ channelId: next ?? '', pipelineId: '', statusId: '' })
            }
          />
        </Field>
        <Field label={t('pipeline', 'Pipeline')}>
          <PipelineSelect
            channelId={channelId}
            value={pipelineId || null}
            onChange={(next) => draft.change({ pipelineId: next ?? '', statusId: '' })}
          />
        </Field>
      </div>
      <Field id="ticket-name" label={t('name', 'Name')}>
        <Input
          id="ticket-name"
          required
          value={fields.name}
          onChange={(event) => draft.change({ name: event.target.value })}
        />
      </Field>
      <PlanFields draft={draft} />
      <Field label={t('description', 'Description')}>
        <Editor
          key={revision}
          initialContent={fields.description || undefined}
          onChange={(description) => draft.change({ description })}
          label={t('description', 'Description')}
          variant="outline"
          className="min-h-40"
        />
      </Field>
      <FormActions
        dirty={draft.dirty}
        onDiscard={() => {
          draft.clear();
          setRevision((current) => current + 1);
        }}
        disabled={create.isPending || !pipelineId}
        submit={t('create', 'Create')}
      />
    </form>
  );
};

/** `?ticket=new` opens it; C opens it from the list. */
export const CreateTicketSheet = () => {
  const { t } = useTranslation('frontline');
  const { value, close } = useTicketPanel();

  return (
    <SidePanel
      open={value === 'new'}
      onClose={close}
      title={t('create-ticket', 'Create ticket')}
      description={t('create-ticket-hint', 'A new ticket in a pipeline of your channel.')}
    >
      {value === 'new' && <CreateTicketForm />}
    </SidePanel>
  );
};
