import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { channelsQuery } from '~/shared/reference.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

export type ResponseTemplate = InferClientOutputs<Client>['responseTemplates']['get'];

/** A channel's templates, newest first, a page at a time, narrowed by the filter bar. */
export const useResponseTemplates = (channelId: string) => {
  const { filter, search } = useListFilterParams();

  return usePaged(
    useInfiniteQuery(
      orpc.responseTemplates.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ channelId, filter, search, cursor }),
        ...pageOptions,
      }),
    ),
    (page) => page.templates,
  );
};

/** One template. */
export const useResponseTemplate = (id: string) =>
  useQuery(orpc.responseTemplates.get.queryOptions({ input: { id } }));

/** The channels the member is an admin of: where a template can be written or moved to. */
export const useManagedChannels = () =>
  useQuery({
    ...channelsQuery,
    select: (data) => data.channels.filter((channel) => channel.canManage),
  });

/** Refetches the template queries after a change, and shows a refusal. */
export const useTemplateChange = () => useChange(orpc.responseTemplates.key());

/** Asks for "delete" to be typed, then deletes the templates: all of them, or none when the API refuses one. */
export const useDeleteTemplates = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.responseTemplates.remove.mutationOptions(useTemplateChange()));

  const deleteTemplates = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-templates-confirm', {
        defaultValue_one: 'Delete this response template?',
        defaultValue_other: 'Delete {{count}} response templates?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteTemplates, isPending: remove.isPending };
};
