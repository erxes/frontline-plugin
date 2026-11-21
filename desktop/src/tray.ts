import { join } from 'node:path';
import { app, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import type { TrayState } from '../icons.ts';
import { callerOf, type PhoneCommand, type PhoneState } from './bridge.ts';
import { textIn } from './text.ts';

type Actions = {
  open: () => void;
  changeServer: () => void;
  send: (command: PhoneCommand) => void;
};

/** The phone's line, for the menu and the tooltip: its status, or the call and who it's with. */
const statusOf = ({ language, status, call }: PhoneState) => {
  const text = textIn(language);

  if (!call) return text[status];

  const ringing = call.direction === 'incoming' && !call.talking;
  const doing = ringing ? text.incoming : call.talking ? text.onCall : text.calling;

  return `${doing}: ${callerOf(call)}`;
};

/** The call's line in the menu and what the member can do with it. */
const callItems = (state: PhoneState, actions: Actions): MenuItemConstructorOptions[] => {
  const text = textIn(state.language);
  const { call } = state;
  const status = { label: statusOf(state), enabled: false };

  if (!call) return [status];

  const ringing = call.direction === 'incoming' && !call.talking;

  return [
    status,
    ...(ringing ? [{ label: text.answer, click: () => actions.send({ type: 'answer' }) }] : []),
    {
      label: ringing ? text.decline : text.hangUp,
      click: () => actions.send({ type: 'hangUp' }),
    },
  ];
};

/** Each extension's queue switch: checked while it takes queue calls. */
const queueItems = (state: PhoneState, actions: Actions): MenuItemConstructorOptions[] => {
  const text = textIn(state.language);
  const named = state.queues.length > 1;

  return state.queues.map((queue) => ({
    type: 'checkbox',
    label:
      text.takeQueueCalls.replace('{extension}', queue.extension) +
      (named ? ` · ${queue.accountName}` : ''),
    checked: !queue.paused,
    click: () => actions.send({ type: 'queue', accountId: queue.accountId, paused: !queue.paused }),
  }));
};

/** Starting with the computer, where the system lets an app set it. Linux doesn't. */
const loginItem = (language: string): MenuItemConstructorOptions[] =>
  process.platform === 'linux'
    ? []
    : [
        {
          type: 'checkbox',
          label: textIn(language).startAtLogin,
          checked: app.getLoginItemSettings().openAtLogin,
          click: ({ checked }) =>
            app.setLoginItemSettings({ openAtLogin: checked, args: ['--hidden'] }),
        },
      ];

/** The icon for the phone's state, which build.ts renders: a template on macOS, a tile elsewhere. */
const icon = (state: PhoneState | null) => {
  const shown: TrayState = state?.call ? 'call' : state?.status === 'ready' ? 'ready' : 'offline';
  const template = process.platform === 'darwin' ? 'Template' : '';

  return nativeImage.createFromPath(join(app.getAppPath(), `dist/tray-${shown}${template}.png`));
};

/**
 * The tray icon and its menu: the phone's state, the call with Answer and Hang up, the queue
 * switches, and the window. The icon greys out while the phone is offline and gets a dot for a
 * call. The same menu on every system, since Linux's tray sends no click.
 */
export const createTray = (actions: Actions) => {
  const tray = new Tray(icon(null));

  tray.on('click', actions.open);

  const render = (state: PhoneState | null) => {
    const language = state?.language ?? app.getLocale();
    const text = textIn(language);
    tray.setImage(icon(state));
    tray.setToolTip(state ? `Frontline · ${statusOf(state)}` : 'Frontline');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...(state
          ? [
              ...callItems(state, actions),
              {
                label: text.openPhone,
                click: () => {
                  actions.open();
                  actions.send({ type: 'openPhone' });
                },
              },
              { type: 'separator' as const },
            ]
          : []),
        ...(state?.queues.length
          ? [...queueItems(state, actions), { type: 'separator' as const }]
          : []),
        { label: text.open, click: actions.open },
        { label: text.changeServer, click: actions.changeServer },
        ...loginItem(language),
        { type: 'separator' },
        { label: text.quit, click: () => app.quit() },
      ]),
    );
  };

  render(null);

  return render;
};
