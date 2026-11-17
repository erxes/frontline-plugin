import type { Settings } from './api.ts';

type Day = Settings['onlineHours'][number]['day'];

const DAYS: Record<Day, string> = {
  everyday: 'Every day',
  weekdays: 'Weekdays',
  weekend: 'Weekends',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const REPLIES: Record<Settings['responseRate'], string> = {
  minutes: 'Typically replies in a few minutes',
  hours: 'Typically replies in a few hours',
  days: 'Typically replies in a day',
};

/** The line under the greeting: when the team answers, or that it is away. */
export const statusOf = (settings: Settings) =>
  settings.isOnline ? REPLIES[settings.responseRate] : 'We are away right now';

/** The online hours as rows to read, with the zone when the messenger shows it. */
export const hoursOf = (settings: Settings) =>
  settings.availability === 'auto'
    ? settings.onlineHours.map((hours) => ({
        day: DAYS[hours.day],
        time: `${hours.from}–${hours.to}${settings.showTimezone && settings.timezone ? ` (${settings.timezone})` : ''}`,
      }))
    : [];

/** A message's time: the hour today, the date before. */
export const timeOf = (iso: string, language: string) => {
  const date = new Date(iso);
  const today = date.toDateString() === new Date().toDateString();

  return new Intl.DateTimeFormat(
    language,
    today ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' },
  ).format(date);
};
