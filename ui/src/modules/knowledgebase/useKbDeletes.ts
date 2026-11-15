import { useMutation } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import { useKbChange, useKbPanels } from './useKnowledgeBase.ts';

type Copy = {
  one: (title: string) => string;
  many: (count: number) => string;
  deleted: (count: number) => string;
};

type Panel = ReturnType<typeof useKbPanels>['article'];

/**
 * Asks for "delete" to be typed, naming the record when there is one, then
 * removes the records, closes the panel of any it removed and says it's done.
 */
const useDeleteFlow = (
  copy: Copy,
  panel: Panel,
  remove: (ids: string[], onDone: () => void) => void,
) => {
  const confirm = useConfirmDelete();

  return async (records: { id: string; title?: string }[], done?: () => void) => {
    const ids = records.map((record) => record.id);
    const title = records.length === 1 ? records[0]?.title : undefined;

    await confirm(title === undefined ? copy.many(ids.length) : copy.one(title));
    remove(ids, () => {
      if (panel.value && ids.includes(panel.value)) panel.close();

      done?.();
      toast({ title: copy.deleted(ids.length) });
    });
  };
};

export const useDeleteArticles = () => {
  const { t } = useTranslation('frontline');
  const { article } = useKbPanels();
  const remove = useMutation(orpc.knowledgebase.articles.remove.mutationOptions(useKbChange()));

  const deleteArticles = useDeleteFlow(
    {
      one: (title) =>
        t('kb-confirm-delete-article', {
          defaultValue: 'Are you sure you want to delete "{{title}}"?',
          title,
        }),
      many: (count) =>
        t('kb-confirm-delete-articles', {
          defaultValue: 'Are you sure you want to delete {{count}} articles?',
          count,
        }),
      deleted: (count) =>
        count === 1
          ? t('kb-article-deleted', 'Article deleted')
          : t('kb-articles-deleted', 'Articles deleted'),
    },
    article,
    (ids, onDone) => remove.mutate({ ids }, { onSuccess: onDone }),
  );

  return { deleteArticles, isPending: remove.isPending };
};

export const useDeleteCategories = () => {
  const { t } = useTranslation('frontline');
  const { category } = useKbPanels();
  const remove = useMutation(orpc.knowledgebase.categories.remove.mutationOptions(useKbChange()));

  const deleteCategories = useDeleteFlow(
    {
      one: (title) =>
        t('kb-confirm-delete-category', {
          defaultValue:
            'Are you sure you want to delete "{{title}}"? This will also delete all associated articles.',
          title,
        }),
      many: (count) =>
        t('kb-confirm-delete-categories', {
          defaultValue:
            'Are you sure you want to delete {{count}} categories? This will also delete all associated articles.',
          count,
        }),
      deleted: (count) =>
        count === 1
          ? t('kb-category-deleted', 'Category deleted')
          : t('kb-categories-deleted', 'Categories deleted'),
    },
    category,
    (ids, onDone) => remove.mutate({ ids }, { onSuccess: onDone }),
  );

  return { deleteCategories, isPending: remove.isPending };
};
