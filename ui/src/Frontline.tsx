import { addPluginStyles } from 'erxes-ui';
import { Route, Routes } from 'react-router-dom';
import { ChannelsPage } from './channels/ChannelsPage.tsx';
import { PLUGIN } from './config.tsx';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route index element={<ChannelsPage />} />
  </Routes>
);
