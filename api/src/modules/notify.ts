import type { CoreClient } from '@erxes/plugin-sdk';
import { core } from '#/core.ts';
import { logger } from '#/logger.ts';

type Notice = Parameters<CoreClient['notifications']['create']>[0];

/**
 * Tells members through core, except the one who acted. Call it after the change commits: a
 * failure is logged, not thrown. Core shows `title` in the member's language from the manifest's
 * `translations`, so it names no one and counts nothing.
 */
export const notifyMembers = async (orgId: string, notice: Notice) => {
  const userIds = notice.userIds.filter((id) => id !== notice.actorUserId);

  if (userIds.length === 0) return;

  await core
    .forOrg(orgId)
    .notifications.create({ ...notice, userIds })
    .catch((error: unknown) => {
      logger.error(
        { err: error, kind: notice.kind, link: notice.link, userIds },
        'notification failed',
      );
    });
};
