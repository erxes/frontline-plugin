import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { addPluginStyles, toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { CHANNELS_PATH, useChannel } from '../channels/useChannels.ts';
import { PLUGIN } from '../config.tsx';
import { orpc } from '../orpc.ts';
import { useChange, useParamPanel } from '../shared/hooks.ts';
import css from './styles.css?inline';

// Every pipeline screen imports this module, so their styles arrive with the first one.
addPluginStyles(`${PLUGIN}:pipelines`, css);

type Outputs = InferClientOutputs<Client>['pipelines'];

export type Pipeline = Outputs['get'];

export type Status = Outputs['statuses']['list'][number];

/** The channel and pipeline the route names. */
export const usePipelineRoute = () => {
  const { id = '', pipelineId = '' } = useParams();

  return { channelId: id, pipelineId };
};

/** A pipeline's page: its general settings, or the `tab` after them. */
export const pipelinePath = (channelId: string, pipelineId: string, tab = '') =>
  `${CHANNELS_PATH}/${channelId}/pipelines/${pipelineId}${tab ? `/${tab}` : ''}`;

/** Whether the member changes the channel's pipelines: its admins and channel managers do. */
export const useCanManage = (channelId: string) => useChannel(channelId).data?.canManage ?? false;

/** A channel's pipelines, newest first, a page at a time. */
export const usePipelines = (channelId: string) => {
  const query = useInfiniteQuery(
    orpc.pipelines.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ channelId, cursor }),
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

export const usePipeline = (id: string) =>
  useQuery(orpc.pipelines.get.queryOptions({ input: { id } }));

/** The pipeline's statuses, by stage and their order in it. */
export const useStatuses = (pipelineId: string) =>
  useQuery(orpc.pipelines.statuses.list.queryOptions({ input: { pipelineId } }));

/** Refetches the pipeline and status queries after a change, and shows a refusal. */
export const usePipelineChange = () => useChange(orpc.pipelines.key());

/** Saves a pipeline's settings page: `onSaved` clears its draft, then a toast says so. */
export const usePipelineUpdate = (onSaved: () => void) => {
  const { t } = useTranslation('frontline');
  const change = usePipelineChange();

  return useMutation(
    orpc.pipelines.update.mutationOptions({
      ...change,
      onSuccess: async () => {
        onSaved();
        toast({ title: t('pipeline-updated-successfully', 'Pipeline updated successfully') });
        await change.onSuccess();
      },
    }),
  );
};

/** `?pipeline=new` opens the create panel. */
export const usePipelinePanel = () => useParamPanel('pipeline');

/** `?status=new~<type>` adds a status to a stage, `?status=<id>` edits one. */
export const useStatusPanel = () => useParamPanel('status');

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
