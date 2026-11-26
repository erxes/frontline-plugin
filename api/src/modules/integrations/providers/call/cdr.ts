import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import type { CALL_STATUSES } from '#/db/calls.ts';

/** A number the UCM may send as text. */
const count = z.coerce.number().default(0);

/**
 * The parts of a UCM call detail record (CDR) frontline reads. The UCM sends one per leg of a
 * call: the queue's, each ringing extension's, a forward's. Times are the PBX's wall clock.
 */
export const Cdr = z.object({
  AcctId: z.coerce.string().min(1),
  uniqueid: z.string().min(1),
  linkedid: z.string().optional(),
  src: z.string().default(''),
  dst: z.string().default(''),
  start: z.string().default(''),
  answer: z.string().default(''),
  end: z.string().default(''),
  billsec: count,
  duration: count,
  disposition: z.string().default(''),
  lastapp: z.string().default(''),
  action_type: z.string().default(''),
  /** `Inbound`, `Outbound` or `Internal`. */
  userfield: z.string().default(''),
  dstanswer: z.string().default(''),
  dstchannel_ext: z.string().default(''),
  channel_ext: z.string().default(''),
  new_src: z.string().default(''),
  recordfiles: z.string().default(''),
});

export type Cdr = z.infer<typeof Cdr>;

const isForwarded = (leg: Cdr) => leg.action_type.includes('FOLLOWME');

export const isOutgoing = (leg: Cdr) => leg.userfield === 'Outbound' && !isForwarded(leg);

/** The id that ties a call's legs together. */
export const callKeyOf = (leg: Cdr) => leg.linkedid || leg.uniqueid;

/** The customer's number: who called in, or who an operator called. */
export const customerPhoneOf = (leg: Cdr) => (isOutgoing(leg) ? leg.dst : leg.src);

/** The queue a leg went through, from `QUEUE[6500]` in its action type. */
export const queueOf = (leg: Cdr) => /QUEUE\[([^\]]+)\]/.exec(leg.action_type)?.[1] ?? null;

/** The extensions a leg may name its operator by, the likeliest first. */
export const extensionsOf = (leg: Cdr) => {
  const forwardedTo = /FOLLOWME\[(\d+)\]/.exec(leg.action_type)?.[1];
  const dialled = ['Queue', 'Dial'].includes(leg.lastapp);

  return [
    ...(isOutgoing(leg)
      ? [leg.channel_ext, leg.new_src, leg.src]
      : dialled
        ? [leg.dstanswer, leg.dstchannel_ext, leg.dst]
        : []),
    forwardedTo,
    leg.dstchannel_ext,
    leg.channel_ext,
    leg.dstanswer,
  ].filter((extension): extension is string => Boolean(extension));
};

/** A person picked up: answered with talk time on a queue or dialled leg, not voicemail. */
export const isAnsweredLeg = (leg: Cdr) =>
  leg.disposition.toUpperCase() === 'ANSWERED' &&
  leg.billsec > 0 &&
  ['Queue', 'Dial'].includes(leg.lastapp) &&
  !leg.action_type.includes('VM');

type Status = (typeof CALL_STATUSES)[number];

/**
 * How a call ended, read from all its legs: answered when any operator leg was, then voicemail,
 * busy and failed; anything else is missed. A forward's answer counts as the call's.
 */
export const statusOf = (legs: Cdr[]): Status => {
  if (legs.some(isAnsweredLeg)) return 'answered';

  const dispositions = new Set(legs.map((leg) => leg.disposition.toUpperCase()));

  if (legs.some((leg) => leg.action_type.includes('VM') && leg.disposition === 'ANSWERED'))
    return 'voicemail';

  if (dispositions.has('BUSY')) return 'busy';

  if (dispositions.has('FAILED')) return 'failed';

  return 'missed';
};

/** A CDR's wall-clock time on a PBX in `timeZone`, or null when it has none. */
export const pbxTime = (value: string, timeZone: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());

  if (!parts) return null;

  const [, year, month, day, hour, minute, second] = parts.map(Number);

  return new Date(
    new TZDate(
      year ?? 0,
      (month ?? 1) - 1,
      day ?? 1,
      hour ?? 0,
      minute ?? 0,
      second ?? 0,
      timeZone,
    ).getTime(),
  );
};

/**
 * Where an answered call's recording sits on the PBX, `<dir>/<file>`: the leg's `recordfiles`
 * names it (`2026-11/auto-1731650000-1001-99112233.wav@`), and queue calls are under `queue`.
 */
export const recordingOf = (legs: Cdr[]) => {
  const leg = legs.find((candidate) => isAnsweredLeg(candidate) && candidate.recordfiles);

  // `@` separates the files, and recapi takes the first one's bare name.
  const first = leg?.recordfiles
    .split('@')
    .map((entry) => entry.trim())
    .find(Boolean);

  const file = first?.split('/').findLast(Boolean);

  if (!leg || !file) return null;

  const dir = ['QUEUE', 'TRANSFER'].some((kind) => leg.action_type.includes(kind))
    ? 'queue'
    : 'monitor';

  return `${dir}/${file}`;
};
