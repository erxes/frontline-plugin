import { join } from 'node:path';
import { app, BrowserWindow, dialog, nativeTheme, shell, type WebContents } from 'electron';
import { saveSettings, settings } from './settings.ts';
import { textIn } from './text.ts';

/** What the page may ask for, and only from erxes's own address. */
const PERMISSIONS = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

/**
 * A number from a `tel:` link, as the phone dials it. Escapes decode byte by byte, which can't
 * throw on a broken one, and a non-ASCII byte is no digit, so the filter drops it.
 */
export const telNumber = (url: string) =>
  url.startsWith('tel:')
    ? url
        .slice(4)
        .replace(/%([\da-f]{2})/gi, (_escape, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        )
        .replace(/[^\d+*#]/g, '')
    : null;

/** Whether `url` is on erxes's saved address. */
const onServer = (url: string) => {
  const { server } = settings();

  return Boolean(server) && URL.parse(url)?.origin === server;
};

/** The setup page: the address form, with why erxes didn't load when `error` says. */
export const showSetup = (window: BrowserWindow, error?: string) =>
  window.loadFile(join(app.getAppPath(), 'dist/setup.html'), {
    query: { address: settings().server ?? '', error: error ?? '' },
  });

/** erxes web at the saved address, on Frontline's pages, or the setup page when none is saved. */
export const showServer = (window: BrowserWindow) => {
  const { server } = settings();

  return server ? window.loadURL(`${server}/frontline`) : showSetup(window);
};

/**
 * What the page reaches: the camera, microphone and notifications for erxes only, and other
 * sites and mail links in the system's apps. A `tel:` link dials.
 */
const fence = (contents: WebContents, onDial: (number: string) => void) => {
  const away = (url: string) => {
    const number = telNumber(url);

    if (number) onDial(number);
    else if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
  };

  contents.session.setPermissionRequestHandler((_contents, permission, allow, details) => {
    // A link to another app's scheme, such as tel: or mailto:, asks to leave Chromium.
    if (permission === 'openExternal') {
      if ('externalURL' in details && details.externalURL && onServer(details.requestingUrl))
        away(details.externalURL);

      return allow(false);
    }

    allow(PERMISSIONS.has(permission) && onServer(details.requestingUrl));
  });
  contents.session.setPermissionCheckHandler(
    (_contents, permission, origin) => PERMISSIONS.has(permission) && onServer(origin),
  );

  // A popup of erxes's own, such as a print view, gets the same fence.
  contents.setWindowOpenHandler(({ url }) => {
    if (onServer(url)) return { action: 'allow' };

    away(url);

    return { action: 'deny' };
  });
  contents.on('did-create-window', (child) => fence(child.webContents, onDial));
  contents.on('will-navigate', (event) => {
    if (onServer(event.url)) return;

    event.preventDefault();
    away(event.url);
  });
};

type Options = {
  /** Whether the app is quitting, so closing the window really closes it. */
  quitting: () => boolean;
  /** The member chose to stay on a call the page held. */
  onStay: () => void;
  /** The member's language, for the dialog that guards a call. */
  language: () => string;
  /** Started with the computer: the window waits in the tray. */
  hidden: boolean;
  onDial: (number: string) => void;
};

/**
 * The one window: erxes web, where the member signs in and the softphone runs. Closing it hides
 * it to the tray, so the phone keeps ringing; it never throttles in the background. It opens
 * where the member last left it.
 */
export const createWindow = ({ quitting, onStay, language, hidden, onDial }: Options) => {
  const { bounds, maximized } = settings();

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Frontline',
    // The setup page's colour, so no white flashes before a page paints in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#fafafa',
    // macOS and Windows take the icon from the app; Linux's window list asks the window.
    ...(process.platform === 'linux' && { icon: join(app.getAppPath(), 'dist/icon.png') }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const { webContents } = window;

  fence(webContents, onDial);

  // erxes unreachable: the setup page says why and tries again. -3 is a navigation the page
  // itself cut short.
  webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) void showSetup(window, description);
  });

  // The softphone holds the page while a call is on; a reload or quit asks first.
  webContents.on('will-prevent-unload', (event) => {
    const text = textIn(language());

    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: [text.stay, text.leave],
      defaultId: 0,
      cancelId: 0,
      message: text.leaveTitle,
      detail: text.leaveDetail,
    });

    if (choice === 1) event.preventDefault();
    else onStay();
  });

  window.on('close', (event) => {
    saveSettings({ bounds: window.getNormalBounds(), maximized: window.isMaximized() });

    if (quitting()) return;

    event.preventDefault();
    window.hide();
  });

  window.once('ready-to-show', () => {
    if (hidden) return;

    if (maximized) window.maximize();

    window.show();
  });

  void showServer(window);

  return window;
};
