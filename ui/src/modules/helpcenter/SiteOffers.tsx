import { IconForms, IconMessage } from '@tabler/icons-react';
import { PanelField, PanelSection } from 'erxes-ui';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Badges, PickerField, PickerSelect } from '~/shared/Pickers.tsx';
import { SettingField } from '~/shared/Settings.tsx';
import type { GeneralValues } from './HelpCenterGeneral.tsx';
import {
  type HelpCenter,
  useEditHelpCenter,
  useFormNames,
  useFormOptions,
  useMessengerOptions,
} from './queries.ts';

/** The picked forms' names, and how many sit in channels the member can't see. */
const useFormLabels = (formIds: string[]) => {
  const { t } = useTranslation('frontline');
  const names = useFormNames(formIds);
  const hidden = formIds.filter((id) => !names.has(id)).length;

  return [
    ...formIds.flatMap((id) => names.get(id) ?? []),
    ...(hidden > 0
      ? [t('forms-elsewhere', { defaultValue: '{{count}} in other channels', count: hidden })]
      : []),
  ];
};

/** The active forms to pick from, searched on the API as the member types. */
const useFormPicks = () => {
  const [search, setSearch] = useState('');
  const options = useFormOptions(search);

  return {
    options: options.data ?? [],
    loading: options.isPending,
    error: options.error,
    onSearchChange: setSearch,
  };
};

/** The messengers to pick from, and the picked one's name; one the list lacks is hidden. */
const useMessengerPicks = (messengerId: string | null) => {
  const { t } = useTranslation('frontline');
  const messengers = useMessengerOptions();

  const picked =
    messengerId &&
    messengers.data &&
    (messengers.data.find((option) => option.value === messengerId)?.label ??
      t('messenger-elsewhere', 'A messenger in another channel'));

  return {
    picked,
    options: messengers.data ?? [],
    loading: messengers.isPending,
    error: messengers.error,
  };
};

/** The forms its site offers, in order, in core's side panel. */
export const Forms = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);

  return (
    <PanelSection title={t('forms', 'Forms')}>
      <PanelField icon={IconForms} label={t('forms', 'Forms')} cell={false}>
        <PickerField
          label={t('forms', 'Forms')}
          placeholder={t('no-forms', 'No forms')}
          display={<Badges labels={useFormLabels(center.formIds)} max={3} />}
          {...useFormPicks()}
          value={center.formIds}
          onValueChange={(formIds) => edit({ formIds })}
          multiple
        />
      </PanelField>
    </PanelSection>
  );
};

/** The messenger its site loads, in core's side panel. */
export const Tickets = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const { picked, ...picks } = useMessengerPicks(center.messengerId);

  return (
    <PanelSection title={t('tickets', 'Tickets')}>
      <PanelField icon={IconMessage} label={t('messenger', 'Messenger')} cell={false}>
        <PickerField
          label={t('messenger', 'Messenger')}
          placeholder={t('none', 'None')}
          display={<span className="truncate">{picked}</span>}
          {...picks}
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

/** The forms its site offers, in order, on its page's form. */
export const FormsField = () => {
  const { t } = useTranslation('frontline');
  const formIds = useWatch<GeneralValues, 'formIds'>({ name: 'formIds' });
  const labels = useFormLabels(formIds);
  const picks = useFormPicks();

  return (
    <SettingField<GeneralValues, 'formIds'> name="formIds" label={t('forms', 'Forms')} bare>
      {(field) => (
        <PickerSelect
          label={t('forms', 'Forms')}
          placeholder={t('no-forms', 'No forms')}
          display={<Badges labels={labels} max={3} />}
          {...picks}
          value={field.value}
          onValueChange={field.onChange}
          multiple
        />
      )}
    </SettingField>
  );
};

/** The messenger every page of its site loads, on its page's form. */
export const MessengerField = () => {
  const { t } = useTranslation('frontline');
  const messengerId = useWatch<GeneralValues, 'messengerId'>({ name: 'messengerId' });
  const { picked, ...picks } = useMessengerPicks(messengerId);

  return (
    <SettingField<GeneralValues, 'messengerId'>
      name="messengerId"
      label={t('messenger', 'Messenger')}
      hint={t(
        'hc-messenger-hint',
        'Every page of the site shows this messenger. Its own settings turn on its Tickets tab and pick the pipelines.',
      )}
      bare
    >
      {(field) => (
        <PickerSelect
          label={t('messenger', 'Messenger')}
          placeholder={t('none', 'None')}
          display={<span className="truncate">{picked}</span>}
          {...picks}
          value={field.value ? [field.value] : []}
          onValueChange={([id]) => field.onChange(id ?? null)}
          noneLabel={t('none', 'None')}
        />
      )}
    </SettingField>
  );
};
