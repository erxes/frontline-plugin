import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { reads } from '#/orpc.ts';

/** What the member may do on the settings pages: tags, teams and ticket properties. */
const access = reads(PERMISSIONS.channelView)
  .output(z.object({ canManage: z.boolean() }))
  .handler(({ context: { member } }) => ({ canManage: member.can(PERMISSIONS.settingsManage) }));

export const settingsProcedures = { access };
