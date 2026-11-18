import { getContrast } from 'color2k';
import { Button, ColorPicker, Form } from 'erxes-ui';
import { type FieldPathByValue, useFormContext, useWatch } from 'react-hook-form';
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

/** The contrast small text needs to be read by everyone (WCAG AA). */
const READABLE = 4.5;

const parses = (color: string) => CSS.supports('color', color);

/** A warning when the header's text is hard to read on its colour. */
const ContrastNote = () => {
  const { t } = useTranslation('frontline');

  const [color, textColor] = useWatch<MessengerForm, ['color', 'textColor']>({
    name: ['color', 'textColor'],
  });

  // A colour typed halfway doesn't parse yet; it gets its note once it does.
  const ratio = parses(color) && parses(textColor) ? getContrast(color, textColor) : READABLE;

  if (ratio >= READABLE) return null;

  return (
    <p className="text-sm text-warning-text sm:col-span-2">
      {t(
        'messenger-contrast-low',
        'Text on this colour reads at {{ratio}}:1. Visitors need {{needed}}:1 to read it easily.',
        { ratio: ratio.toFixed(1), needed: READABLE },
      )}
    </p>
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
      <ContrastNote />
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
