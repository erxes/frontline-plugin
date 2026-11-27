import { Route, Routes } from 'react-router-dom';
import { HelpCenterPage } from './HelpCenterPage.tsx';
import { HelpCentersPage } from './HelpCentersPage.tsx';

/** `/frontline/help-centers/*`: the list, and each help center's page open at a section. */
export const HelpCenterRoutes = () => (
  <Routes>
    <Route index element={<HelpCentersPage />} />
    <Route path=":id" element={<HelpCenterPage />} />
    <Route path=":id/:section" element={<HelpCenterPage />} />
  </Routes>
);
