import type { InferClientOutputs } from '@orpc/client';
import { useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';

export type MessengerSettings = InferClientOutputs<Client>['integrations']['messenger']['settings'];

/** What the settings page's one form edits: the messenger's settings as the API reads them. */
export type MessengerForm = MessengerSettings['config'];

export const useMessengerSettings = (id: string) =>
  useQuery(orpc.integrations.messenger.settings.queryOptions({ input: { id } }));

/** The settings page of messenger `id`. */
export const messengerPath = (id: string) =>
  `/${PLUGIN}/inbox/messengers/${encodeURIComponent(id)}`;

/** Ready-made colour pairs for the launcher and header, as the old messenger offered them. */
export const COLOR_THEMES = [
  { name: 'Indigo', color: '#4F46E5', textColor: '#FFFFFF' },
  { name: 'Blue', color: '#3B82F6', textColor: '#FFFFFF' },
  { name: 'Teal', color: '#0D9488', textColor: '#FFFFFF' },
  { name: 'Rose', color: '#E11D48', textColor: '#FFFFFF' },
  { name: 'Amber', color: '#F59E0B', textColor: '#111827' },
  { name: 'Slate', color: '#1E293B', textColor: '#FFFFFF' },
] as const;
