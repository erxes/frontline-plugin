import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config as settings } from '#/config.ts';
import { defineProvider, type OpenAccount } from '../../provider.ts';
import { checkPbx } from './pbx.ts';

/** A Grandstream UCM's settings, without secrets. */
const PbxConfig = z.object({
  /** Its HTTPS API: `pbx.example.com` or `pbx.example.com:8089`. */
  host: z.string(),
  /** The organisation's number on it. */
  phone: z.string(),
  /**
   * The trunk calls come in through and the one they go out on, as the PBX names them: a live
   * event through one of them says its direction. Empty, the event's own type does.
   */
  srcTrunk: z.string().default(''),
  dstTrunk: z.string().default(''),
  /** Its clock's IANA zone: CDR times are wall-clock times there. */
  timeZone: z.string(),
});

/**
 * The key two names of one trunk share: trimmed, lowercased, `-` read as `_`, so `EMJJ-Tuv` and
 * `emjj_tuv` are the same trunk, as pbx-relay keys them.
 */
export const trunkKey = (name: string) => name.trim().toLowerCase().replaceAll('-', '_');

const PbxSecret = z.object({
  /** Signs what the PBX's bridge posts: `x-erxes-signature` over `<timestamp>.<body>`. */
  webhookSecret: z.string(),
});

/**
 * The API user every PBX is signed in to, from `CALL_API_USER` and `CALL_API_PASSWORD`, as the
 * old plugin read it; refused while they are unset.
 */
export const callApi = () => {
  if (!settings.callApi)
    throw new ORPCError('BAD_REQUEST', {
      message: 'Set CALL_API_USER and CALL_API_PASSWORD in the API environment to connect a PBX',
    });

  return settings.callApi;
};

/** The PBX an account's calls go through, signed in as the install's API user. */
export const pbxOf = ({
  row,
  config,
}: Pick<OpenAccount<z.infer<typeof PbxConfig>, z.infer<typeof PbxSecret>>, 'row' | 'config'>) => ({
  orgId: row.orgId,
  host: config.host,
  ...callApi(),
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
