import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { writes } from '#/orpc.ts';
import { Account, saveAccount } from '../store.ts';
import { checkMail, pullMail, Server } from './mail.ts';
import { composeProcedures } from './mailCompose.ts';
import { suppressionProcedures } from './mailSuppressions.ts';

const Login = Server.extend({ password: z.string().min(1).max(500) });

/**
 * Connects a mailbox the organisation already has. Both servers must accept the login first;
 * INBOX is read from where it stands now, so its history stays out of the inbox.
 */
const connect = writes(PERMISSIONS.integrationManage)
  .input(
    z.object({
      address: z.email().max(320),
      /** The sender name on replies. */
      name: z.string().trim().min(1).max(200),
      imap: Login,
      smtp: Login,
    }),
  )
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
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

    return saveAccount(tx, member, {
      provider: 'mail',
      externalId: address,
      name: input.name,
      config,
      secret,
      syncState: state,
    });
  });

export const mailProcedures = {
  connect,
  ...composeProcedures,
  suppressions: suppressionProcedures,
};
