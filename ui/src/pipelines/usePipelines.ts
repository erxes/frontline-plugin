import { useQuery } from '@tanstack/react-query';
import { orpc } from '../orpc.ts';

// The channel page loads this with the page module, so the pipeline screens' hooks live in queries.ts.

/** How many pipelines a channel has, read from a one-row page. */
export const usePipelineCount = (channelId: string) =>
  useQuery(
    orpc.pipelines.list.queryOptions({
      input: { channelId, limit: 1 },
      select: (page) => page.totalCount,
    }),
  ).data;
