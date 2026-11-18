import { Button, ColorPicker, Form } from 'erxes-ui';
import { type FieldPathByValue, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ImageField } from '~/shared/Files.tsx';
import { SettingsCard } from '~/shared/Settings.tsx';
import { ChoiceRow } from './fields.tsx';
import { COLOR_THEMES, type MessengerForm } from './queries.ts';

const ColorRow = ({
  name,
  label,
}: {
  name: FieldPathByValue<MessengerForm, string | null>;
  label: string;
}) => {
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <Form.Control>
            <ColorPicker
              aria-label={label}
              value={field.value ?? undefined}
              onValueChange={field.onChange}
              className="w-min"
            />
          </Form.Control>
        </Form.Item>
      )}
    />
  );
};

const ImageRow = ({ name, label }: { name: 'logo' | 'launcherLogo'; label: string }) => {
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <ImageField
            value={field.value ?? ''}
            onChange={(file) => field.onChange(file?.url ?? null)}
          />
        </Form.Item>
      )}
    />
  );
};

/** The ready-made colour pairs: one click sets the launcher's colour and its text's. */
const Themes = () => {
  const { t } = useTranslation('frontline');
  const { setValue } = useFormContext<MessengerForm>();

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-medium">{t('messenger-themes', 'Themes')}</span>
      <div className="flex flex-wrap gap-2">
        {COLOR_THEMES.map((theme) => (
          <Button
            key={theme.name}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setValue('color', theme.color, { shouldDirty: true });
              setValue('textColor', theme.textColor, { shouldDirty: true });
            }}
          >
            {t(`messenger-theme-${theme.name.toLowerCase()}`, theme.name)}
          </Button>
        ))}
      </div>
    </div>
  );
};

/** How the messenger looks: colours, logos and the header's style. */
export const AppearanceCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('messenger-appearance', 'Appearance')}
      description={t(
        'messenger-appearance-description',
        'The colours, logos and header style visitors see.',
      )}
    >
      <Themes />
      <ColorRow name="color" label={t('messenger-color', 'Color')} />
      <ColorRow name="textColor" label={t('messenger-text-color', 'Text color')} />
      <ColorRow name="backgroundColor" label={t('messenger-background', 'Background')} />
      <ChoiceRow
        name="heroStyle"
        label={t('messenger-hero-style', 'Header style')}
        options={[
          { value: 'glossy', label: t('messenger-hero-glossy', 'Glossy') },
          { value: 'aurora', label: t('messenger-hero-aurora', 'Aurora') },
          { value: 'mesh', label: t('messenger-hero-mesh', 'Mesh') },
          { value: 'flat', label: t('messenger-hero-flat', 'Flat') },
        ]}
      />
      <ChoiceRow
        name="navigation"
        label={t('messenger-navigation', 'Navigation')}
        options={[
          { value: 'pill', label: t('messenger-navigation-pill', 'Pill') },
          { value: 'fluid', label: t('messenger-navigation-fluid', 'Fluid') },
        ]}
      />
      <ImageRow name="logo" label={t('messenger-logo', 'Logo')} />
      <ImageRow name="launcherLogo" label={t('messenger-launcher-logo', 'Launcher logo')} />
    </SettingsCard>
  );
};
