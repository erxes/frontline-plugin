import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { writesWithCore } from '#/orpc.ts';
import { Account, Into, intoChannel, saveAccount } from '../store.ts';
import { checkMail, pullMail, ServerInput } from './mail.ts';
import { composeProcedures } from './mailCompose.ts';
import { servers } from './mailServers.ts';
import { suppressionProcedures } from './mailSuppressions.ts';

const Login = ServerInput.extend({ password: z.string().min(1).max(500) });

/**
 * Connects a mailbox the organisation already has. Both servers must accept the login first;
 * INBOX is read from where it stands now, so its history stays out of the inbox. The servers are
 * asked before the transaction opens.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({
    address: z.email().max(320),
    /** The sender name on replies. */
    name: z.string().trim().min(1).max(200),
    imap: Login,
    smtp: Login,
    ...Into,
  }),
  async (_member, input) => {
    const { password: imapPassword, ...imap } = input.imap;
    const { password: smtpPassword, ...smtp } = input.smtp;
    const address = input.address.toLowerCase();
    const config = { imap, smtp };
    const secret = { imapPassword, smtpPassword };
    const refused = await checkMail(config, secret);

    if (refused)
      throw new ORPCError('BAD_REQUEST', {
        message: `The mail server refused the login: ${refused}`,
      });

    const { state } = await pullMail(imap, imapPassword, address, null);

    return { address, config, secret, syncState: state };
  },
)
  .route({
    summary:
      'Connect a mailbox by its IMAP and SMTP login; only mail arriving from now on reaches the inbox',
  })
  .output(Account)
  .handler(async ({ input, context: { tx, member, fromCore } }) =>
    saveAccount(
      tx,
      member,
      {
        provider: 'mail',
        externalId: fromCore.address,
        name: input.name,
        config: fromCore.config,
        secret: fromCore.secret,
        syncState: fromCore.syncState,
      },
      await intoChannel(tx, member, input.channelId),
    ),
  );

export const mailProcedures = {
  connect,
  servers,
  ...composeProcedures,
  suppressions: suppressionProcedures,
};
