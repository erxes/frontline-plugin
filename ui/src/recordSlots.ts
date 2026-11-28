import type { TDataValue, TRecordDraftProps, TRecordSlotProps } from 'erxes-ui';
import { type ComponentType, lazy } from 'react';
import { withText } from '~/i18n/withText.ts';
import { PLUGIN } from '~/plugin.ts';

// `./config` gives core's side panel these: each record type's slots come from one `slots.ts`
// that loads when the first of them shows.
type Slot = ComponentType<TRecordSlotProps>;

type ReadSlots = { Title: Slot; Actions: Slot; Detail: Slot };

type Slots = ReadSlots & { New: ComponentType<TRecordDraftProps> };

/** The slots of a record members read and change but never draft. */
export const readSlots = (loadSlots: () => Promise<ReadSlots>) => {
  const load = withText(loadSlots);

  return {
    Title: lazy(async () => ({ default: (await load()).Title })),
    Actions: lazy(async () => ({ default: (await load()).Actions })),
    Detail: lazy(async () => ({ default: (await load()).Detail })),
  };
};

export const slots = (loadSlots: () => Promise<Slots>) => {
  const load = withText(loadSlots);

  return {
    ...readSlots(load),
    New: lazy(async () => ({ default: (await load()).New })),
  };
};

/** Data Extensions fields core keeps; the API client loads only when the Fields tab does. */
export const dataFieldsOf = (records: 'tickets' | 'conversations') => ({
  type: `${PLUGIN}.${records.slice(0, -1)}`,
  values: (id: string) => ({
    queryKey: [PLUGIN, records, 'properties', id],
    queryFn: async () => (await import('~/orpc.ts')).orpc[records].properties.values.call({ id }),
  }),
  save: async (id: string, patch: Record<string, TDataValue>) =>
    (await import('~/orpc.ts')).orpc[records].properties.save.call({ id, patch }),
});
