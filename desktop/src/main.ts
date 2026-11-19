import { app, type BrowserWindow, ipcMain } from 'electron';
import { CHANNELS } from './channels.ts';
import { connectPhone, reveal } from './phone.ts';
import { parseServer, saveSettings } from './settings.ts';
import { textIn } from './text.ts';
import { createTray } from './tray.ts';
import { createWindow, showServer, showSetup, telNumber } from './window.ts';

/**
 * Frontline on the desktop: erxes web in one window that hides to the tray, so the web softphone
 * keeps the member's line all day. The page finds `window.erxesDesktop` (preload.ts) and tells
 * the app about calls; the app rings, and dials `tel:` links.
 */

// A second launch, such as a tel: link the system hands the app, goes to the first one.
if (!app.requestSingleInstanceLock()) app.exit();

let quitting = false;
let language = app.getLocale();
let window: BrowserWindow | null = null;
let dial = (_number: string) => {};

/** The tel: link in a launch's arguments, as Windows and Linux pass it. */
const dialFrom = (argv: string[]) => {
  const number = argv.map(telNumber).find(Boolean);

  if (number) dial(number);
};

app.on('second-instance', (_event, argv) => {
  if (window) reveal(window);

  dialFrom(argv);
});

// macOS hands over tel: links as an event, before or after the app is ready.
app.on('open-url', (event, url) => {
  event.preventDefault();

  const number = telNumber(url);

  if (number) dial(number);
});

app.on('before-quit', () => {
  quitting = true;
});

// The app lives in the tray: only Quit ends it, not the window going.
app.on('window-all-closed', () => {});

// The dock icon brings the hidden window back.
app.on('activate', () => {
  if (window) reveal(window);
});

app.on('ready', () => {
  const opened = createWindow({
    quitting: () => quitting,
    language: () => language,
    hidden: process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin,
    onDial: (number) => dial(number),
  });

  window = opened;

  const render = createTray({
    open: () => reveal(opened),
    changeServer: () => {
      reveal(opened);
      void showSetup(opened);
    },
    send: (command) => phone.send(command),
  });

  const phone = connectPhone(opened, (state) => {
    if (state) language = state.language;

    render(state);
  });

  dial = phone.dial;
  dialFrom(process.argv);

  ipcMain.on(CHANNELS.connect, (event, typed: unknown) => {
    if (event.sender !== opened.webContents || !event.senderFrame?.url.startsWith('file:')) return;

    const server = typeof typed === 'string' ? parseServer(typed) : null;

    if (!server) return void showSetup(opened, textIn(language).notAddress);

    saveSettings({ server });
    void showServer(opened);
  });
});
