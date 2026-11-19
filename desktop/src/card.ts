import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { CardCommand, type CardState, type PhoneCommand, type PhoneState } from './bridge.ts';
import { CHANNELS } from './channels.ts';
import { textIn } from './text.ts';

const WIDTH = 320;
const HEIGHT = 124;

/** The gap between the card and the screen's edges. */
const EDGE = 16;

type Actions = {
  send: (command: PhoneCommand) => void;
  /** Shows the Phone page in the app's window. */
  open: () => void;
};

/**
 * The call card: a small window over every other app, at the top right of the screen the
 * pointer is on, while a call rings or is on and Frontline's own window isn't the one in front.
 * It is the app's own page (static/call.html), with no phone of its own: it draws what the web
 * softphone says, rings an incoming call, and sends its buttons back. It never takes the
 * keyboard when it comes up. Returns what shows it the phone's state.
 */
export const createCard = (main: BrowserWindow, actions: Actions) => {
  let state: PhoneState | null = null;
  let loaded = false;

  const build = () => {
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Frontline',
      webPreferences: {
        preload: join(app.getAppPath(), 'dist/preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        // It rings while hidden, and no click comes before a ring.
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });

    loaded = false;
    window.setVisibleOnAllWorkspaces(true);
    window.on('closed', () => {
      if (card === window) card = null;
    });
    window.webContents.once('did-finish-load', () => {
      loaded = true;
      render();
    });
    void window.loadFile(join(app.getAppPath(), 'dist/call.html'));

    return window;
  };

  const render = () => {
    const call = state?.call ?? null;

    // A card the member closed, or a quit they called off took, comes back with the next call.
    if (!card) {
      if (call) card = build();

      return;
    }

    if (!loaded) return;

    const shown: CardState = state && call ? { call, text: textIn(state.language) } : null;

    card.webContents.send(CHANNELS.card, shown);

    if (!call || main.isFocused()) return card.hide();

    if (card.isVisible()) return;

    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

    card.setPosition(workArea.x + workArea.width - WIDTH - EDGE, workArea.y + EDGE);
    card.showInactive();
  };

  let card: BrowserWindow | null = build();

  main.on('focus', render);
  main.on('blur', render);

  ipcMain.on(CHANNELS.cardCommand, (event, raw: unknown) => {
    const command = CardCommand.safeParse(raw);

    if (event.sender !== card?.webContents || !command.success) return;

    if (command.data === 'open') actions.open();
    else actions.send({ type: command.data });
  });

  return (next: PhoneState | null) => {
    state = next;
    render();
  };
};
