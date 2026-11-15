import { addPluginStyles } from 'erxes-ui';
import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ChannelMembersPage } from './channels/ChannelMembersPage.tsx';
import { ChannelPage } from './channels/ChannelPage.tsx';
import { ChannelsLayout } from './channels/ChannelsLayout.tsx';
import { ChannelsPage } from './channels/ChannelsPage.tsx';
import { CHANNELS_PATH } from './channels/useChannels.ts';
import { PLUGIN } from './config.tsx';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

// A module's screens load on first visit, so what web loads on every page stays small.
const ResponseTemplatesPage = lazy(async () => ({
  default: (await import('./responseTemplates/ResponseTemplatesPage.tsx')).ResponseTemplatesPage,
}));

/** The old `/:id/response/:responseId` link opens that template in the list's panel. */
const ResponseTemplateRedirect = () => {
  const { id, responseId } = useParams();

  return <Navigate to={`${CHANNELS_PATH}/${id}/response?template=${responseId}`} replace />;
};

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route index element={<Navigate to="settings/channels" replace />} />
    <Route path="settings/channels" element={<ChannelsLayout />}>
      <Route index element={<ChannelsPage />} />
      <Route path=":id" element={<ChannelPage />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
      <Route path=":id/response" element={<ResponseTemplatesPage />} />
      <Route path=":id/response/:responseId" element={<ResponseTemplateRedirect />} />
    </Route>
  </Routes>
);
