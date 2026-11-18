import { readImage, ToggleGroup } from 'erxes-ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormButton, FormPreview } from './FormPreview.tsx';
import type { Form, FormField } from './useForms.ts';

const SCREENS = ['callout', 'form', 'thanks'] as const;

type Screen = (typeof SCREENS)[number];

/** A callout or thank-you screen: its image, title and text, as the embed draws them. */
const Message = ({
  image,
  title,
  text,
  children,
}: {
  image: Form['calloutImage'];
  title: string | null;
  text: string | null;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <section
      aria-label={t('form-preview', 'Preview')}
      className="flex flex-col gap-3 rounded-lg border bg-background p-5"
    >
      {image && <img src={readImage(image.url)} alt="" className="max-h-48 rounded object-cover" />}
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
      {children}
    </section>
  );
};

/**
 * What a visitor sees, screen by screen: the callout a popup or shoutbox opens with, the form,
 * and the thank-you after sending.
 */
export const FormScreens = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const [picked, setScreen] = useState<Screen>('form');
  const screens = SCREENS.filter((screen) => screen !== 'callout' || !form.calloutSkip);
  const screen = screens.includes(picked) ? picked : 'form';

  const names: Record<Screen, string> = {
    callout: t('form-callout', 'Callout'),
    form: t('form', 'Form'),
    thanks: t('form-thank-you', 'Thank you'),
  };

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        value={[screen]}
        onValueChange={([value]) => {
          const next = SCREENS.find((each) => each === value);

          if (next) setScreen(next);
        }}
        size="sm"
        variant="outline"
        aria-label={t('form-screen', 'Screen')}
        className="self-center"
      >
        {screens.map((each) => (
          <ToggleGroup.Item key={each} value={each}>
            {names[each]}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup>
      {screen === 'callout' && (
        <Message image={form.calloutImage} title={form.calloutTitle} text={form.calloutBody}>
          <FormButton form={form} label={form.calloutButtonText || t('form-start', 'Start')} />
        </Message>
      )}
      {screen === 'form' && <FormPreview form={form} fields={fields} />}
      {screen === 'thanks' && (
        <Message
          image={form.thankImage}
          title={form.thankTitle || t('form-thank-you', 'Thank you')}
          text={form.thankContent}
        />
      )}
    </div>
  );
};
