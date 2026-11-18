import { stored } from 'erxes-ui';
import { useAtom } from 'jotai';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';

/** How many drafts of a kind stay, and for how long, once another is saved. */
const KEEP = 50;
const KEEP_MS = 7 * 24 * 60 * 60_000;

/**
 * What members write and haven't saved yet, one draft per record of `kind`: the reply in each
 * conversation, a new mail, a new ticket. They live in this tab's session storage, so switching
 * away or reloading keeps them until the tab closes. `schema` checks what comes back from
 * storage; a kind keeps its 50 newest drafts of the past week.
 */
export const draftsOf = <T>(kind: string, schema: z.ZodType<T>) =>
  stored({
    key: `${PLUGIN}:drafts:${kind}`,
    schema: z.record(z.string(), z.object({ value: schema, savedAt: z.number() })),
    initial: {},
    session: true,
  });

type Drafts<T> = ReturnType<typeof draftsOf<T>>;

type Saved<T> = Record<string, { value: T; savedAt: number }>;

/** The drafts saved in the past week, newest first, at most `KEEP`. */
const pruned = <T>(all: Saved<T>, now: number): Saved<T> =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([, draft]) => now - draft.savedAt < KEEP_MS)
      .toSorted(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, KEEP),
  );

/**
 * The draft of record `id`, else `initial`. `save` changes it, and `clear` drops it once the
 * record is sent or saved. A record a draft starts from nothing, such as a new mail, uses an id
 * like `new`.
 */
export const useDraft = <T>(drafts: Drafts<T>, id: string, initial: T) => {
  const [all, setAll] = useAtom(drafts);

  return {
    value: all[id]?.value ?? initial,
    save: (update: (current: T) => T) =>
      setAll((current) => {
        const now = Date.now();

        return pruned(
          { ...current, [id]: { value: update(current[id]?.value ?? initial), savedAt: now } },
          now,
        );
      }),
    clear: () =>
      setAll((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
      ),
  };
};
