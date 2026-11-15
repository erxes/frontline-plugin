import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

export type HelpCenter = InferClientOutputs<Client>['helpCenters']['get'];

export type HelpCenterFields = Omit<InferClientInputs<Client>['helpCenters']['update'], 'id'>;

/** Every help center, narrowed by the filter bar, and whether the member manages them. */
export const useHelpCenters = () => {
  const { filter, search } = useListFilterParams();

  return useQuery(orpc.helpCenters.list.queryOptions({ input: { filter, search } }));
};

/** Whether the member may change help centers, from the list's answer. */
export const useCanManageHelpCenters = () =>
  useQuery(orpc.helpCenters.list.queryOptions({ input: {}, select: (data) => data.canManage }))
    .data ?? false;

export const useHelpCenter = (id: string) =>
  useQuery(orpc.helpCenters.get.queryOptions({ input: { id } }));

/** Refetches the help center queries after a change, and shows a refusal. */
export const useHelpCenterChange = () => useChange(orpc.helpCenters.key());

/** Saves the given fields of one help center. */
export const useEditHelpCenter = (id: string) => {
  const update = useMutation(orpc.helpCenters.update.mutationOptions(useHelpCenterChange()));

  return (fields: HelpCenterFields) => update.mutate({ id, ...fields });
};

/** Asks for "delete" to be typed, then deletes the help centers and their domains. */
export const useDeleteHelpCenters = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.helpCenters.remove.mutationOptions(useHelpCenterChange()));

  return async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-help-centers-confirm', {
        defaultValue_one: 'Delete this help center? Its address and domain stop working.',
        defaultValue_other:
          'Delete {{count}} help centers? Their addresses and domains stop working.',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };
};

/** The knowledge base topics a help center can show. */
export const useTopicOptions = () =>
  useQuery(
    orpc.knowledgebase.topics.list.queryOptions({
      input: {},
      select: (data) => data.topics.map((topic) => ({ value: topic.id, label: topic.title })),
    }),
  ).data ?? [];
