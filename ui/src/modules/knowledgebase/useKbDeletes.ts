import { useMutation } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import { useKbChange } from './useKnowledgeBase.ts';

type Copy = { confirm: (count: number) => string; deleted: (count: number) => string };

/** Asks for "delete" to be typed, then removes the records and says it's done. */
const useDeleteFlow = (copy: Copy, remove: (ids: string[], onDone: () => void) => void) => {
  const confirm = useConfirmDelete();

  return async (ids: string[], done?: () => void) => {
    await confirm(copy.confirm(ids.length));
    remove(ids, () => {
      done?.();
      toast({ title: copy.deleted(ids.length) });
    });
  };
};

export const useDeleteTopics = () => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.knowledgebase.topics.remove.mutationOptions(useKbChange()));

  const deleteTopics = useDeleteFlow(
    {
      confirm: (count) =>
        t('kb-confirm-delete-topics', {
          defaultValue_one: 'Delete this topic? All of its categories and articles go with it.',
          defaultValue_other:
            'Delete {{count}} topics? All of their categories and articles go with them.',
          count,
        }),
      deleted: (count) =>
        t('kb-topics-deleted', {
          defaultValue_one: 'Topic deleted',
          defaultValue_other: '{{count}} topics deleted',
          count,
        }),
    },
    (ids, onDone) => remove.mutate({ ids }, { onSuccess: onDone }),
  );

  return { deleteTopics, isPending: remove.isPending };
};

export const useDeleteCategories = () => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.knowledgebase.categories.remove.mutationOptions(useKbChange()));

  const deleteCategories = useDeleteFlow(
    {
      confirm: (count) =>
        t('kb-confirm-delete-categories', {
          defaultValue_one: 'Delete this category? Its articles go with it.',
          defaultValue_other: 'Delete {{count}} categories? Their articles go with them.',
          count,
        }),
      deleted: (count) =>
        t('kb-categories-deleted', {
          defaultValue_one: 'Category deleted',
          defaultValue_other: '{{count}} categories deleted',
          count,
        }),
    },
    (ids, onDone) => remove.mutate({ ids }, { onSuccess: onDone }),
  );

  return { deleteCategories, isPending: remove.isPending };
};

export const useDeleteArticles = () => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.knowledgebase.articles.remove.mutationOptions(useKbChange()));

  const deleteArticles = useDeleteFlow(
    {
      confirm: (count) =>
        t('kb-confirm-delete-articles', {
          defaultValue_one: 'Delete this article?',
          defaultValue_other: 'Delete {{count}} articles?',
          count,
        }),
      deleted: (count) =>
        t('kb-articles-deleted', {
          defaultValue_one: 'Article deleted',
          defaultValue_other: '{{count}} articles deleted',
          count,
        }),
    },
    (ids, onDone) => remove.mutate({ ids }, { onSuccess: onDone }),
  );

  return { deleteArticles, isPending: remove.isPending };
};
