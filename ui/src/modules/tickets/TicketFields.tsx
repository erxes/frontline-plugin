import {
  IconAlarm,
  IconCalendarBolt,
  IconCalendarX,
  IconClockCheck,
  IconPaperclip,
} from '@tabler/icons-react';
import { DatePicker, PanelDescriptionField, PanelField, PanelSection, useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { FileList, FilePicker } from '~/shared/Files.tsx';
import { SlaStateBadge } from './SlaBadge.tsx';
import { type Ticket, useEditTicket } from './queries.ts';

/** A picked day, or null when the picker clears. */
export const dayOf = (value: unknown) => (value instanceof Date ? value : null);

/** When work on the ticket starts and is due, each cleared from its picker. */
export const TicketPlan = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PanelSection title={t('plan', 'Plan')}>
      <PanelField icon={IconCalendarBolt} label={t('start-date', 'Start date')} cell={false}>
        <DatePicker
          value={ticket.startDate ?? undefined}
          onChange={(day) => edit({ startDate: dayOf(day) })}
          placeholder={t('start-date', 'Start date')}
          clearable
        />
      </PanelField>
      <PanelField icon={IconCalendarX} label={t('target-date', 'Target date')} cell={false}>
        <DatePicker
          value={ticket.targetDate ?? undefined}
          onChange={(day) => edit({ targetDate: dayOf(day) })}
          placeholder={t('target-date', 'Target date')}
          clearable
        />
      </PanelField>
    </PanelSection>
  );
};

/** One SLA clock: its state, when it is due, and when it stopped. */
const SlaClock = ({
  label,
  icon,
  state,
  due,
  done,
}: {
  label: string;
  icon: typeof IconAlarm;
  state: Ticket['firstResponseSla'];
  due: Date | null;
  done: Date | null;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (
    <PanelField icon={icon} label={label} cell={false}>
      <span className="flex min-w-0 items-center gap-2 px-2 text-xs">
        {state && <SlaStateBadge state={state} />}
        <span className="truncate text-muted-foreground">
          {done
            ? t('sla-stopped-at', 'Stopped {{at}}', { at: format.dateTime(done) })
            : due && t('sla-due-at', 'Due {{at}}', { at: format.dateTime(due) })}
        </span>
      </span>
    </PanelField>
  );
};

/** The pipeline's SLA on this ticket; nothing when the pipeline keeps none for its priority. */
export const TicketSla = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');

  if (!ticket.firstResponseDueAt && !ticket.resolutionDueAt) return null;

  return (
    <PanelSection title={t('sla', 'SLA')}>
      <SlaClock
        label={t('first-response', 'First response')}
        icon={IconAlarm}
        state={ticket.firstResponseSla}
        due={ticket.firstResponseDueAt}
        done={ticket.firstRespondedAt}
      />
      <SlaClock
        label={t('resolution', 'Resolution')}
        icon={IconClockCheck}
        state={ticket.resolutionSla}
        due={ticket.resolutionDueAt}
        done={ticket.resolvedAt}
      />
    </PanelSection>
  );
};

/** The description in core's editor and the ticket's files, saved as they change. */
export const TicketContent = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PanelSection title={t('description', 'Description')}>
      <PanelDescriptionField
        label={t('description', 'Description')}
        scope={`frontline-ticket.${ticket.id}.description`}
        value={ticket.description}
        onSave={(description) => description !== ticket.description && edit({ description })}
      />
      <PanelField icon={IconPaperclip} label={t('files', 'Files')} cell={false}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-2 py-1">
          <FileList
            files={ticket.attachments}
            onRemove={(file) =>
              edit({ attachments: ticket.attachments.filter((row) => row.url !== file.url) })
            }
          />
          <FilePicker
            label={t('attach-file', 'Attach a file')}
            onUploaded={(file) => edit({ attachments: [...ticket.attachments, file] })}
          />
        </div>
      </PanelField>
    </PanelSection>
  );
};
