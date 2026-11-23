import { createContext, use } from 'react';
import { PLUGIN } from '~/plugin.ts';

/**
 * The channel a page works inside, under `/frontline/channels/:channelId`: its inbox and tickets.
 * Null on the pages that span every channel of the member.
 */
export const ChannelScope = createContext<string | null>(null);

/** The channel the page works inside, or null across every channel. */
export const useChannelScope = () => use(ChannelScope);

/** A channel's own pages: its inbox and its tickets. */
type ChannelPage = 'inbox' | 'tickets';

/** The address of a channel's `page`. */
export const channelPath = (channelId: string, page: ChannelPage) =>
  `/${PLUGIN}/channels/${encodeURIComponent(channelId)}/${page}`;

/**
 * The address of a channel's settings, a section after it when given. They sit in Frontline's
 * settings, as a team's do in Operation's, so the settings sidebar stays.
 */
export const channelSettingsPath = (channelId: string, section?: string) =>
  `/${PLUGIN}/settings/channels/${encodeURIComponent(channelId)}${section ? `/${section}` : ''}`;
