import { toast } from 'erxes-ui';
import { useEffect } from 'react';
import { getI18n } from 'react-i18next';
import ringtone from './ringtone.mp3';

/**
 * Rings, on a loop, while `ringing` holds. A browser that blocks sound until the member clicks
 * the page says so in a toast, so a call doesn't ring unheard.
 */
export const useRingtone = (ringing: boolean) => {
  useEffect(() => {
    if (!ringing) return;

    const audio = new Audio(ringtone);
    let stopped = false;

    audio.loop = true;
    audio.play().catch((error: unknown) => {
      // Stopping rejects a pending play() too; only the browser's block is worth telling.
      if (stopped || !(error instanceof DOMException) || error.name !== 'NotAllowedError') return;

      toast({
        variant: 'warning',
        title: getI18n().t('ringtone-blocked', {
          ns: 'frontline',
          defaultValue: 'The browser muted the ringtone. Click anywhere on the page to hear calls.',
        }),
      });
    });

    return () => {
      stopped = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [ringing]);
};
