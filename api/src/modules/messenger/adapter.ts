import { EventEmitter } from 'node:events';
import { z } from 'zod';
import type { Adapter } from '../inbox/adapters.ts';
import { Color } from '../fields.ts';
import { HOURS_DAYS } from './view.ts';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time such as 09:00');

const Text = (max: number) => z.string().trim().max(max).default('');

const Url = z.url({ protocol: /^https?$/ }).max(2000);

/** What a website's messenger shows its visitors, and when its team reads as online. */
export const MessengerConfig = z.object({
  /** The first message a visitor sees. */
  welcome: Text(1000),
  /** What a visitor reads while the team is offline. */
  away: Text(1000),
  /** What a visitor reads once their conversation is resolved. */
  thank: Text(1000),
  greetingTitle: Text(200),
  greetingMessage: Text(1000),
  /** The members the messenger shows as its team, at most ten. */
  supporterIds: z.array(z.string()).max(10).default([]),
  /** Social and other links under the greeting. */
  links: z.array(Url).max(10).default([]),

  /** The launcher's and header's colour, and the text on it. */
  color: Color.default('#4F46E5'),
  textColor: Color.default('#FFFFFF'),
  /** The page behind the conversation, when it isn't the theme's. */
  backgroundColor: Color.nullable().default(null),
  logo: z.string().max(2000).nullable().default(null),
  launcherLogo: z.string().max(2000).nullable().default(null),
  heroStyle: z.enum(['glossy', 'aurora', 'mesh', 'flat']).default('glossy'),
  navigation: z.enum(['pill', 'fluid']).default('pill'),

  /** `manual` reads `isOnline`; `auto` reads the online hours in `timezone`. */
  availability: z.enum(['manual', 'auto']).default('manual'),
  isOnline: z.boolean().default(true),
  onlineHours: z
    .array(z.object({ day: z.enum(HOURS_DAYS), from: Time, to: Time }))
    .max(20)
    .default([]),
  /** An IANA zone such as `Asia/Ulaanbaatar`; without one, UTC. */
  timezone: z
    .string()
    .refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone), 'An IANA time zone')
    .nullable()
    .default(null),
  showTimezone: z.boolean().default(false),
  responseRate: z.enum(['minutes', 'hours', 'days']).default('minutes'),
  hideWhenOffline: z.boolean().default(false),

  language: z.string().max(10).default('en'),
  /** Visitors leave an email or phone before they write. */
  requireAuth: z.boolean().default(false),
  showChat: z.boolean().default(true),
  showLauncher: z.boolean().default(true),
  /** A resolved conversation signs its visitor out of the messenger. */
  forceLogoutWhenResolve: z.boolean().default(false),
  /** The knowledge base topic the messenger lets visitors search. */
  knowledgeBaseTopicId: z.string().nullable().default(null),
  /** The pipelines of its channel a visitor files tickets in; none hides the ticket tab. */
  ticketPipelineIds: z.array(z.string()).max(10).default([]),
  /** Pages of the website the messenger links to, each a button. */
  websiteApps: z
    .array(
      z.object({ url: Url, buttonText: z.string().trim().min(1).max(100), description: Text(500) }),
    )
    .max(10)
    .default([]),

  /** What the bot says when a visitor opens a new conversation, and its menu of buttons and links. */
  botGreeting: Text(1000),
  botMenu: z
    .array(
      z.object({ text: z.string().trim().min(1).max(100), link: Url.nullable().default(null) }),
    )
    .max(10)
    .default([]),
});

export type MessengerConfig = z.infer<typeof MessengerConfig>;

/** The chat on a website: visitors write through the public messenger routes and read replies there. */
export const messenger = {
  kind: 'messenger',
  label: 'Messenger',
  config: MessengerConfig,
  surveys: true,
} satisfies Adapter;

/**
 * Hears in this process that an integration's settings changed or it went, so what the
 * messenger's `/settings` keeps of it goes too.
 */
export const integrationChanges = new EventEmitter<{ changed: [integrationId: string] }>();
