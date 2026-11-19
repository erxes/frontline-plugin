import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type { DesktopBridge, PhoneCommand, SetupBridge } from './bridge.ts';
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

// The setup page is the app's own file; erxes web never gets it.
if (location.protocol === 'file:') {
  const setup: SetupBridge = {
    connect: (address) => ipcRenderer.send(CHANNELS.connect, address),
  };

  contextBridge.exposeInMainWorld('erxesSetup', setup);
}
