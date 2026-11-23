import { IconBrandFacebook } from '@tabler/icons-react';
import { PanelFormRow } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PickerField } from '~/shared/Pickers.tsx';
import { useFacebookConnections } from './useIntegrations.ts';

/**
 * Facebook and Instagram: one of the organisation's Facebook connections in core, the first to
 * start with. Every page it manages connects, with its Instagram account. With none, it links to
 * core's Settings › Integrations › Facebook, where an organisation connects one.
 */
export const MetaFields = () => {
  const { t } = useTranslation('frontline');
  const connections = useFacebookConnections();
  const [picked, setPicked] = useState<string | null>(null);

  const options = (connections.data?.data ?? []).map(({ id, name }) => ({
    value: id,
    label: name,
  }));

  const connectionId = picked ?? options[0]?.value ?? '';
  const label = t('facebook-connection-label', 'Facebook connection');

  const hint = t(
    'facebook-connection-hint',
    "Pages and Instagram accounts connect through erxes's Facebook connection. Every page it manages connects; pages connected before move to it.",
  );

  if (connections.data && options.length === 0)
    return (
      <PanelFormRow label={label} icon={IconBrandFacebook} hint={hint}>
        <Link to={connections.data.settingsPath} className="text-sm underline">
          {t('facebook-connection-none', 'Connect Facebook in Settings › Integrations › Facebook')}
        </Link>
      </PanelFormRow>
    );

  return (
    <PanelFormRow label={label} icon={IconBrandFacebook} required hint={hint}>
      <PickerField
        label={label}
        display={options.find((option) => option.value === connectionId)?.label ?? connectionId}
        placeholder={label}
        options={options}
        value={connectionId ? [connectionId] : []}
        onValueChange={([id]) => id && setPicked(id)}
        loading={connections.isPending}
        error={connections.error}
      />
      <input type="hidden" name="connectionId" value={connectionId} />
    </PanelFormRow>
  );
};
