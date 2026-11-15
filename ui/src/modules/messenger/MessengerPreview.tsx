import { IconMessageCircle } from '@tabler/icons-react';
import { Card } from 'erxes-ui';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MessengerForm } from './queries.ts';

declare module 'react' {
  interface CSSProperties {
    '--messenger-color'?: string;
    '--messenger-text'?: string;
    '--messenger-background'?: string;
  }
}

/** The bubbles a visitor reads first: the welcome, then the bot's greeting and menu. */
const Bubbles = ({ form }: { form: MessengerForm }) => (
  <div className="flex flex-1 flex-col gap-2 bg-(--messenger-background) p-3">
    {[form.welcome, form.botGreeting].filter(Boolean).map((text) => (
      <p key={text} className="self-start rounded-lg bg-muted px-3 py-2 text-xs">
        {text}
      </p>
    ))}
    <div className="flex flex-wrap gap-1">
      {form.botMenu
        .filter((item) => item.text)
        .map((item) => (
          <span
            key={item.text}
            className="rounded-full border border-(--messenger-color) px-2 py-1 text-xs"
          >
            {item.text}
          </span>
        ))}
    </div>
  </div>
);

/** The messenger as a visitor sees it, drawn from the form's unsaved values. */
export const MessengerPreview = () => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<MessengerForm>();
  const values = useWatch({ control, compute: (form: MessengerForm) => form });
  const online = values.availability === 'manual' ? values.isOnline : null;

  return (
    <Card
      aria-label={t('messenger-preview', 'Preview')}
      className="sticky top-6 overflow-hidden"
      style={{
        '--messenger-color': values.color,
        '--messenger-text': values.textColor,
        '--messenger-background': values.backgroundColor ?? undefined,
      }}
    >
      <div className="flex min-h-96 flex-col">
        <div className="flex flex-col gap-1 bg-(--messenger-color) p-4 text-(--messenger-text)">
          {values.logo && <img src={values.logo} alt="" className="size-8 rounded-full" />}
          <span className="font-semibold">
            {values.greetingTitle || t('messenger-preview-title', 'Hi there')}
          </span>
          <span className="text-xs">{values.greetingMessage}</span>
          <span className="text-xs">
            {online === false
              ? t('messenger-preview-offline', 'We are away')
              : t('messenger-preview-online', 'Usually answers in a few {{rate}}', {
                  rate: values.responseRate,
                })}
          </span>
        </div>
        <Bubbles form={values} />
        <div className="flex justify-end p-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-(--messenger-color) text-(--messenger-text)">
            {values.launcherLogo ? (
              <img src={values.launcherLogo} alt="" className="size-6 rounded-full" />
            ) : (
              <IconMessageCircle />
            )}
          </span>
        </div>
      </div>
    </Card>
  );
};
