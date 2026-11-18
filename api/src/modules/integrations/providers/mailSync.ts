import { z } from 'zod';

/** Where the last pull left off in INBOX. A new `uidValidity` means the uids started over. */
export const SyncState = z.object({ uidValidity: z.string(), lastUid: z.number().int() });

/** How many runs in a row a mailbox may fail to sync before it shows as broken. */
const FAILED_RUNS = 5;

/** The failed runs a sync state counts since the last good one, and the last one's error. */
const SyncFailures = z.object({ failedRuns: z.number().int(), failure: z.string() });

/** Why the mailbox counts as broken for its sync, or null while it syncs or failed too few times. */
export const syncFailure = (syncState: unknown) => {
  const failures = SyncFailures.safeParse(syncState).data;

  return failures && failures.failedRuns >= FAILED_RUNS
    ? `The last ${failures.failedRuns} mail syncs failed: ${failures.failure}`
    : null;
};
