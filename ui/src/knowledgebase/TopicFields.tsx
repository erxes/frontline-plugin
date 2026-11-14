import { isDefinedError, type ORPCError } from '@orpc/client';
import { ColorPicker, Input, Select, Textarea } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Field } from '../shared/SidePanel.tsx';
import { ImageField } from './Files.tsx';
import { LANGUAGE_CODES, type Topic } from './useKnowledgeBase.ts';

/** A topic form's values; an empty string is an unset field. */
export type TopicDraft = {
  title: string;
  description: string;
  code: string;
  languageCode: string;
  color: string;
  backgroundImage: string;
};

export const topicDraftOf = (topic?: Topic): TopicDraft => ({
  title: topic?.title ?? '',
  description: topic?.description ?? '',
  code: topic?.code ?? '',
  languageCode: topic?.languageCode ?? '',
  color: topic?.color ?? '',
  backgroundImage: topic?.backgroundImage ?? '',
});

/** What the API takes: a cleared colour or language is null. */
export const topicInput = (draft: TopicDraft) => ({
  ...draft,
  color: draft.color || null,
  languageCode: draft.languageCode || null,
});

/** Why a topic or category save failed; CODE_TAKEN names the code another record has. */
export type SaveError = ORPCError<'CODE_TAKEN', { code: string }> | Error | null;

/** A topic's or category's code; when a save failed because another record has it, says so. */
export const CodeField = ({
  id,
  placeholder,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  placeholder: string;
  hint?: string;
  value: string;
  onChange: (code: string) => void;
  error: SaveError;
}) => {
  const { t } = useTranslation('frontline');
  const taken = isDefinedError(error) && error.code === 'CODE_TAKEN' ? error.data.code : null;

  return (
    <Field
      id={id}
      label={t('kb-code', 'Code')}
      hint={
        taken === null
          ? hint
          : t('kb-code-taken', 'Another topic or category has the code {{code}}.', { code: taken })
      }
    >
      <Input
        id={id}
        placeholder={placeholder}
        aria-invalid={taken !== null}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
};

const NO_LANGUAGE = 'none';

/** A topic's fields, shared by its side panel and its settings page. */
export const TopicFields = ({
  value,
  onChange,
  error,
}: {
  value: TopicDraft;
  onChange: (patch: Partial<TopicDraft>) => void;
  error: SaveError;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Field id="topic-title" label={t('title', 'Title')}>
        <Input
          id="topic-title"
          required
          placeholder={t('kb-enter-topic-title', 'Enter topic title')}
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>
      <Field
        id="topic-description"
        label={t('description', 'Description')}
        hint={t('kb-topic-description-help', 'Shown under the topic name on the published site.')}
      >
        <Textarea
          id="topic-description"
          placeholder={t('kb-enter-topic-description', 'Enter topic description')}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <CodeField
        id="topic-code"
        placeholder={t('kb-enter-topic-code', 'Enter topic code')}
        hint={t('kb-topic-code-help', 'Optional short code used in embeds and links.')}
        value={value.code}
        onChange={(code) => onChange({ code })}
        error={error}
      />
      <TopicLook value={value} onChange={onChange} />
    </>
  );
};

/** The topic's language, colour and background image. */
const TopicLook = ({
  value,
  onChange,
}: {
  value: TopicDraft;
  onChange: (patch: Partial<TopicDraft>) => void;
}) => {
  const { t, i18n } = useTranslation('frontline');
  const languages = new Intl.DisplayNames([i18n.language], { type: 'language' });

  return (
    <>
      <Field id="topic-language" label={t('language', 'Language')}>
        <Select
          value={value.languageCode || NO_LANGUAGE}
          onValueChange={(code) => onChange({ languageCode: code === NO_LANGUAGE ? '' : code })}
        >
          <Select.Trigger id="topic-language">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={NO_LANGUAGE}>{t('kb-no-language', 'No language')}</Select.Item>
            {LANGUAGE_CODES.map((code) => (
              <Select.Item key={code} value={code}>
                {languages.of(code) ?? code}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </Field>
      <Field label={t('kb-color', 'Color')}>
        <ColorPicker
          aria-label={t('kb-color', 'Color')}
          value={value.color || undefined}
          onValueChange={(color) => onChange({ color })}
          className="w-min"
        />
      </Field>
      <Field label={t('kb-background-image', 'Background image')}>
        <ImageField
          value={value.backgroundImage}
          onChange={(file) => onChange({ backgroundImage: file?.url ?? '' })}
        />
      </Field>
    </>
  );
};
