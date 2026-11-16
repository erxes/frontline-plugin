import { isDefinedError, type ORPCError } from '@orpc/client';
import { IconAlignLeft, IconCode, IconLanguage, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Input, PanelFormLayout, PanelFormRow, Textarea, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { LanguageSelect } from './LanguageSelect.tsx';
import { useKbChange } from './useKnowledgeBase.ts';

/** Why a topic or category save failed: CODE_TAKEN names the code another record has. */
export const useTakenCode = (error: ORPCError<'CODE_TAKEN', { code: string }> | Error | null) => {
  const { t } = useTranslation('frontline');

  return isDefinedError(error) && error.code === 'CODE_TAKEN'
    ? t('kb-code-taken', 'Another topic or category has the code {{code}}.', {
        code: error.data.code,
      })
    : undefined;
};

/**
 * A new topic in core's side panel, under its "New topic" header: title, description, code and
 * language. Nothing saves until Save; CODE_TAKEN shows under the code, and the fields keep what
 * was typed. Its look and help center settings are on its settings page.
 */
export const TopicNew = ({ onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const { onSuccess } = useKbChange();

  const create = useMutation(
    orpc.knowledgebase.topics.create.mutationOptions({
      onSuccess: async (topic) => {
        await onSuccess();
        onCreated(topic.id);
      },
    }),
  );

  const takenCode = useTakenCode(create.error);

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      title: textOf(form.get('title')),
      description: textOf(form.get('description')),
      code: textOf(form.get('code')),
      languageCode,
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('kb-create-topic', 'Create topic')}
      >
        <PanelFormRow label={t('title', 'Title')} icon={IconLetterCase} required>
          <Input
            name="title"
            required
            aria-label={t('title', 'Title')}
            placeholder={t('kb-enter-topic-title', 'Enter topic title')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        <PanelFormRow label={t('description', 'Description')} icon={IconAlignLeft}>
          <Textarea name="description" aria-label={t('description', 'Description')} />
        </PanelFormRow>
        <PanelFormRow label={t('kb-code', 'Code')} icon={IconCode} error={takenCode}>
          <Input
            name="code"
            aria-label={t('kb-code', 'Code')}
            aria-invalid={takenCode !== undefined}
            placeholder={t('kb-topic-code-help', 'Optional short code used in embeds and links.')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        <PanelFormRow label={t('language', 'Language')} icon={IconLanguage}>
          <LanguageSelect value={languageCode} onChange={setLanguageCode} />
        </PanelFormRow>
        {create.error && !isDefinedError(create.error) && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
