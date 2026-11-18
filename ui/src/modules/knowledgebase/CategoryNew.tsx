import { isDefinedError } from '@orpc/client';
import {
  IconAlignLeft,
  IconBook,
  IconCode,
  IconFolderUp,
  IconIcons,
  IconLetterCase,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { IconPicker, PanelFormLayout, PanelFormRow, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { ParentSelect, TopicSelect } from './CategoryTree.tsx';
import { useTakenCode } from './TopicNew.tsx';
import { useKbChange } from './useKnowledgeBase.ts';

/** Where a new category sits; a null parent puts it at the top of the topic. */
type Placement = { topicId: string; parentId: string | null };

/** Where the opener puts the new category: `openNew(KB_CATEGORY_TYPE, { topicId, parentId })`. */
const placementOf = (defaults: Record<string, unknown>): Placement => ({
  topicId: textOf(defaults.topicId),
  parentId: textOf(defaults.parentId) || null,
});

/** The topic the category goes in, and the category it sits under there. */
const PlacementRows = ({
  value,
  onChange,
}: {
  value: Placement;
  onChange: (next: Placement) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <PanelFormRow label={t('kb-topic', 'Topic')} icon={IconBook} required>
        <TopicSelect
          value={value.topicId}
          onChange={(topicId) => onChange({ topicId, parentId: null })}
        />
      </PanelFormRow>
      <PanelFormRow label={t('kb-parent-category', 'Parent category')} icon={IconFolderUp}>
        <ParentSelect
          topicId={value.topicId}
          value={value.parentId}
          onChange={(parentId) => onChange({ ...value, parentId })}
        />
      </PanelFormRow>
    </>
  );
};

/**
 * A new category in core's side panel: icon, title, description, code, and where it sits. Nothing
 * saves until Save; CODE_TAKEN shows under the code.
 */
export const CategoryNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const [placement, setPlacement] = useState(() => placementOf(defaults));
  const [icon, setIcon] = useState<string | null>(null);
  const { onSuccess } = useKbChange();

  const create = useMutation(
    orpc.knowledgebase.categories.create.mutationOptions({
      onSuccess: (category) => {
        onSuccess();
        onCreated(category.id);
      },
    }),
  );

  const takenCode = useTakenCode(create.error);

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      ...placement,
      icon,
      title: textOf(form.get('title')),
      description: textOf(form.get('description')),
      code: textOf(form.get('code')),
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('kb-create-category', 'Create category')}
      >
        <PanelFormRow label={t('icon', 'Icon')} icon={IconIcons}>
          <IconPicker
            aria-label={t('icon', 'Icon')}
            value={icon ?? undefined}
            onValueChange={setIcon}
            className="w-min"
          />
        </PanelFormRow>
        <TextRow
          label={t('title', 'Title')}
          icon={IconLetterCase}
          name="title"
          required
          placeholder={t('kb-enter-category-title', 'Enter category title')}
        />
        <TextRow
          label={t('description', 'Description')}
          icon={IconAlignLeft}
          name="description"
          multiline
        />
        <TextRow label={t('kb-code', 'Code')} icon={IconCode} name="code" error={takenCode} />
        <PlacementRows value={placement} onChange={setPlacement} />
        {create.error && !isDefinedError(create.error) && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
