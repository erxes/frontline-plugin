import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { storedFamily } from 'erxes-ui';
import { useAtom } from 'jotai';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { usePeriod } from './Tile.tsx';

/** Each ticket tile's pipeline, by its widget name, kept in this browser; null counts them all. */
const tilePipeline = storedFamily({
  key: `${PLUGIN}:tile-pipeline`,
  schema: z.string().nullable(),
  initial: null,
});

/** A tile keeps its numbers while the next minute or pick loads, instead of a skeleton. */
const stayOnScreen = { placeholderData: keepPreviousData };

/** The tile's period and pipeline, and the ticket report over them. */
export const useTicketReport = (tile: string) => {
  const period = usePeriod(tile);
  const [pipelineId, setPipelineId] = useAtom(tilePipeline(tile));

  return {
    period,
    pipeline: { pipelineId, setPipelineId },
    query: useQuery(
      orpc.reports.tickets.queryOptions({
        input: { ...period.range, pipelineId: pipelineId ?? undefined },
        ...stayOnScreen,
      }),
    ),
  };
};

/** The tile's period and the conversation report over it. */
export const useConversationReport = (tile: string) => {
  const period = usePeriod(tile);

  return {
    period,
    query: useQuery(
      orpc.reports.conversations.queryOptions({ input: period.range, ...stayOnScreen }),
    ),
  };
};

/** The tile's period and the call report over it. */
export const useCallReport = (tile: string) => {
  const period = usePeriod(tile);

  return {
    period,
    query: useQuery(orpc.reports.calls.queryOptions({ input: period.range, ...stayOnScreen })),
  };
};
