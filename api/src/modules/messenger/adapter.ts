import { z } from 'zod';
import type { Adapter } from '../inbox/adapters.ts';
import { Color } from '../fields.ts';

/** What a website's messenger shows its visitors. */
export const MessengerConfig = z.object({
  /** The first message a visitor sees. */
  welcome: z.string().trim().max(1000).default(''),
  /** The launcher's and header's colour. */
  color: Color.default('#4F46E5'),
});

/** The chat on a website: visitors write through the public messenger routes and read replies there. */
export const messenger = {
  kind: 'messenger',
  label: 'Messenger',
  config: MessengerConfig,
} satisfies Adapter;
