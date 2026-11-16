import { CopyText } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from './fields.tsx';

/** The line a website adds to show the messenger, copied with a click. */
export const InstallCard = ({ scriptUrl }: { scriptUrl: string }) => {
  const { t } = useTranslation('frontline');
  const snippet = `<script type="module" src="${scriptUrl}"></script>`;

  return (
    <SettingsCard
      title={t('messenger-install', 'Install')}
      description={t(
        'messenger-install-description',
        'Paste this line before </body> on every page that shows the messenger.',
      )}
    >
      <CopyText value={snippet} className="sm:col-span-2">
        <code className="block rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
          {snippet}
        </code>
      </CopyText>
    </SettingsCard>
  );
};
