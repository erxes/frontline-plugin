import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { orpc } from '~/orpc.ts';

// JsSIP loads only for a member who has a line.
const SipPhone = lazy(async () => ({ default: (await import('./SipPhone.tsx')).SipPhone }));

// The erxes Call desktop app marks its web window in the user agent. Its own phone holds the
// member's line already, and a second phone on the extension would ring beside it.
const inDesktopApp = navigator.userAgent.includes('erxesCall/');

/**
 * Core's `floatingWidget`: the member's softphone, on every page and kept across navigation,
 * once an admin gives their extension a SIP password (the PBX's operators). Nothing shows for a
 * member without one, or without `call.view`.
 */
export const Softphone = () => (inDesktopApp ? null : <WebPhone />);

const WebPhone = () => {
  // A refetch would sign the phone in again, so the lines last as long as the page.
  const lines = useQuery({
    ...orpc.calls.phone.lines.queryOptions({ input: {} }),
    retry: false,
    staleTime: Infinity,
  });

  const [first, ...more] = lines.data ?? [];

  if (!first) return null;

  return (
    <Suspense fallback={null}>
      <SipPhone lines={[first, ...more]} />
    </Suspense>
  );
};
