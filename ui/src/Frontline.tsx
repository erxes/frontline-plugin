import { addPluginStyles } from 'erxes-ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ChannelMembersPage } from './channels/ChannelMembersPage.tsx';
import { ChannelPage } from './channels/ChannelPage.tsx';
import { ChannelsLayout } from './channels/ChannelsLayout.tsx';
import { ChannelsPage } from './channels/ChannelsPage.tsx';
import { PLUGIN } from './config.tsx';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route index element={<Navigate to="settings/channels" replace />} />
    <Route path="settings/channels" element={<ChannelsLayout />}>
      <Route index element={<ChannelsPage />} />
      <Route path=":id" element={<ChannelPage />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
    </Route>
  </Routes>
);
