import { type serve, signedByMeta } from './fakes.ts';

/** `sender`'s message `mid` to `recipient`, with what else Meta put in `message`. */
export const said = (
  sender: string,
  recipient: string,
  mid: string,
  message: Record<string, unknown>,
) => ({
  sender: { id: sender },
  recipient: { id: recipient },
  timestamp: 1763180000500,
  message: { mid, ...message },
});

/**
 * Delivers Messenger's or Instagram's messaging `events` for the page or account `id`, signed
 * as Meta signs them, through `deliver` of the app a test file serves.
 */
export const messagingWith =
  (deliver: ReturnType<typeof serve>['deliver']) =>
  (object: 'page' | 'instagram', id: string, events: unknown[]) => {
    const raw = JSON.stringify({ object, entry: [{ id, time: 1763180000123, messaging: events }] });

    return deliver('/meta', raw, signedByMeta(raw));
  };
