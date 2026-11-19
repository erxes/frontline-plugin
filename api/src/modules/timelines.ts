import { type PluginMember, verifyCoreAccessCheck } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import express from 'express';
import { signedByCore } from '#/config.ts';
import {
  CHANNEL_TIMELINE,
  CONVERSATION_TIMELINE,
  core,
  FORM_TIMELINE,
  SURVEY_TIMELINE,
  TICKET_TIMELINE,
} from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { askedMember, channelFor } from './channels/access.ts';
import { fail, verifiedBy } from './fail.ts';
import { formFor } from './forms/shared.ts';
import { conversationById } from './inbox/shared.ts';
import { surveysFor } from './surveys/shared.ts';
import { seenTicket } from './tickets/shared.ts';

/** Whether `read` finds the record: its module's NOT_FOUND is a no, anything else fails. */
const found = (read: Promise<unknown>) =>
  read.then(
    () => true,
    (error: unknown) => {
      if (error instanceof ORPCError && error.code === 'NOT_FOUND') return false;

      throw error;
    },
  );

/** Whether `member` may read record `id` of each timeline, as the record's own module reads it. */
const READS: Record<string, (tx: Tx, member: PluginMember, id: string) => Promise<boolean>> = {
  [TICKET_TIMELINE]: (tx, member, id) => found(seenTicket(tx, member, id)),
  [FORM_TIMELINE]: (tx, member, id) => found(formFor(tx, member, id, false)),
  [SURVEY_TIMELINE]: (tx, member, id) => found(surveysFor(tx, member, [id], false)),
  [CHANNEL_TIMELINE]: (tx, member, id) => found(channelFor(tx, member, id, { change: false })),
  [CONVERSATION_TIMELINE]: (tx, member, id) => found(conversationById(tx, member, id)),
};

/**
 * Core asks here, signed over the raw body, whether a member may read or note on a record's
 * timeline. Core checked the timeline's permission; frontline answers whether the record is one
 * they see, which a channel they aren't in or a private pipeline hides.
 */
export const timelineRoutes = () =>
  express.Router().post('/access', express.text({ type: '*/*' }), async (req, res) => {
    const body: unknown = req.body;

    const check = await verifiedBy(res, 'timeline access token', 'Only core asks', () =>
      verifyCoreAccessCheck(
        req.headers.authorization,
        typeof body === 'string' ? body : '',
        signedByCore,
      ),
    );

    if (!check) return;

    const read = READS[check.type];

    try {
      if (!read) {
        res.json({ allowed: false });

        return;
      }

      const { role } = await core.forOrg(check.orgId).users.get({ id: check.userId });
      const member = askedMember(check.orgId, check.userId, role);

      res.json({ allowed: await withOrg(check.orgId, (tx) => read(tx, member, check.id)) });
    } catch (error) {
      fail(res, error, `${check.type} access`);
    }
  });
