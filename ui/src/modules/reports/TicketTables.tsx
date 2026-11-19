import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { useTicketReport } from './queries.ts';
import { useTicketLinks } from './ticketLinks.ts';
import { Count, MiniTable, shareOf, Tile } from './Tile.tsx';

/**
 * How the period's new tickets keep their SLA, per clock: met and missed in time, overdue now,
 * and the share met of those that stopped. Each count opens its tickets.
 */
export const TicketSla = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const report = useTicketReport('ticket-sla');
  const links = useTicketLinks(report.period.range, report.pick.id);

  const clocks = [
    { clock: 'firstResponse', label: t('first-response', 'First response') },
    { clock: 'resolution', label: t('resolution', 'Resolution') },
  ] as const;

  return (
    <Tile {...report}>
      {(data) => {
        const count = (clock: string, state: string) =>
          data.sla.find((row) => row.clock === clock && row.state === state)?.count ?? 0;

        const cell = (clock: string, state: string) => (
          <Count
            value={format.number(count(clock, state))}
            to={links.created({ path: `subject.${clock}Sla`, op: 'in', value: [state] })}
          />
        );

        return (
          <MiniTable
            heads={[
              t('sla', 'SLA'),
              t('sla-met', 'Met'),
              t('sla-missed', 'Missed'),
              t('sla-overdue', 'Overdue'),
              t('met-share', 'Met share'),
            ]}
            rows={
              data.sla.length === 0
                ? []
                : clocks.map(({ clock, label }) => {
                    const met = count(clock, 'met');
                    const missed = count(clock, 'missed');

                    return {
                      key: clock,
                      lead: label,
                      numbers: [
                        cell(clock, 'met'),
                        cell(clock, 'missed'),
                        cell(clock, 'overdue'),
                        shareOf(met, met + missed),
                      ],
                    };
                  })
            }
            empty={t('no-sla-tickets', 'No ticket in this period had an SLA.')}
          />
        );
      }}
    </Tile>
  );
};

/** Who holds the unresolved tickets now, the most first, and how many nobody holds. */
export const TicketsByAssignee = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const report = useTicketReport('tickets-by-assignee');
  const links = useTicketLinks(report.period.range, report.pick.id);

  return (
    <Tile query={report.query} pick={report.pick}>
      {(data) => (
        <MiniTable
          heads={[t('assignee', 'Assignee'), t('tickets-unresolved', 'Open now')]}
          rows={data.assignees.map((row) => ({
            key: row.userId ?? 'nobody',
            lead: row.userId ? (
              <MemberLine id={row.userId} />
            ) : (
              <span className="text-muted-foreground">{t('no-assignee', 'No assignee')}</span>
            ),
            numbers: [
              <Count
                key="open"
                value={format.number(row.count)}
                to={links.open(
                  row.userId
                    ? { path: 'subject.assigneeId', op: 'in', value: [row.userId] }
                    : { path: 'subject.assigneeId', op: 'not_exists' },
                )}
              />,
            ],
          }))}
          empty={t('no-open-tickets', 'No unresolved tickets.')}
        />
      )}
    </Tile>
  );
};
