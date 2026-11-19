import { join } from 'node:path';
import { app, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import type { PhoneCommand, PhoneState } from './bridge.ts';
import { textIn } from './text.ts';

type Actions = {
  open: () => void;
  changeServer: () => void;
  send: (command: PhoneCommand) => void;
};

/** The call's line in the menu and what the member can do with it. */
const callItems = (state: PhoneState, actions: Actions): MenuItemConstructorOptions[] => {
  const text = textIn(state.language);
  const { call } = state;

  if (!call) return [{ label: text[state.status], enabled: false }];

  const ringing = call.direction === 'incoming' && !call.talking;
  const doing = ringing ? text.incoming : call.talking ? text.onCall : text.calling;

  return [
    { label: `${doing}: ${call.number}`, enabled: false },
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

/**
 * The tray icon and its menu: the phone's state, the call with Answer and Hang up, the queue
 * switches, and the window. The same menu on every system, since Linux's tray sends no click.
 */
export const createTray = (actions: Actions) => {
  const tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'dist/tray.png')));

  tray.setToolTip('Frontline');
  tray.on('click', actions.open);

  const render = (state: PhoneState | null) => {
    const language = state?.language ?? app.getLocale();
    const text = textIn(language);

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
