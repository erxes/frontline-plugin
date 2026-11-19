import { IconBrandMeta } from '@tabler/icons-react';
import type { TPluginIntegration } from 'erxes-ui';
import { lazy } from 'react';
import { withText } from '~/i18n/withText.ts';

// `./config` imports this, so like it, it holds only icons, names and lazy slots.

/** The tiles frontline adds to core's Settings › Integrations, each an organisation's own setup. */
export const INTEGRATION_TILES: TPluginIntegration[] = [
  {
    key: 'meta',
    name: 'Meta',
    summary: 'Your own Meta app for Facebook and Instagram',
    icon: IconBrandMeta,
    category: 'messaging',
    permission: 'frontline.integration.manage',
    tabs: [
      {
        value: 'app',
        label: 'App',
        component: lazy(async () => ({
          default: (await withText(() => import('@/integrations/MetaApp.tsx'))()).MetaApp,
        })),
      },
    ],
  },
];
