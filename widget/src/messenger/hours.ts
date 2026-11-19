import type { English, Text } from '../shared/text.ts';
import type { Settings } from './api.ts';

type T = Text['t'];

type Day = Settings['onlineHours'][number]['day'];

const DAYS: Record<Day, English> = {
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

const REPLIES: Record<Settings['responseRate'], English> = {
  minutes: 'Typically replies in a few minutes',
  hours: 'Typically replies in a few hours',
  days: 'Typically replies in a day',
};

/** The line under the greeting: when the team answers, or that it is away. */
export const statusOf = (settings: Settings, t: T) =>
  t(settings.isOnline ? REPLIES[settings.responseRate] : 'We are away right now');

/**
 * The online hours as rows to read, with the zone when the messenger shows it. Hours that end at
 * or before they start run into the next day.
 */
export const hoursOf = (settings: Settings, t: T) =>
  settings.availability === 'auto'
    ? settings.onlineHours.map(({ day, from, to }) => ({
        day: t(DAYS[day]),
        time: `${to <= from ? t('{from}–{to} the next day', { from, to }) : `${from}–${to}`}${settings.showTimezone && settings.timezone ? ` (${settings.timezone})` : ''}`,
      }))
    : [];

/**
 * A message's time: the hour today, the date before. Chrome has no Mongolian dates, so a language
 * the browser lacks gets the 24-hour clock and the date from the embed's words.
 */
export const timeOf = (iso: string, language: string, t: T) => {
  const date = new Date(iso);
  const today = date.toDateString() === new Date().toDateString();

  if (Intl.DateTimeFormat.supportedLocalesOf(language).length > 0)
    return new Intl.DateTimeFormat(
      language,
      today ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' },
    ).format(date);

  return today
    ? new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date)
    : t('{month}/{day}', { month: date.getMonth() + 1, day: date.getDate() });
};
