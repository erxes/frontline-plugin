import { DatePicker, Input, Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import type { Look } from './look.ts';
import { type Period, usePeriodNames } from './period.ts';

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** A date's time of day as a time input holds it, `HH:mm`. */
const timeOf = (date: Date) => `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

/** `date`'s day at `time`, an `HH:mm`. */
const atTime = (date: Date, time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const next = new Date(date);

  next.setHours(hours, minutes, 0, 0);

  return next;
};

/** The card's period: a preset, or a custom range of days picked on a calendar. */
export const PeriodPick = ({
  look,
  change,
}: {
  look: Look;
  change: (patch: Partial<Look>) => void;
}) => {
  const { t } = useTranslation('frontline');
  const names = usePeriodNames();
  const periods = Object.keys(names).filter((key): key is Period => key in names);

  return (
    <span className="flex items-center gap-1">
      <Select
        value={look.period}
        onValueChange={(value) => {
          const period = periods.find((key) => key === value);

          if (period) change({ period });
        }}
      >
        <Select.Trigger className="h-7 w-auto" aria-label={t('report-period', 'Period')}>
          <Select.Value>{names[look.period]}</Select.Value>
        </Select.Trigger>
        <Select.Content>
          {periods.map((period) => (
            <Select.Item key={period} value={period}>
              {names[period]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      {look.period === 'custom' && (
        <>
          <DatePicker
            mode="range"
            variant="outline"
            aria-label={t('custom-period', 'Custom')}
            value={look.from && look.to ? { from: look.from, to: look.to } : undefined}
            onChange={(dates) => {
              if (
                dates &&
                !(dates instanceof Date) &&
                !Array.isArray(dates) &&
                dates.from &&
                dates.to
              )
                // Whole days, until a time narrows them.
                change({ from: atTime(dates.from, '00:00'), to: atTime(dates.to, '23:59') });
            }}
          />
          {look.from && look.to && (
            <>
              <Input
                type="time"
                aria-label={t('period-from-time', 'From time')}
                value={timeOf(look.from)}
                onChange={({ target }) =>
                  look.from && target.value && change({ from: atTime(look.from, target.value) })
                }
              />
              <Input
                type="time"
                aria-label={t('period-to-time', 'To time')}
                value={timeOf(look.to)}
                onChange={({ target }) =>
                  look.to && target.value && change({ to: atTime(look.to, target.value) })
                }
              />
            </>
          )}
        </>
      )}
    </span>
  );
};
