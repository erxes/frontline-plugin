import { z } from 'zod';

/**
 * What the desktop app's preload gives erxes web as `window.erxesDesktop`. The web softphone
 * checks for it: it tells the app its state, and takes the commands the tray, a notification or
 * a tel: link send. The app parses what the page sends, since the page is a remote site.
 */

export const PhoneState = z.object({
  /** The member's language in erxes, for the tray and notifications. */
  language: z.string(),
  status: z.enum(['connecting', 'ready', 'offline']),
  /** The call the phone is on, ringing until either side answers. */
  call: z
    .object({
      number: z.string(),
      /** The customer's name, once the PBX has reported the call and if core has one. */
      name: z.string().nullable(),
      direction: z.enum(['incoming', 'outgoing']),
      talking: z.boolean(),
      /** When the talking began, in milliseconds since 1970. */
      since: z.number().nullable(),
      muted: z.boolean(),
      held: z.boolean(),
    })
    .nullable(),
  /** The member's extensions in their PBXes' queues, and whether each takes queue calls. */
  queues: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string(),
      extension: z.string(),
      paused: z.boolean(),
    }),
  ),
});

export type PhoneState = z.infer<typeof PhoneState>;

/** Who the call is with, for a notification or the tray: their name before their number. */
export const callerOf = ({ name, number }: NonNullable<PhoneState['call']>) =>
  name ? `${name} · ${number}` : number;

export type PhoneCommand =
  | { type: 'openPhone' }
  | { type: 'answer' }
  | { type: 'hangUp' }
  // Each of these turns its switch the other way.
  | { type: 'mute' }
  | { type: 'hold' }
  | { type: 'dial'; number: string }
  | { type: 'queue'; accountId: string; paused: boolean };

export type DesktopBridge = {
  /** Tells the app the phone's state, on every change, and null once the page has no phone. */
  phone: (state: PhoneState | null) => void;
  /** Runs `listener` on each command the app sends, until the returned function is called. */
  onCommand: (listener: (command: PhoneCommand) => void) => () => void;
};

/** What a button on the call card asks for; `open` shows the Phone page in the app's window. */
export const CardCommand = z.enum(['answer', 'hangUp', 'mute', 'hold', 'open']);

export type CardCommand = z.infer<typeof CardCommand>;

/** The call the card shows, with the app's words in the member's language; null for no call. */
export type CardState = {
  call: NonNullable<PhoneState['call']>;
  text: Record<string, string>;
} | null;

/** What the app's own call card gets, as `window.erxesCard`. */
export type CardBridge = {
  onState: (listener: (state: CardState) => void) => void;
  send: (command: CardCommand) => void;
};

/** What the app's own setup page gets, as `window.erxesSetup`. */
export type SetupBridge = { connect: (address: string) => void };
