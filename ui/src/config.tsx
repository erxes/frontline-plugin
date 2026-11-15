import { IconBox, IconCircles, IconMessageReply } from '@tabler/icons-react';
import type { IUIConfig } from 'erxes-ui';
import { lazy } from 'react';
import { CHANNEL_TYPE, PLUGIN, RESPONSE_TEMPLATE_TYPE } from '~/plugin.ts';

// web loads this module on every page, so it imports only icons and names; each record's
// slots load when one first opens.
const channel = () => import('@/channels/ChannelPanel.tsx');
const template = () => import('@/responseTemplates/ResponseTemplatePanel.tsx');

/**
 * What web reads from `./config`: the app tab, the page module under `/frontline/*`, and the
 * records core's side panel opens. Core draws a record's panel; these slots fill it. A record
 * expands to its `detailPath` (`Frontline.tsx`).
 */
export const CONFIG: IUIConfig = {
  name: PLUGIN,
  path: PLUGIN,
  icon: IconBox,
  modules: [{ name: PLUGIN, path: PLUGIN, icon: IconBox }],
  recordTypes: [
    {
      contentType: CHANNEL_TYPE,
      title: 'Channel',
      icon: IconCircles,
      detailPath: (id) => `/${PLUGIN}/settings/channels/${encodeURIComponent(id)}`,
      Title: lazy(async () => ({ default: (await channel()).ChannelTitle })),
      Actions: lazy(async () => ({ default: (await channel()).ChannelActions })),
      Detail: lazy(async () => ({ default: (await channel()).ChannelDetail })),
      New: lazy(async () => ({
        default: (await import('@/channels/ChannelNew.tsx')).ChannelNew,
      })),
    },
    {
      contentType: RESPONSE_TEMPLATE_TYPE,
      title: 'Response template',
      icon: IconMessageReply,
      detailPath: (id) => `/${PLUGIN}/settings/response-templates/${encodeURIComponent(id)}`,
      Title: lazy(async () => ({ default: (await template()).ResponseTemplateTitle })),
      Actions: lazy(async () => ({ default: (await template()).ResponseTemplateActions })),
      Detail: lazy(async () => ({ default: (await template()).ResponseTemplateDetail })),
      New: lazy(async () => ({
        default: (await import('@/responseTemplates/ResponseTemplateNew.tsx')).ResponseTemplateNew,
      })),
    },
  ],
};
