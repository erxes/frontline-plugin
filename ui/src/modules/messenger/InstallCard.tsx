import { useTranslation } from 'react-i18next';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { SettingsCard } from './fields.tsx';

/** The line a website adds to show the messenger, copied with a click. */
export const InstallCard = ({ scriptUrl }: { scriptUrl: string }) => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-install', 'Install')}
      description={t(
        'messenger-install-description',
        'Paste this line before </body> on every page that shows the messenger.',
      )}
    >
      <div className="sm:col-span-2">
        <InstallCode
          code={scriptTag(scriptUrl)}
          label={t('messenger-install-code', 'Messenger install code')}
        />
      </div>
    </SettingsCard>
  );
};
