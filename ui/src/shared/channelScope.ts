import { createContext, use } from 'react';
import { PLUGIN } from '~/plugin.ts';

/**
 * The channel a page works inside, under `/frontline/channels/:channelId`: its inbox, tickets and
 * settings. Null on the pages that span every channel of the member.
 */
export const ChannelScope = createContext<string | null>(null);

/** The channel the page works inside, or null across every channel. */
export const useChannelScope = () => use(ChannelScope);

/** A channel's own pages: its inbox, its tickets and its settings. */
export type ChannelPage = 'inbox' | 'tickets' | 'settings';

/** The address of a channel's `page`, a settings section after it when given. */
export const channelPath = (channelId: string, page: ChannelPage, section?: string) =>
  `/${PLUGIN}/channels/${encodeURIComponent(channelId)}/${page}${section ? `/${section}` : ''}`;
