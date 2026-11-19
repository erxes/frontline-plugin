import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type { CardBridge, CardState, DesktopBridge, PhoneCommand, SetupBridge } from './bridge.ts';
import { CHANNELS } from './channels.ts';

const desktop: DesktopBridge = {
  phone: (state) => ipcRenderer.send(CHANNELS.phone, state),
  onCommand: (listener) => {
    const relay = (_event: IpcRendererEvent, command: PhoneCommand) => listener(command);

    ipcRenderer.on(CHANNELS.command, relay);

    return () => void ipcRenderer.off(CHANNELS.command, relay);
  },
};

contextBridge.exposeInMainWorld('erxesDesktop', desktop);

// A tel: link goes to the app before Chromium navigates, which would first ask the page to
// unload and, on a call, show the softphone's "you are on a call" hold.
document.addEventListener(
  'click',
  (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="tel:"]') : null;

    if (!(link instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    ipcRenderer.send(CHANNELS.dial, link.href);
  },
  true,
);

// The setup page and the call card are the app's own files; erxes web never gets these.
if (location.protocol === 'file:') {
  const setup: SetupBridge = {
    connect: (address) => ipcRenderer.send(CHANNELS.connect, address),
  };

  const card: CardBridge = {
    onState: (listener) =>
      void ipcRenderer.on(CHANNELS.card, (_event, state: CardState) => listener(state)),
    send: (command) => ipcRenderer.send(CHANNELS.cardCommand, command),
  };

  contextBridge.exposeInMainWorld('erxesSetup', setup);
  contextBridge.exposeInMainWorld('erxesCard', card);
}
