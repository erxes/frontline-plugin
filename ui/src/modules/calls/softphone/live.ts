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

/** A number to dial on a line as soon as the phone is signed in on it. */
export type PendingDial = { accountId: string; number: string };

let pending: PendingDial | null = null;
const pendingListeners = new Set<() => void>();

const setPending = (next: PendingDial | null) => {
  pending = next;

  for (const listener of pendingListeners) listener();
};

/**
 * Dials `number` on the line `accountId` from any page: the phone switches to that line when it's
 * on another, and dials once it's signed in there and free.
 */
export const dialOn = (dial: PendingDial) => {
  setPending(dial);
  live?.pickLine(dial.accountId);
};

/** Hands the pending number to the phone that dials it, once. */
export const takePendingDial = () => {
  const taken = pending;

  setPending(null);

  return taken;
};

const subscribePending = (listener: () => void) => {
  pendingListeners.add(listener);

  return () => void pendingListeners.delete(listener);
};

export const usePendingDial = () => useSyncExternalStore(subscribePending, () => pending);
