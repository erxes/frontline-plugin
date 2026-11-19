import { app, type BrowserWindow, type IpcMainEvent, ipcMain } from 'electron';
import { type PhoneCommand, PhoneState } from './bridge.ts';
import { CHANNELS } from './channels.ts';
import { settings } from './settings.ts';
import { telNumber } from './window.ts';

/** Brings the window up, from the tray or behind other windows. */
export const reveal = (window: BrowserWindow) => {
  if (window.isMinimized()) window.restore();

  window.show();
  window.focus();
};

/**
 * The web softphone's side of the app: its state from the page, which `onState` gets (null while
 * the page has no phone), and the commands the app sends it. An incoming call flashes the window
 * and bounces the dock until it's answered or gone; the call card (card.ts) shows and rings it.
 * A number dialed before the phone is ready waits for it; one dialed
 * during a call only opens the Phone page.
 */
export const connectPhone = (
  window: BrowserWindow,
  onState: (state: PhoneState | null) => void,
) => {
  let ringing = false;
  let bounce: number | undefined;
  let waiting: string | null = null;
  let current: PhoneState | null = null;

  const send = (command: PhoneCommand) => window.webContents.send(CHANNELS.command, command);

  const ring = (state: PhoneState | null) => {
    const call = state?.call;
    const rings = call?.direction === 'incoming' && !call.talking;

    if (rings === ringing) return;

    ringing = rings;

    if (ringing) {
      window.flashFrame(true);
      bounce = app.dock?.bounce('critical');
    } else {
      window.flashFrame(false);

      if (bounce !== undefined) app.dock?.cancelBounce(bounce);
    }
  };

  /** Dials now when the phone is free, and only opens the Phone page when it's busy or offline. */
  const dialOn = (state: PhoneState, number: string) =>
    send(
      state.status === 'ready' && !state.call ? { type: 'dial', number } : { type: 'openPhone' },
    );

  const update = (state: PhoneState | null) => {
    current = state;
    ring(state);
    onState(state);

    // A number waits only while the page loads or the phone signs in.
    if (waiting && state && state.status !== 'connecting') {
      dialOn(state, waiting);
      waiting = null;
    }
  };

  const dial = (number: string) => {
    reveal(window);

    if (current && current.status !== 'connecting') dialOn(current, number);
    else waiting = number;
  };

  // Only erxes web, in the app's window, speaks for the phone.
  const fromErxes = (event: IpcMainEvent) =>
    event.sender === window.webContents && event.senderFrame?.origin === settings().server;

  ipcMain.on(CHANNELS.phone, (event, raw: unknown) => {
    const parsed = PhoneState.nullable().safeParse(raw);

    if (fromErxes(event) && parsed.success) update(parsed.data);
  });

  ipcMain.on(CHANNELS.dial, (event, url: unknown) => {
    const number = typeof url === 'string' ? telNumber(url) : null;

    if (fromErxes(event) && number) dial(number);
  });

  // A page that reloads or leaves erxes has no phone until it says again. Not on a navigation
  // that only starts: a tel: link starts one the window then cancels.
  window.webContents.on('did-navigate', () => update(null));

  return { send, dial };
};
