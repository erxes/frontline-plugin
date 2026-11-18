import { useQuery } from '@tanstack/react-query';
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

const ReportInput = z.object({ from: z.date(), to: z.date(), pipelineId: z.string().optional() });

type ReportInput = z.infer<typeof ReportInput>;

/** The input in an oRPC query key, `[path, { input }]`. */
const LastKey = z.tuple([z.unknown(), z.object({ input: ReportInput })]);

const span = ({ from, to }: ReportInput) => to.getTime() - from.getTime();

/**
 * The report over `input`. A tile keeps its numbers while the next minute loads, and shows the
 * skeleton for a new period or pipeline. Tiles that tick a few seconds apart share the fetch.
 */
const live = <Input extends ReportInput>(input: Input) => ({
  input,
  staleTime: 30_000,
  placeholderData: <Data>(previous: Data | undefined, last?: { queryKey: unknown }) => {
    const key = LastKey.safeParse(last?.queryKey);

    const same =
      key.success &&
      span(key.data[1].input) === span(input) &&
      key.data[1].input.pipelineId === input.pipelineId;

    return same ? previous : undefined;
  },
});

/** The tile's period and pipeline, and the ticket report over them. */
export const useTicketReport = (tile: string) => {
  const period = usePeriod(tile);
  const [pipelineId, setPipelineId] = useAtom(tilePipeline(tile));

  return {
    period,
    pipeline: { pipelineId, setPipelineId },
    query: useQuery(
      orpc.reports.tickets.queryOptions(
        live({ ...period.range, pipelineId: pipelineId ?? undefined }),
      ),
    ),
  };
};

/** The tile's period and the conversation report over it. */
export const useConversationReport = (tile: string) => {
  const period = usePeriod(tile);

  return {
    period,
    query: useQuery(orpc.reports.conversations.queryOptions(live(period.range))),
  };
};

/** The tile's period and the call report over it. */
export const useCallReport = (tile: string) => {
  const period = usePeriod(tile);

  return {
    period,
    query: useQuery(orpc.reports.calls.queryOptions(live(period.range))),
  };
};
