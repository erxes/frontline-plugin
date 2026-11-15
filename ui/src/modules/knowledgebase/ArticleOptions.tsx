import { DatePicker, MultipleSelector, Select, Switch, TimeField } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '~/shared/SidePanel.tsx';
import { FileList, FilePicker, ImageField } from './Files.tsx';
import {
  ARTICLE_STATUSES,
  type ArticleDetail,
  REACTIONS,
  useStatusNames,
} from './useKnowledgeBase.ts';

/** An article form's values. */
export type ArticleDraft = Pick<
  ArticleDetail,
  | 'title'
  | 'categoryId'
  | 'content'
  | 'status'
  | 'scheduledAt'
  | 'isPrivate'
  | 'reactionChoices'
  | 'image'
  | 'attachments'
  | 'pdfAttachment'
> & { summary: string };

type Props = { value: ArticleDraft; onChange: (patch: Partial<ArticleDraft>) => void };

const pad = (value: number) => String(value).padStart(2, '0');

/** `at` moved to `day`, keeping its time of day, or 09:00 for a new time. */
const onDay = (at: Date | null, day: Date) => {
  const next = new Date(day);

  next.setHours(at?.getHours() ?? 9, at?.getMinutes() ?? 0, 0, 0);

  return next;
};

/** `at`, or today, at `time` (HH:mm). */
const atTime = (at: Date | null, time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const next = new Date(at ?? Date.now());

  next.setHours(hours, minutes, 0, 0);

  return next;
};

/** When the article goes live: its status, the time a scheduled one publishes, and who reads it. */
export const Publishing = ({ value, onChange }: Props) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const at = value.scheduledAt;
  // Read once per mount, so render stays pure; the API refuses a past time either way.
  const [today] = useState(() => new Date());

  return (
    <>
      <Field id="article-status" label={t('status', 'Status')}>
        <Select value={value.status} onValueChange={(status) => onChange({ status })}>
          <Select.Trigger id="article-status">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {ARTICLE_STATUSES.map((status) => (
              <Select.Item key={status} value={status}>
                {statuses[status]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </Field>
      {value.status === 'scheduled' && (
        <Field
          label={t('kb-publish-on', 'Publish on')}
          hint={t('kb-schedule-help', 'The article goes live on your help center at this time.')}
        >
          <div className="flex gap-2">
            <DatePicker
              value={at ?? undefined}
              minDate={today}
              onChange={(day) => day instanceof Date && onChange({ scheduledAt: onDay(at, day) })}
              placeholder={t('kb-pick-date', 'Pick a date')}
            />
            <TimeField
              aria-label={t('kb-publish-time', 'Time')}
              value={at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : ''}
              onValueChange={(time) => time && onChange({ scheduledAt: atTime(at, time) })}
            />
          </div>
        </Field>
      )}
      <div className="flex items-center gap-2">
        <Switch
          id="article-private"
          checked={value.isPrivate}
          onCheckedChange={(isPrivate) => onChange({ isPrivate })}
        />
        <label htmlFor="article-private" className="text-sm font-medium">
          {t('kb-is-private', 'Is Private')}
        </label>
      </div>
      <Field id="article-reactions" label={t('kb-reaction-choices', 'Reaction Choices')}>
        <MultipleSelector
          id="article-reactions"
          options={REACTIONS}
          value={value.reactionChoices.map((choice) => ({
            value: choice,
            label: REACTIONS.find((reaction) => reaction.value === choice)?.label ?? choice,
          }))}
          onChange={(options) =>
            onChange({ reactionChoices: options.map((option) => option.value) })
          }
        />
      </Field>
    </>
  );
};

/** The article's image, files to download and a PDF readers page through. */
export const Media = ({ value, onChange }: Props) => {
  const { t } = useTranslation('frontline');
  const pdf = value.pdfAttachment?.pdf;

  return (
    <>
      <Field
        label={t('image', 'Image')}
        hint={t('kb-image-help', 'Shown with the article on the published site.')}
      >
        <ImageField value={value.image?.url ?? ''} onChange={(image) => onChange({ image })} />
      </Field>
      <Field label={t('kb-attachments', 'Attachments')}>
        <FileList
          files={value.attachments}
          onRemove={(file) =>
            onChange({ attachments: value.attachments.filter((kept) => kept !== file) })
          }
        />
        <FilePicker
          label={t('kb-add-file', 'Add file')}
          onUploaded={(file) => onChange({ attachments: [...value.attachments, file] })}
        />
      </Field>
      <Field
        label={t('kb-pdf-attachment', 'PDF Attachment')}
        hint={t('kb-pdf-help', 'Readers can page through it inside the article.')}
      >
        {pdf ? (
          <FileList files={[pdf]} onRemove={() => onChange({ pdfAttachment: null })} />
        ) : (
          <FilePicker
            label={t('kb-upload-pdf', 'Upload PDF')}
            accept="application/pdf"
            onUploaded={(file) => onChange({ pdfAttachment: { pdf: file } })}
          />
        )}
      </Field>
    </>
  );
};
