import { RecordPage } from 'erxes-ui';
import { Route, Routes, useParams } from 'react-router-dom';
import { HELP_CENTER_TYPE } from '~/plugin.ts';
import { HelpCenterAppearancePage } from './HelpCenterAppearancePage.tsx';
import { HelpCentersPage } from './HelpCentersPage.tsx';

/** A help center expanded from core's side panel, full size. */
const HelpCenterRecord = () => (
  <RecordPage contentType={HELP_CENTER_TYPE} contentId={useParams().id ?? ''} />
);

/** `/frontline/help-centers/*`: the list, a help center's own page and its appearance page. */
export const HelpCenterRoutes = () => (
  <Routes>
    <Route index element={<HelpCentersPage />} />
    <Route path=":id" element={<HelpCenterRecord />} />
    <Route path=":id/appearance" element={<HelpCenterAppearancePage />} />
  </Routes>
);
