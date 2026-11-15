import { Badge } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { type SlaState, type Ticket, useSlaNames } from './queries.ts';

const badges = {
  due: 'muted',
  overdue: 'destructive',
  met: 'success',
  missed: 'warning',
} as const satisfies Record<SlaState, string>;

/** An SLA clock's state as a badge. */
export const SlaStateBadge = ({ state }: { state: SlaState }) => (
  <Badge variant={badges[state]}>{useSlaNames()[state]}</Badge>
);

/**
 * The clock that needs a look on a row or card: an overdue one, else the running one. Nothing
 * when the pipeline keeps no SLA or both clocks stopped in time.
 */
export const SlaBadge = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');

  const clocks = [
    { state: ticket.firstResponseSla, label: t('first-response', 'First response') },
    { state: ticket.resolutionSla, label: t('resolution', 'Resolution') },
  ];

  const shown =
    clocks.find((clock) => clock.state === 'overdue' || clock.state === 'missed') ??
    clocks.find((clock) => clock.state === 'due');

  if (!shown?.state) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {shown.label}
      <SlaStateBadge state={shown.state} />
    </span>
  );
};
