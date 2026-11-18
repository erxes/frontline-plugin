import { orpc as core } from '@erxes/core-contract/client';
import { useSuspenseQuery } from '@tanstack/react-query';
import { stored, useConfirm } from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';

/** How many drafts of a kind stay, and for how long, once another is saved. */
const KEEP = 50;
const KEEP_MS = 7 * 24 * 60 * 60_000;

const Saved = z.record(z.string(), z.object({ value: z.unknown(), savedAt: z.number() }));

type Saved = z.infer<typeof Saved>;

/**
 * What members write and haven't saved yet, one draft per member and record of `kind`: the reply
 * in each conversation, a new mail, a new ticket. They live in this tab's session storage, so
 * switching away or reloading keeps them until the tab closes. `schema` checks each draft as it
 * comes back from storage, so one that no longer fits is dropped alone; a kind keeps its 50
 * newest drafts of the past week.
 */
export const draftsOf = <T>(kind: string, schema: z.ZodType<T>) => ({
  schema,
  atom: stored({ key: `${PLUGIN}:drafts:${kind}`, schema: Saved, initial: {}, session: true }),
});

type Drafts<T> = ReturnType<typeof draftsOf<T>>;

/** The drafts saved in the past week, newest first, at most `KEEP`. */
const pruned = (all: Saved, now: number): Saved =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([, draft]) => now - draft.savedAt < KEEP_MS)
      .toSorted(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, KEEP),
  );

/**
 * The signed-in member's draft of record `id`, else `initial`. `save` changes it, and `clear`
 * drops it once the record is sent or saved, or the member discards it. A record a draft starts
 * from nothing, such as a new mail, uses an id like `new`. Another member signed in to the same
 * tab sees none of them.
 */
export const useDraft = <T>(drafts: Drafts<T>, id: string, initial: NoInfer<T>) => {
  const member = useSuspenseQuery(core.auth.me.queryOptions()).data.user.id;
  const key = `${member}:${id}`;
  const [all, setAll] = useAtom(drafts.atom);

  const valueOf = (saved: Saved) => {
    const parsed = drafts.schema.safeParse(saved[key]?.value);

    return parsed.success ? parsed.data : initial;
  };

  return {
    value: valueOf(all),
    save: (update: (current: T) => T) =>
      setAll((current) => {
        const now = Date.now();

        return pruned(
          { ...current, [key]: { value: update(valueOf(current)), savedAt: now } },
          now,
        );
      }),
    clear: () =>
      setAll((current) =>
        Object.fromEntries(Object.entries(current).filter(([other]) => other !== key)),
      ),
  };
};

/**
 * Cancel on a new record's panel: it asks before throwing away a draft the member wrote in
 * (`dirty`), then drops it and closes. Closing the panel instead keeps the draft for later.
 */
export const useDiscard = (dirty: boolean, clear: () => void, onCancel: () => void) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  return async () => {
    if (dirty) {
      await confirm({
        message: t('discard-draft-confirm', 'Throw away what you wrote?'),
        options: { okLabel: t('discard', 'Discard') },
      });
    }

    clear();
    onCancel();
  };
};
