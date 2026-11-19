import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { defineProvider, type OpenAccount } from '../../provider.ts';
import { checkPbx } from './pbx.ts';

/** A Grandstream UCM's settings, without secrets. */
const PbxConfig = z.object({
  /** Its HTTPS API: `pbx.example.com` or `pbx.example.com:8089`. */
  host: z.string(),
  /** The organisation's number on it. */
  phone: z.string(),
  /** Its clock's IANA zone: CDR times are wall-clock times there. */
  timeZone: z.string(),
  /**
   * The TURN server softphones relay their audio through when the PBX or the member is behind
   * NAT (`turn:turn.example.com:3478`), and its login. Every operator's softphone gets them; the
   * password stays sealed in the secret, and settings show only whether there is one.
   */
  turnUrl: z.string().default(''),
  turnUsername: z.string().default(''),
  hasTurnPassword: z.boolean().default(false),
});

const PbxSecret = z.object({
  apiUser: z.string(),
  apiPassword: z.string(),
  /** Signs what the PBX's bridge posts: `x-erxes-signature` over `<timestamp>.<body>`. */
  webhookSecret: z.string(),
  turnPassword: z.string().default(''),
});

/** The PBX an account's calls go through, signed in as its API user. */
export const pbxOf = ({
  row,
  config,
  secret,
}: OpenAccount<z.infer<typeof PbxConfig>, z.infer<typeof PbxSecret>>) => ({
  orgId: row.orgId,
  host: config.host,
  user: secret.apiUser,
  password: secret.apiPassword,
});

const noReplies = () =>
  Promise.reject(new ORPCError('BAD_REQUEST', { message: 'A phone call takes no written reply' }));

/** A Grandstream UCM: frontline reads its calls, queues, agents and recordings. */
export const call = defineProvider({
  name: 'call',
  Config: PbxConfig,
  Secret: PbxSecret,
  check: (account) => checkPbx(pbxOf(account)),
  send: noReplies,
});

/** A CallPro line: CallPro posts each call's state to the line's webhook address. */
export const callpro = defineProvider({
  name: 'callpro',
  Config: z.object({ phone: z.string() }),
  Secret: z.object({}),
  // CallPro has no API to ask: the line works while its address takes posts.
  check: () => Promise.resolve(null),
  send: noReplies,
});
