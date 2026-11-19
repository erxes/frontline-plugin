import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { phoneLinesQuery } from '@/calls/queries.ts';

// JsSIP loads only for a member who has a line.
const SipPhone = lazy(async () => ({ default: (await import('./SipPhone.tsx')).SipPhone }));

/**
 * Core's `floatingWidget`, mounted once and kept across navigation: the member's softphone,
 * signed in for as long as they are in erxes, once an admin gives their extension a SIP password
 * (the PBX's operators). It shows only while a call rings or is on; the Phone page draws the rest.
 * Nothing runs for a member without a line, or without `call.view`.
 */
export const Softphone = () => {
  const [first, ...more] = useQuery(phoneLinesQuery).data ?? [];

  if (!first) return null;

  return (
    <Suspense fallback={null}>
      <SipPhone lines={[first, ...more]} />
    </Suspense>
  );
};
