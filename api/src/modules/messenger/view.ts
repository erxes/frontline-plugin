// What a visitor sees of a messenger, with no imports that run: the API answers it, and the
// widget's settings preview draws it from a member's unsaved settings.
import type { MessengerConfig } from './adapter.ts';

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** The days an online-hours row covers: one weekday, every day, Monday to Friday or the weekend. */
export const HOURS_DAYS = [...WEEKDAYS, 'everyday', 'weekdays', 'weekend'] as const;

/** The weekday, as `HOURS_DAYS` names it, and the `HH:mm` time in `timeZone` at `now`. */
const clockAt = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return { day: part('weekday').toLowerCase(), time: `${part('hour')}:${part('minute')}` };
};

const covers = (day: (typeof HOURS_DAYS)[number], weekday: string) =>
  day === weekday ||
  day === 'everyday' ||
  (day === 'weekend' && (weekday === 'saturday' || weekday === 'sunday')) ||
  (day === 'weekdays' && weekday !== 'saturday' && weekday !== 'sunday');

/**
 * Whether the messenger's team reads as online at `now`. Hours that end at or before they start
 * run past midnight: Friday 22:00 to 06:00 covers Friday night and Saturday until 06:00.
 */
export const isOnlineAt = (config: MessengerConfig, now: Date) => {
  if (config.availability === 'manual') return config.isOnline;

  const { day, time } = clockAt(now, config.timezone ?? 'UTC');
  const today = WEEKDAYS.findIndex((weekday) => weekday === day);
  const yesterday = WEEKDAYS[(today + 6) % 7] ?? day;

  return config.onlineHours.some(({ day: days, from, to }) =>
    from < to
      ? covers(days, day) && from <= time && time < to
      : (covers(days, day) && from <= time) || (covers(days, yesterday) && time < to),
  );
};

/** A member the messenger shows as its team. */
type Supporter = { id: string; name: string | null; avatarUrl: string | null };

/** What the settings page posts its preview on every change: the unsaved settings and team. */
export type PreviewMessage = {
  type: typeof PREVIEW_MESSAGE;
  name: string;
  config: MessengerConfig;
  supporters: Supporter[];
};

export const PREVIEW_MESSAGE = 'frontline:messenger-preview';

/** What the preview posts the page once it listens, so the page posts the settings again. */
export const PREVIEW_READY = 'frontline:messenger-preview-ready';

/**
 * What a visitor sees of the messenger: its settings with its team in place of the team's ids,
 * whether that team is online at `now`, whether it takes tickets, and its common questions
 * without their answers, which only a tap or a matching message gets.
 */
export const visitorView = (
  { supporterIds, ticketPipelineIds, faq, ...shown }: MessengerConfig & { name: string },
  supporters: Supporter[],
  now: Date,
) => ({
  ...shown,
  isOnline: isOnlineAt({ supporterIds, ticketPipelineIds, faq, ...shown }, now),
  supporters,
  tickets: ticketPipelineIds.length > 0,
  faq: faq.map(({ id, question }) => ({ id, question })),
});
