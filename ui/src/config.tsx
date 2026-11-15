import { IconBox } from '@tabler/icons-react';
import type { IUIConfig } from 'erxes-ui';
import { PLUGIN } from '~/orpc.ts';

// web loads this module on every page, so it imports nothing beyond the tab's icon.
/** What web reads from `./config`: the app tab and the page module under `/frontline/*`. */
export const CONFIG: IUIConfig = {
  name: PLUGIN,
  path: PLUGIN,
  icon: IconBox,
  modules: [{ name: PLUGIN, path: PLUGIN, icon: IconBox }],
};
