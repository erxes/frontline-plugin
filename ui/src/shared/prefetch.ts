import { type QueryClient, useQueryClient } from '@tanstack/react-query';

/**
 * Loads what a link or row opens as the member points at it, focuses it or presses it, so the
 * click shows it at once: `load` asks for the target's queries, with the options its page reads
 * them with, and its chunk. Spread `prefetch(target)` on the link or row.
 */
export const usePrefetch = <T>(load: (queryClient: QueryClient, target: T) => Promise<unknown>) => {
  const queryClient = useQueryClient();

  return (target: T) => {
    // A failed load is only a slower open; the page shows its own error.
    const start = () => void load(queryClient, target).catch(() => undefined);

    return { onPointerEnter: start, onFocus: start, onPointerDown: start };
  };
};
