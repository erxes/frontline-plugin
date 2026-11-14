import { addPluginStyles } from 'erxes-ui';
import { Route, Routes } from 'react-router-dom';
import { ItemsPage } from './items/ItemsPage.tsx';
import { PLUGIN } from './orpc.ts';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route index element={<ItemsPage />} />
  </Routes>
);
