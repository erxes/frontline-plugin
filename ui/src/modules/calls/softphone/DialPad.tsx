import { IconBackspace, IconPhone } from '@tabler/icons-react';
import { Button, Input } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** The phone's twelve keys; on a call each sends its tone. */
export const DialPad = ({ onPress }: { onPress: (key: string) => void }) => (
  <div className="grid grid-cols-3 gap-2">
    {KEYS.map((key) => (
      <Button key={key} variant="secondary" size="lg" onClick={() => onPress(key)}>
        {key}
      </Button>
    ))}
  </div>
);

/** A number typed or pressed in, and the button that calls it. */
export const Dialer = ({ ready, onDial }: { ready: boolean; onDial: (number: string) => void }) => {
  const { t } = useTranslation('frontline');
  const [number, setNumber] = useState('');
  const dialable = ready && number.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (dialable) onDial(number.trim());
      }}
    >
      <div className="flex gap-2">
        <Input
          value={number}
          inputMode="tel"
          aria-label={t('phone-number', 'Phone number')}
          placeholder={t('phone-number', 'Phone number')}
          onChange={(event) => setNumber(event.target.value.replace(/[^\d*#+]/g, ''))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('delete-digit', 'Delete a digit')}
          onClick={() => setNumber(number.slice(0, -1))}
        >
          <IconBackspace />
        </Button>
      </div>
      <DialPad onPress={(key) => setNumber(number + key)} />
      <Button type="submit" size="lg" disabled={!dialable}>
        <IconPhone />
        {t('call', 'Call')}
      </Button>
    </form>
  );
};
