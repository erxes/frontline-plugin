import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { channelsQuery, choicesQuery, integrationsQuery } from '~/shared/reference.ts';
import { usePeriod } from './Tile.tsx';
import { usePick } from './TilePick.tsx';

const ReportInput = z.object({ from: z.date(), to: z.date(), filter: z.string().optional() });

type ReportInput = z.infer<typeof ReportInput>;

/** The input in an oRPC query key, `[path, { input }]`. */
const LastKey = z.tuple([z.unknown(), z.object({ input: ReportInput })]);

/**
 * The report over `input`. A tile or card keeps its numbers while the next minute loads, and
 * shows the skeleton for a new period, day or filter. Tiles that tick a few seconds apart share
 * the fetch.
 */
export const live = <Input extends ReportInput>(input: Input) => ({
  input,
  staleTime: 30_000,
  placeholderData: <Data>(previous: Data | undefined, last?: { queryKey: unknown }) => {
    const key = LastKey.safeParse(last?.queryKey);

    const same =
      key.success &&
      key.data[1].input.from.getTime() === input.from.getTime() &&
      key.data[1].input.filter === input.filter;

    return same ? previous : undefined;
  },
});

/** A filter keeping the rows whose `path` is `id`, or none without one. */
const only = (path: string, id: string | null) =>
  id ? JSON.stringify({ match: 'all', rules: [{ path, op: 'in', value: [id] }] }) : undefined;

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
        live({ ...period.range, filter: only('subject.pipelineId', pick.id) }),
      ),
    ),
  };
};

/**
 * The tile's period and channel, and the input of a report over them. With `kinds`, it offers
 * only the channels with an integration of one of them, such as a phone line. A member who may
 * not list channels picks none.
 */
const useChannelScope = (tile: string, kinds?: string[]) => {
  const { t } = useTranslation('frontline');
  const period = usePeriod(tile);
  const channels = useQuery(channelsQuery);
  const integrations = useQuery(integrationsQuery).data;
  const listed = channels.isError ? [] : channels.data?.channels;

  const options =
    kinds && integrations
      ? listed?.filter((channel) =>
          integrations.some(
            (integration) =>
              integration.channelId === channel.id && kinds.includes(integration.kind),
          ),
        )
      : listed;

  const pick = usePick(tile, options, t('channel', 'Channel'), t('all-channels', 'All channels'));

  return {
    period,
    pick,
    input: live({
      ...period.range,
      filter: only('subject.channelId', pick.id),
    }),
  };
};

/** The tile's period and channel, and the conversation report over them. */
export const useConversationReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile);

  return { ...scope, query: useQuery(orpc.reports.conversations.queryOptions(input)) };
};

/** The tile's period and Facebook or Instagram channel, and the Meta report over them. */
export const useMetaReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile, ['facebook', 'instagram']);

  return { ...scope, query: useQuery(orpc.reports.meta.queryOptions(input)) };
};

/** The tile's period and phone channel, and the call report over them. */
export const useCallReport = (tile: string) => {
  const { input, ...scope } = useChannelScope(tile, ['call', 'callpro']);

  return { ...scope, query: useQuery(orpc.reports.calls.queryOptions(input)) };
};
