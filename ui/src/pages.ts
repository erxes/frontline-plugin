import { withText } from '~/i18n/withText.ts';

/** `load`, run once: later calls share its promise, and a failed load runs again next time. */
const once = <T>(load: () => Promise<T>) => {
  let loading: Promise<T> | undefined;

  return () =>
    (loading ??= load().catch((error: unknown) => {
      loading = undefined;

      throw error;
    }));
};

// The pages a sidebar link loads before it's clicked: their routes' `lazy` and the links that
// point at them share each loader, so the chunk loads once.
export const inboxPage = once(
  withText(async () => ({ default: (await import('@/inbox/InboxPage.tsx')).InboxPage })),
);

export const ticketsPage = once(
  withText(async () => ({ default: (await import('@/tickets/TicketsPage.tsx')).TicketsPage })),
);
