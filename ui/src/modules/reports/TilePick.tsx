import { Select, storedFamily } from 'erxes-ui';
import { useAtom } from 'jotai';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';

/** A select item can't hold null, so "all of them" is this. */
const ALL = 'all';

/** What each tile counts, a pipeline or a channel, by its widget name, kept in this browser. */
const tilePick = storedFamily({
  key: `${PLUGIN}:tile-pick`,
  schema: z.string().nullable(),
  initial: null,
});

/**
 * The tile's pick among `options`, `label` naming what it picks and `all` its "all of them",
 * which null is. A kept pick the member no longer sees, such as a deleted pipeline, counts them
 * all.
 */
export const usePick = (
  tile: string,
  options: { id: string; name: string }[] | undefined,
  label: string,
  all: string,
) => {
  const [kept, setId] = useAtom(tilePick(tile));
  const id = !options || options.some((option) => option.id === kept) ? kept : null;

  return { id, setId, options: options ?? [], label, all };
};

export type PickState = ReturnType<typeof usePick>;

/** The tile's pick as a select, once there are two or more to pick from. */
export const TilePick = ({ pick }: { pick: PickState }) => {
  if (pick.options.length < 2) return null;

  return (
    <Select
      value={pick.id ?? ALL}
      onValueChange={(value) => pick.setId(!value || value === ALL ? null : value)}
    >
      <Select.Trigger className="h-7 w-auto max-w-48" aria-label={pick.label}>
        <Select.Value>
          {pick.options.find((option) => option.id === pick.id)?.name ?? pick.all}
        </Select.Value>
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={ALL}>{pick.all}</Select.Item>
        {pick.options.map((option) => (
          <Select.Item key={option.id} value={option.id}>
            {option.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};
