import { useSyncExternalStore } from 'react';
import type { CurrentCall } from './current.ts';
import type { Line, Phone } from './useSip.ts';

/**
 * The phone core's floating widget keeps signed in on every page, as the Phone page draws it:
 * the line it's on, the member's other lines, and switching to one, with the call as erxes
 * knows it and the caller's name when core has one. The call note the member closed stays
 * closed when they leave the page and come back.
 */
export type LivePhone = {
  phone: Phone;
  line: Line;
  lines: Line[];
  pickLine: (accountId: string) => void;
  current: CurrentCall;
  caller: string | null;
  closedNote: string | null;
  closeNote: (id: string) => void;
};

let live: LivePhone | null = null;
const listeners = new Set<() => void>();

/** Called by the widget on each change, and with null when it stops. */
export const publishPhone = (next: LivePhone | null) => {
  live = next;

  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => void listeners.delete(listener);
};

export const useLivePhone = () => useSyncExternalStore(subscribe, () => live);
