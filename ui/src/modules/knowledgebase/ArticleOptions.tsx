import {
  IconCalendarTime,
  IconFile,
  IconFileTypePdf,
  IconLock,
  IconMoodSmile,
  IconPhoto,
  IconProgressCheck,
} from '@tabler/icons-react';
import {
  DatePicker,
  MultipleSelector,
  PanelField,
  PanelSection,
  Select,
  Switch,
  TimeField,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from './ArticleCells.tsx';
import { FileList, FilePicker, ImageField } from './Files.tsx';
import {
  ARTICLE_STATUSES,
  type ArticleDetail,
  REACTIONS,
  useStatusNames,
} from './useKnowledgeBase.ts';

/** A change to the article, saved as soon as it's made. */
export type ArticleEdit = Partial<
  Pick<
    ArticleDetail,
    | 'title'
    | 'summary'
    | 'categoryId'
    | 'content'
    | 'status'
    | 'scheduledAt'
    | 'isPrivate'
    | 'reactionChoices'
    | 'image'
    | 'attachments'
    | 'pdfAttachment'
  >
>;

type Props = { article: ArticleDetail; edit: (fields: ArticleEdit) => void };

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

/**
 * When the article goes live and who reads it: its status, the time a scheduled one publishes
 * (picking one schedules it), privacy and the reactions readers leave.
 */
export const Publishing = ({ article, edit }: Props) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const at = article.scheduledAt;
  // Read once per mount, so render stays pure; the API refuses a past time either way.
  const [today] = useState(() => new Date());
  const schedule = (scheduledAt: Date) => edit({ status: 'scheduled', scheduledAt });

  return (
    <PanelSection title={t('kb-publishing', 'Publishing')}>
      <PanelField icon={IconProgressCheck} label={t('status', 'Status')}>
        <Select value={article.status} onValueChange={(status) => edit({ status })}>
          <Select.Trigger variant="flush" aria-label={t('status', 'Status')}>
            <StatusBadge status={article.status} />
          </Select.Trigger>
          <Select.Content>
            {ARTICLE_STATUSES.map((status) => (
              <Select.Item key={status} value={status} disabled={status === 'scheduled'}>
                {statuses[status]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </PanelField>
      <PanelField icon={IconCalendarTime} label={t('kb-publish-on', 'Publish on')} cell={false}>
        <div className="flex gap-2">
          <DatePicker
            value={at ?? undefined}
            minDate={today}
            onChange={(day) => day instanceof Date && schedule(onDay(at, day))}
            placeholder={t('kb-pick-date', 'Pick a date')}
          />
          <TimeField
            aria-label={t('kb-publish-time', 'Time')}
            value={at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : ''}
            onValueChange={(time) => time && schedule(atTime(at, time))}
          />
        </div>
      </PanelField>
      <PanelField icon={IconLock} label={t('kb-is-private', 'Private')} cell={false}>
        <Switch
          aria-label={t('kb-is-private', 'Private')}
          checked={article.isPrivate}
          onCheckedChange={(isPrivate) => edit({ isPrivate })}
        />
      </PanelField>
      <PanelField icon={IconMoodSmile} label={t('kb-reaction-choices', 'Reactions')} cell={false}>
        <MultipleSelector
          options={REACTIONS}
          value={article.reactionChoices.map((choice) => ({
            value: choice,
            label: REACTIONS.find((reaction) => reaction.value === choice)?.label ?? choice,
          }))}
          onChange={(options) => edit({ reactionChoices: options.map((option) => option.value) })}
        />
      </PanelField>
    </PanelSection>
  );
};

/** The article's image, files to download and a PDF readers page through. */
export const Media = ({ article, edit }: Props) => {
  const { t } = useTranslation('frontline');
  const pdf = article.pdfAttachment?.pdf;

  return (
    <PanelSection title={t('kb-files', 'Files')}>
      <PanelField icon={IconPhoto} label={t('image', 'Image')} cell={false}>
        <ImageField value={article.image?.url ?? ''} onChange={(image) => edit({ image })} />
      </PanelField>
      <PanelField icon={IconFile} label={t('kb-attachments', 'Attachments')} cell={false}>
        <div className="flex flex-col gap-1">
          <FileList
            files={article.attachments}
            onRemove={(file) =>
              edit({ attachments: article.attachments.filter((kept) => kept !== file) })
            }
          />
          <FilePicker
            label={t('kb-add-file', 'Add file')}
            onUploaded={(file) => edit({ attachments: [...article.attachments, file] })}
          />
        </div>
      </PanelField>
      <PanelField icon={IconFileTypePdf} label={t('kb-pdf-attachment', 'PDF')} cell={false}>
        {pdf ? (
          <FileList files={[pdf]} onRemove={() => edit({ pdfAttachment: null })} />
        ) : (
          <FilePicker
            label={t('kb-upload-pdf', 'Upload PDF')}
            accept="application/pdf"
            onUploaded={(file) => edit({ pdfAttachment: { pdf: file } })}
          />
        )}
      </PanelField>
    </PanelSection>
  );
};
