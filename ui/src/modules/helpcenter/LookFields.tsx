import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Button, ColorPicker, Form, Input, Select, Textarea } from 'erxes-ui';
import { type FieldPathByValue, useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ImageField } from '~/shared/Files.tsx';
import type { HelpCenter } from './queries.ts';

/** What the appearance page edits; an empty text, colour or image is unset on Save. */
export type Look = Pick<HelpCenter, 'styles' | 'header' | 'footer'> & {
  color: string;
  backgroundImage: string;
};

type TextPath = FieldPathByValue<Look, string | undefined>;

/** The fonts a help center's text can use, as the old help center offered them. */
const FONTS = [
  { label: 'Ubuntu', value: 'Ubuntu, sans-serif' },
  { label: 'Lobster', value: 'Lobster, cursive' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Roboto Condensed', value: "'Roboto Condensed', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Nunito', value: 'Nunito, sans-serif' },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'Merriweather', value: 'Merriweather, serif' },
];

const DEFAULT_FONT = 'default';

/** A text setting; `long` makes it a full-width text box. */
export const TextRow = ({
  name,
  label,
  placeholder,
  long = false,
}: {
  name: TextPath;
  label: string;
  placeholder?: string;
  long?: boolean;
}) => {
  const { control } = useFormContext<Look>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item className={long ? 'sm:col-span-2' : undefined}>
          <Form.Label>{label}</Form.Label>
          <Form.Control>
            {long ? (
              <Textarea {...field} value={field.value ?? ''} placeholder={placeholder} />
            ) : (
              <Input {...field} value={field.value ?? ''} placeholder={placeholder} />
            )}
          </Form.Control>
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

export const ColorRow = ({ name, label }: { name: TextPath; label: string }) => {
  const { control } = useFormContext<Look>();

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
              value={field.value || undefined}
              onValueChange={field.onChange}
              className="w-16"
            />
          </Form.Control>
        </Form.Item>
      )}
    />
  );
};

export const ImageRow = ({ name, label }: { name: TextPath; label: string }) => {
  const { control } = useFormContext<Look>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <ImageField
            value={field.value ?? ''}
            onChange={(file) => field.onChange(file?.url ?? '')}
          />
        </Form.Item>
      )}
    />
  );
};

export const FontRow = ({ name, label }: { name: TextPath; label: string }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Look>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <Select
            value={field.value || DEFAULT_FONT}
            onValueChange={(font) => field.onChange(font === DEFAULT_FONT ? '' : font)}
          >
            <Form.Control>
              <Select.Trigger aria-label={label}>
                <Select.Value>
                  {FONTS.find((font) => font.value === field.value)?.label ??
                    t('default-font', 'Default font')}
                </Select.Value>
              </Select.Trigger>
            </Form.Control>
            <Select.Content>
              <Select.Item value={DEFAULT_FONT}>{t('default-font', 'Default font')}</Select.Item>
              {FONTS.map((font) => (
                <Select.Item key={font.value} value={font.value}>
                  {font.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Form.Item>
      )}
    />
  );
};

/** A footer column's links, each a label and an address. */
const ColumnLinks = ({ column }: { column: number }) => {
  const { t } = useTranslation('frontline');
  const { control, register } = useFormContext<Look>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: `footer.columns.${column}.links`,
  });

  return (
    <div className="flex flex-col gap-2">
      {fields.map((link, index) => (
        <div key={link.id} className="flex items-center gap-2">
          <Input
            aria-label={t('footer-link-label', 'Link label')}
            placeholder={t('footer-link-label', 'Link label')}
            {...register(`footer.columns.${column}.links.${index}.label`)}
          />
          <Input
            aria-label={t('footer-link-url', 'Link address')}
            placeholder="https://"
            {...register(`footer.columns.${column}.links.${index}.url`)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('footer-remove-link', 'Remove link')}
            onClick={() => remove(index)}
          >
            <IconTrash />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="w-min"
        onClick={() => append({ label: '', url: '' })}
      >
        <IconPlus />
        {t('footer-add-link', 'Add link')}
      </Button>
    </div>
  );
};

/**
 * The footer's columns of links, up to six. Once one is saved they replace the site's built-in
 * columns; a link without both a label and an address is dropped on Save.
 */
export const FooterColumns = () => {
  const { t } = useTranslation('frontline');
  const { control, register } = useFormContext<Look>();
  const { fields, append, remove } = useFieldArray({ control, name: 'footer.columns' });

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <span className="text-sm font-medium">{t('footer-columns', 'Link columns')}</span>
      {fields.map((column, index) => (
        <div key={column.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={t('footer-column-heading', 'Column heading')}
              placeholder={t('footer-column-heading', 'Column heading')}
              {...register(`footer.columns.${index}.heading`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('footer-remove-column', 'Remove column')}
              onClick={() => remove(index)}
            >
              <IconTrash />
            </Button>
          </div>
          <ColumnLinks column={index} />
        </div>
      ))}
      {fields.length < 6 && (
        <Button
          type="button"
          variant="outline"
          className="w-min"
          onClick={() => append({ heading: '', links: [{ label: '', url: '' }] })}
        >
          <IconPlus />
          {t('footer-add-column', 'Add column')}
        </Button>
      )}
    </div>
  );
};
