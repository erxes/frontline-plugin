import { IconBook, IconSettings, IconTicket } from '@tabler/icons-react';
import {
  AppLayout,
  AppLayoutFooterLink,
  addPluginStyles,
  NavigationMenuLinkItem,
  Sidebar,
  Skeleton,
  usePreviousHotkeyScope,
} from 'erxes-ui';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { ChannelMembersPage } from './channels/ChannelMembersPage.tsx';
import { ChannelPage } from './channels/ChannelPage.tsx';
import { ChannelsLayout } from './channels/ChannelsLayout.tsx';
import { ChannelsPage } from './channels/ChannelsPage.tsx';
import { CHANNELS_PATH } from './channels/useChannels.ts';
import { PLUGIN } from './config.tsx';
import { KB_PATH, TICKETS_PATH } from './paths.ts';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

// A module's screens load on first visit, so what web loads on every page stays small.
const ResponseTemplatesPage = lazy(async () => ({
  default: (await import('./responseTemplates/ResponseTemplatesPage.tsx')).ResponseTemplatesPage,
}));

const KnowledgeBaseLayout = lazy(async () => ({
  default: (await import('./knowledgebase/KnowledgeBaseLayout.tsx')).KnowledgeBaseLayout,
}));

const TopicsPage = lazy(async () => ({
  default: (await import('./knowledgebase/TopicsPage.tsx')).TopicsPage,
}));

const ArticlesPage = lazy(async () => ({
  default: (await import('./knowledgebase/ArticlesPage.tsx')).ArticlesPage,
}));

const CategoriesPage = lazy(async () => ({
  default: (await import('./knowledgebase/CategoriesPage.tsx')).CategoriesPage,
}));

const TopicSettingsPage = lazy(async () => ({
  default: (await import('./knowledgebase/TopicSettingsPage.tsx')).TopicSettingsPage,
}));

const PipelinesPage = lazy(async () => ({
  default: (await import('./pipelines/PipelinesPage.tsx')).PipelinesPage,
}));

const PipelineLayout = lazy(async () => ({
  default: (await import('./pipelines/PipelineLayout.tsx')).PipelineLayout,
}));

const TicketsPage = lazy(async () => ({
  default: (await import('./tickets/TicketsPage.tsx')).TicketsPage,
}));

const TicketPage = lazy(async () => ({
  default: (await import('./tickets/TicketPage.tsx')).TicketPage,
}));

/** The plugin's sidebar: its screens, with the channel settings pinned at the foot. */
const FrontlineLayout = () => {
  const { t } = useTranslation('frontline');

  const { setHotkeyScopeAndMemorizePreviousScope: take, goBackToPreviousHotkeyScope: release } =
    usePreviousHotkeyScope();

  // web turns on no hotkey scope, so the plugin takes erxes-ui's `app` one while it is open: C creates.
  useEffect(() => {
    take('app');

    return release;
  }, [take, release]);

  return (
    <AppLayout
      id={PLUGIN}
      title={t('frontline', 'Frontline')}
      footer={
        <AppLayoutFooterLink
          to={CHANNELS_PATH}
          name={t('settings', 'Settings')}
          icon={IconSettings}
        />
      }
      sidebar={
        <Sidebar.Group variant="flush">
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              <NavigationMenuLinkItem
                to={TICKETS_PATH}
                name={t('tickets', 'Tickets')}
                icon={IconTicket}
              />
              <NavigationMenuLinkItem
                to={KB_PATH}
                name={t('knowledge-base', 'Knowledge Base')}
                icon={IconBook}
              />
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      }
    >
      <Suspense fallback={<Skeleton className="m-3 h-40" />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
};

/** The old `/:id/response/:responseId` link opens that template in the list's panel. */
const ResponseTemplateRedirect = () => {
  const { id, responseId } = useParams();

  return <Navigate to={`${CHANNELS_PATH}/${id}/response?template=${responseId}`} replace />;
};

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route element={<FrontlineLayout />}>
      <Route index element={<Navigate to="tickets" replace />} />
      <Route path="tickets" element={<TicketsPage />} />
      <Route path="tickets/:ticketId" element={<TicketPage />} />
      <Route path="settings/channels" element={<ChannelsLayout />}>
        <Route index element={<ChannelsPage />} />
        <Route path=":id" element={<ChannelPage />} />
        <Route path=":id/members" element={<ChannelMembersPage />} />
        <Route path=":id/response" element={<ResponseTemplatesPage />} />
        <Route path=":id/response/:responseId" element={<ResponseTemplateRedirect />} />
        <Route path=":id/pipelines" element={<PipelinesPage />} />
        <Route path=":id/pipelines/:pipelineId/*" element={<PipelineLayout />} />
      </Route>
      <Route path="knowledgebase" element={<KnowledgeBaseLayout />}>
        <Route index element={<TopicsPage />} />
        <Route path=":topicId" element={<Navigate to="articles" replace />} />
        <Route path=":topicId/articles" element={<ArticlesPage />} />
        <Route path=":topicId/categories" element={<CategoriesPage />} />
        <Route path=":topicId/kbsettings" element={<TopicSettingsPage />} />
      </Route>
    </Route>
  </Routes>
);
