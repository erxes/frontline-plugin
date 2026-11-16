import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { addPluginStyles, toast, useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import css from './styles.css?inline';

// Every pipeline screen and panel slot imports this module, so their styles arrive with the first one.
addPluginStyles(`${PLUGIN}:pipelines`, css);

type Outputs = InferClientOutputs<Client>['pipelines'];

export type Pipeline = Outputs['get'];

export type Status = Outputs['statuses']['list'][number];

/** The fields `pipelines.update` changes, any of them at once. */
export type PipelineFields = Omit<InferClientInputs<Client>['pipelines']['update'], 'id'>;

/** A channel's pipelines, newest first, a page at a time, narrowed by the filter bar. */
export const usePipelines = (channelId: string) => {
  const params = useListFilterParams();

  const query = useInfiniteQuery(
    orpc.pipelines.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ channelId, cursor, ...params }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    pipelines: query.data?.pages.flatMap((page) => page.pipelines) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

/** One pipeline: every slot of its panel reads this query. */
export const usePipeline = (id: string) =>
  useQuery(orpc.pipelines.get.queryOptions({ input: { id } }));

/** The pipeline's statuses, by stage and their order in it. */
export const useStatuses = (pipelineId: string) =>
  useQuery(orpc.pipelines.statuses.list.queryOptions({ input: { pipelineId } }));

/** Refetches the pipeline and status queries after a change, and shows a refusal. */
export const usePipelineChange = () => useChange(orpc.pipelines.key());

/** Saves the given fields of the pipeline, one in-place edit at a time. */
export const useEditPipeline = (id: string) => {
  const queryClient = useQueryClient();
  const change = usePipelineChange();
  const { queryKey } = orpc.pipelines.get.queryOptions({ input: { id } });

  const update = useMutation(
    orpc.pipelines.update.mutationOptions({ onError: change.onError, onSettled: change.onSuccess }),
  );

  // The panel shows the edit at once, so the next edit (the SLA saves its whole policy) builds on
  // it instead of on the last fetch.
  return (fields: PipelineFields) => {
    queryClient.setQueryData(queryKey, (pipeline) => pipeline && { ...pipeline, ...fields });
    update.mutate({ id, ...fields });
  };
};

/** Asks for "delete" to be typed, then deletes the pipelines and their statuses, all or none. */
export const useDeletePipelines = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const change = usePipelineChange();

  const remove = useMutation(
    orpc.pipelines.remove.mutationOptions({
      ...change,
      onSuccess: async ({ ids }) => {
        toast({
          title: t('pipelines-deleted', {
            defaultValue_one: 'Pipeline deleted',
            defaultValue_other: '{{count}} pipelines deleted',
            count: ids.length,
          }),
        });
        await change.onSuccess();
      },
    }),
  );

  const deletePipelines = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-pipelines-confirm', {
        defaultValue_one: 'Delete this pipeline and its statuses?',
        defaultValue_other: 'Delete {{count}} pipelines and their statuses?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deletePipelines, isPending: remove.isPending };
};

/** Critical first: the priorities a ticket takes and an SLA rule promises for. */
export const PRIORITIES = [4, 3, 2, 1, 0] as const;

/** Each priority's name, 4 critical to 0 none. */
export const usePriorityNames = (): Record<number, string> => {
  const { t } = useTranslation('frontline');

  return {
    4: t('critical', 'Critical'),
    3: t('high', 'High'),
    2: t('medium', 'Medium'),
    1: t('minor', 'Minor'),
    0: t('no-priority', 'No priority'),
  };
};

/** The stages in the order a ticket moves through them, by their `type`. */
export const useStages = () => {
  const { t } = useTranslation('frontline');

  return [
    { type: 1, label: t('new-label', 'New') },
    { type: 2, label: t('open-label', 'Open') },
    { type: 3, label: t('status-type-in-progress', 'In progress') },
    { type: 4, label: t('resolved', 'Resolved') },
    { type: 5, label: t('status-type-closed', 'Closed') },
    { type: 6, label: t('cancelled', 'Cancelled') },
  ];
};
