import { IconBox } from '@tabler/icons-react';
import type { IUIConfig } from 'erxes-ui';

/** The plugin's name in core. */
export const PLUGIN = 'frontline';

// web loads this module on every page, so it imports nothing beyond the tab's icon.
/** What web reads from `./config`: the app tab and the page module under `/frontline/*`. */
export const CONFIG: IUIConfig = {
  name: PLUGIN,
  path: PLUGIN,
  icon: IconBox,
  modules: [{ name: PLUGIN, path: PLUGIN, icon: IconBox }],
};
