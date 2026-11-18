import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Button, Form, localTimeZone, Select, TimeField, zoneOffset } from 'erxes-ui';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '~/shared/Settings.tsx';
import { ChoiceRow, SwitchRow } from './fields.tsx';
import type { MessengerForm } from './queries.ts';

type Day = MessengerForm['onlineHours'][number]['day'];

const DAYS: Day[] = [
  'everyday',
  'weekdays',
  'weekend',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const useDayNames = (): Record<Day, string> => {
  const { t } = useTranslation('frontline');

  return {
    everyday: t('day-everyday', 'Every day'),
    weekdays: t('day-weekdays', 'Weekdays'),
    weekend: t('day-weekend', 'Weekend'),
    monday: t('day-monday', 'Monday'),
    tuesday: t('day-tuesday', 'Tuesday'),
    wednesday: t('day-wednesday', 'Wednesday'),
    thursday: t('day-thursday', 'Thursday'),
    friday: t('day-friday', 'Friday'),
    saturday: t('day-saturday', 'Saturday'),
    sunday: t('day-sunday', 'Sunday'),
  };
};

/** The rows of online hours: a day, or a run of days, from one time to another. */
const HoursRows = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'onlineHours' });
  const days = useDayNames();

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{t('messenger-online-hours', 'Online hours')}</span>
      {fields.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <Form.Field
            control={control}
            name={`onlineHours.${index}.day`}
            render={({ field }) => (
              <Select value={field.value} onValueChange={(next) => next && field.onChange(next)}>
                <Select.Trigger aria-label={t('messenger-day', 'Day')} className="w-40">
                  <Select.Value>{days[field.value]}</Select.Value>
                </Select.Trigger>
                <Select.Content>
                  {DAYS.map((day) => (
                    <Select.Item key={day} value={day}>
                      {days[day]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            )}
          />
          <Form.Field
            control={control}
            name={`onlineHours.${index}.from`}
            render={({ field }) => (
              <TimeField
                aria-label={t('messenger-from', 'From')}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          <Form.Field
            control={control}
            name={`onlineHours.${index}.to`}
            render={({ field }) => (
              <TimeField
                aria-label={t('messenger-to', 'To')}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('messenger-remove-hours', 'Remove these hours')}
            onClick={() => remove(index)}
          >
            <IconTrash />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-min"
        onClick={() => append({ day: 'weekdays', from: '09:00', to: '18:00' })}
      >
        <IconPlus />
        {t('messenger-add-hours', 'Add hours')}
      </Button>
    </div>
  );
};

const ZONES = Intl.supportedValuesOf('timeZone');

const TimezoneRow = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name="timezone"
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{t('messenger-timezone', 'Time zone')}</Form.Label>
          <Select
            value={field.value ?? localTimeZone() ?? 'UTC'}
            onValueChange={(zone) => field.onChange(zone)}
          >
            <Form.Control>
              <Select.Trigger aria-label={t('messenger-timezone', 'Time zone')}>
                <Select.Value />
              </Select.Trigger>
            </Form.Control>
            <Select.Content>
              {ZONES.map((zone) => (
                <Select.Item key={zone} value={zone}>
                  {zone} ({zoneOffset(zone)})
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Form.Item>
      )}
    />
  );
};

/** When the team reads as online: set by hand, or by online hours in a time zone. */
export const AvailabilityCard = () => {
  const { t } = useTranslation('frontline');
  const auto = useWatch<MessengerForm, 'availability'>({ name: 'availability' }) === 'auto';

  return (
    <SettingsCard
      title={t('messenger-availability', 'Availability')}
      description={t(
        'messenger-availability-description',
        'When visitors see your team as online, and how fast you usually answer.',
      )}
    >
      <ChoiceRow
        name="availability"
        label={t('messenger-availability-method', 'Set availability')}
        options={[
          { value: 'manual', label: t('messenger-manual', 'By hand') },
          { value: 'auto', label: t('messenger-auto', 'By online hours') },
        ]}
      />
      <ChoiceRow
        name="responseRate"
        label={t('messenger-response-rate', 'Usually answers in')}
        options={[
          { value: 'minutes', label: t('messenger-minutes', 'A few minutes') },
          { value: 'hours', label: t('messenger-hours', 'A few hours') },
          { value: 'days', label: t('messenger-days', 'A day') },
        ]}
      />
      {auto ? (
        <>
          <HoursRows />
          <TimezoneRow />
          <SwitchRow
            name="showTimezone"
            label={t('messenger-show-timezone', 'Show the time zone')}
            hint={t('messenger-show-timezone-hint', 'Visitors see your hours in it.')}
          />
        </>
      ) : (
        <SwitchRow
          name="isOnline"
          label={t('messenger-online', 'Online')}
          hint={t('messenger-online-hint', 'Visitors see the team as online now.')}
        />
      )}
      <SwitchRow
        name="hideWhenOffline"
        label={t('messenger-hide-offline', 'Hide while offline')}
        hint={t('messenger-hide-offline-hint', 'The launcher disappears outside online hours.')}
      />
    </SettingsCard>
  );
};
