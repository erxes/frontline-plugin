import { IconArchive, IconRestore } from '@tabler/icons-react';
import { Button } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

/** A selection bar's Archive and Activate buttons; `set` moves the selected records. */
export const ArchiveButtons = ({
  disabled,
  set,
}: {
  disabled: boolean;
  set: (status: 'active' | 'archived') => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => set('archived')}>
        <IconArchive />
        {t('archive', 'Archive')}
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => set('active')}>
        <IconRestore />
        {t('activate', 'Activate')}
      </Button>
    </>
  );
};
