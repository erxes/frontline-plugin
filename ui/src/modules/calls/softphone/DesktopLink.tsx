import type { DesktopBridge, PhoneCommand } from '@frontline/desktop';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgents } from '@/calls/queries.ts';
import type { Phone } from './useSip.ts';

declare global {
  interface Window {
    /** The Frontline desktop app's preload (desktop/src/preload.ts); absent in a browser. */
    erxesDesktop?: DesktopBridge;
  }
}

/** The desktop app around the page, if the page is in it. */
export const desktop = window.erxesDesktop;

/**
 * The phone's side of the desktop app: tells it the phone's state, which rings, notifies and
 * fills the tray, and does what the tray, a notification or a tel: link asks. `onOpen` shows
 * the Phone page, for the tray and a number dialed from outside. Renders nothing.
 */
export const DesktopLink = ({
  bridge,
  phone,
  onOpen,
}: {
  bridge: DesktopBridge;
  phone: Phone;
  onOpen: () => void;
}) => {
  const { i18n } = useTranslation();
  const { agents, setStatus } = useAgents();
  const { status, call } = phone;

  useEffect(() => {
    bridge.phone({
      language: i18n.language,
      status,
      call: call && { number: call.number, direction: call.direction, talking: call.talking },
      queues: agents.map((agent) => ({
        accountId: agent.accountId,
        accountName: agent.accountName,
        extension: agent.extension,
        paused: agent.status === 'paused',
      })),
    });
  }, [bridge, i18n.language, status, call, agents]);

  useEffect(() => () => bridge.phone(null), [bridge]);

  const run = useEffectEvent((command: PhoneCommand) => {
    switch (command.type) {
      case 'answer':
        return phone.answer();
      case 'hangUp':
        return phone.hangUp();
      case 'openPhone':
        return onOpen();
      case 'dial':
        onOpen();

        return phone.dial(command.number);
      case 'queue':
        return setStatus.mutate({
          accountId: command.accountId,
          status: command.paused ? 'paused' : 'available',
        });
    }
  });

  useEffect(() => bridge.onCommand(run), [bridge]);

  return null;
};
