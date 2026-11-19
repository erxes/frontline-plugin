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
      direction: z.enum(['incoming', 'outgoing']),
      talking: z.boolean(),
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

export type PhoneCommand =
  | { type: 'openPhone' }
  | { type: 'answer' }
  | { type: 'hangUp' }
  | { type: 'dial'; number: string }
  | { type: 'queue'; accountId: string; paused: boolean };

export type DesktopBridge = {
  /** Tells the app the phone's state, on every change, and null once the page has no phone. */
  phone: (state: PhoneState | null) => void;
  /** Runs `listener` on each command the app sends, until the returned function is called. */
  onCommand: (listener: (command: PhoneCommand) => void) => () => void;
};

/** What the app's own setup page gets, as `window.erxesSetup`. */
export type SetupBridge = { connect: (address: string) => void };
