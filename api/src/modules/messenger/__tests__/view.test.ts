import { describe, expect, it } from 'vite-plus/test';
import { MessengerConfig } from '../adapter.ts';
import { isOnlineAt } from '../view.ts';

/** Whether `config` reads as online at each of `times`, November 2026 UTC days and hours. */
const on = (config: MessengerConfig, ...times: string[]) =>
  times.map((time) => isOnlineAt(config, new Date(`2026-11-${time}:00Z`)));

describe("a messenger's hours", () => {
  it('read its team as online inside them, past midnight too, or as the manual switch says', () => {
    // Ulaanbaatar, weekdays 09:00 to 18:00: on Monday 10:00, off 19:00 and Saturday. Friday 22:00
    // to 06:00: on Friday 23:00 and Saturday 05:00, off Saturday 07:00 and Thursday 03:00.
    const hours = MessengerConfig.parse({
      availability: 'auto',
      timezone: 'Asia/Ulaanbaatar',
      onlineHours: [{ day: 'weekdays', from: '09:00', to: '18:00' }],
    });

    const night = MessengerConfig.parse({
      ...hours,
      onlineHours: [{ day: 'friday', from: '22:00', to: '06:00' }],
    });

    expect(on(hours, '16T02:00', '16T11:00', '21T02:00')).toEqual([true, false, false]);
    expect(on(night, '20T15:00', '20T21:00', '20T23:00', '18T19:00')).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(on({ ...hours, availability: 'manual', isOnline: false }, '16T02:00')).toEqual([false]);
  });
});
