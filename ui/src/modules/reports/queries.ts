import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { channelsQuery, choicesQuery } from '~/shared/reference.ts';
import { usePeriod } from './Tile.tsx';
import { usePick } from './TilePick.tsx';

const ReportInput = z.object({
  from: z.date(),
  to: z.date(),
  pipelineId: z.string().optional(),
  channelId: z.string().optional(),
});

type ReportInput = z.infer<typeof ReportInput>;

/** The input in an oRPC query key, `[path, { input }]`. */
const LastKey = z.tuple([z.unknown(), z.object({ input: ReportInput })]);

/**
 * The report over `input`. A tile keeps its numbers while the next minute loads, and shows the
 * skeleton for a new period, day, pipeline or channel. Tiles that tick a few seconds apart share
 * the fetch.
 */
const live = <Input extends ReportInput>(input: Input) => ({
  input,
  staleTime: 30_000,
  placeholderData: <Data>(previous: Data | undefined, last?: { queryKey: unknown }) => {
    const key = LastKey.safeParse(last?.queryKey);

    const same =
      key.success &&
      key.data[1].input.from.getTime() === input.from.getTime() &&
      key.data[1].input.pipelineId === input.pipelineId &&
      key.data[1].input.channelId === input.channelId;

    return same ? previous : undefined;
  },
});

/** The tile's period and pipeline, and the ticket report over them. */
export const useTicketReport = (tile: string) => {
  const { t } = useTranslation('frontline');
  const period = usePeriod(tile);

  const pick = usePick(
    tile,
    useQuery(choicesQuery).data?.pipelines,
    t('pipeline', 'Pipeline'),
    t('all-pipelines', 'All pipelines'),
  );

  return {
    period,
    pick,
    query: useQuery(
      orpc.reports.tickets.queryOptions(
        live({ ...period.range, pipelineId: pick.id ?? undefined }),
      ),
    ),
  };
};

/** The tile's period and channel, and the input of a report over them. */
const useChannelScope = (tile: string) => {
  const { t } = useTranslation('frontline');
  const period = usePeriod(tile);

  const pick = usePick(
    tile,
    useQuery(channelsQuery).data?.channels,
    t('channel', 'Channel'),
    t('all-channels', 'All channels'),
  );

  return { period, pick, input: live({ ...period.range, channelId: pick.id ?? undefined }) };
};

/** The tile's period and channel, and the conversation report over them. */
export const useConversationReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile);

  return { ...scope, query: useQuery(orpc.reports.conversations.queryOptions(input)) };
};

/** The tile's period and channel, and the Facebook and Instagram report over them. */
export const useMetaReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile);

  return { ...scope, query: useQuery(orpc.reports.meta.queryOptions(input)) };
};

/** The tile's period and channel, and the call report over them. */
export const useCallReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile);

  return { ...scope, query: useQuery(orpc.reports.calls.queryOptions(input)) };
};
