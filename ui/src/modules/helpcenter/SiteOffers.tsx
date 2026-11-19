import { IconForms, IconMessage } from '@tabler/icons-react';
import { PanelField, PanelSection } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badges, PickerField } from '~/shared/Pickers.tsx';
import {
  type HelpCenter,
  useEditHelpCenter,
  useFormNames,
  useFormOptions,
  useMessengerOptions,
} from './queries.ts';

/** The forms its site offers, in order. */
export const Forms = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const [search, setSearch] = useState('');
  const options = useFormOptions(search);
  const names = useFormNames(center.formIds);
  const hidden = center.formIds.filter((id) => !names.has(id)).length;

  const labels = [
    ...center.formIds.flatMap((id) => names.get(id) ?? []),
    ...(hidden > 0
      ? [t('forms-elsewhere', { defaultValue: '{{count}} in other channels', count: hidden })]
      : []),
  ];

  return (
    <PanelSection title={t('forms', 'Forms')}>
      <PanelField icon={IconForms} label={t('forms', 'Forms')} cell={false}>
        <PickerField
          label={t('forms', 'Forms')}
          placeholder={t('no-forms', 'No forms')}
          display={<Badges labels={labels} max={3} />}
          options={options.data ?? []}
          loading={options.isPending}
          error={options.error}
          onSearchChange={setSearch}
          value={center.formIds}
          onValueChange={(formIds) => edit({ formIds })}
          multiple
        />
      </PanelField>
    </PanelSection>
  );
};

/** The messenger its site loads, where visitors chat and send and follow their tickets. */
export const Tickets = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const messengers = useMessengerOptions();

  // The picked messenger's name once the list loads; one the list lacks is in a hidden channel.
  const picked =
    center.messengerId &&
    messengers.data &&
    (messengers.data.find((option) => option.value === center.messengerId)?.label ??
      t('messenger-elsewhere', 'A messenger in another channel'));

  return (
    <PanelSection title={t('tickets', 'Tickets')}>
      <PanelField icon={IconMessage} label={t('messenger', 'Messenger')} cell={false}>
        <PickerField
          label={t('messenger', 'Messenger')}
          placeholder={t('none', 'None')}
          display={<span className="truncate">{picked}</span>}
          options={messengers.data ?? []}
          loading={messengers.isPending}
          error={messengers.error}
          value={center.messengerId ? [center.messengerId] : []}
          onValueChange={([messengerId]) => edit({ messengerId: messengerId ?? null })}
          noneLabel={t('none', 'None')}
        />
      </PanelField>
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {t(
          'hc-messenger-hint',
          'Every page of the site shows this messenger. Its own settings turn on its Tickets tab and pick the pipelines.',
        )}
      </p>
    </PanelSection>
  );
};
