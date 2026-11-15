import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { orpc } from '~/orpc.ts';
import { useChange, useParamPanel, useSearch } from '~/shared/hooks.ts';

export type ResponseTemplate = InferClientOutputs<Client>['responseTemplates']['get'];

/** A channel's templates, newest first, a page at a time, narrowed by the list's search filter. */
export const useResponseTemplates = (channelId: string) => {
  const search = useSearch() || undefined;

  const query = useInfiniteQuery(
    orpc.responseTemplates.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ channelId, search, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  const [first] = query.data?.pages ?? [];

  return {
    ...query,
    templates: query.data?.pages.flatMap((page) => page.templates) ?? [],
    totalCount: first?.totalCount,
    canManage: first?.canManage ?? false,
  };
};

/** How many templates a channel has, read from a one-row page. */
export const useTemplateCount = (channelId: string) =>
  useQuery(
    orpc.responseTemplates.list.queryOptions({
      input: { channelId, limit: 1 },
      select: (page) => page.totalCount,
    }),
  ).data;

/** One template. */
export const useResponseTemplate = (id: string) =>
  useQuery(orpc.responseTemplates.get.queryOptions({ input: { id } }));

/** Refetches the template queries after a change, and shows a refusal. */
export const useTemplateChange = () => useChange(orpc.responseTemplates.key());

/** The side panel: `?template=new` creates a template, `?template=<id>` edits one. */
export const useTemplatePanel = () => useParamPanel('template');
