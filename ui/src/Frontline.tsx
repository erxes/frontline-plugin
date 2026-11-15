import { addPluginStyles, RecordPage, Skeleton } from 'erxes-ui';
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { ChannelMembersPage } from '@/channels/ChannelMembersPage.tsx';
import { ChannelsPage } from '@/channels/ChannelsPage.tsx';
import { CHANNEL_TYPE, PLUGIN, RESPONSE_TEMPLATE_TYPE } from '~/plugin.ts';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** A record on its own page, where its panel's expand button leads: core draws it full size. */
const RecordRoute = ({ contentType }: { contentType: string }) => (
  <RecordPage contentType={contentType} contentId={useParams().id ?? ''} />
);

/** The lazy pages under it, with a placeholder while one loads. */
const Lazy = () => (
  <Suspense fallback={<Skeleton className="m-3 h-40" />}>
    <Outlet />
  </Suspense>
);

// A module's screens load on first visit, so what web loads on every page stays small.
const ResponseTemplatesPage = lazy(async () => ({
  default: (await import('@/responseTemplates/ResponseTemplatesPage.tsx')).ResponseTemplatesPage,
}));

const KnowledgeBaseLayout = lazy(async () => ({
  default: (await import('@/knowledgebase/KnowledgeBaseLayout.tsx')).KnowledgeBaseLayout,
}));

const TopicsPage = lazy(async () => ({
  default: (await import('@/knowledgebase/TopicsPage.tsx')).TopicsPage,
}));

const ArticlesPage = lazy(async () => ({
  default: (await import('@/knowledgebase/ArticlesPage.tsx')).ArticlesPage,
}));

const CategoriesPage = lazy(async () => ({
  default: (await import('@/knowledgebase/CategoriesPage.tsx')).CategoriesPage,
}));

const TopicSettingsPage = lazy(async () => ({
  default: (await import('@/knowledgebase/TopicSettingsPage.tsx')).TopicSettingsPage,
}));

const PipelinesPage = lazy(async () => ({
  default: (await import('@/pipelines/PipelinesPage.tsx')).PipelinesPage,
}));

const PipelineLayout = lazy(async () => ({
  default: (await import('@/pipelines/PipelineLayout.tsx')).PipelineLayout,
}));

/** The old `/:id/response/:responseId` link opens that template on its own page. */
const ResponseTemplateRedirect = () => (
  <Navigate
    to={`/${PLUGIN}/settings/response-templates/${encodeURIComponent(useParams().responseId ?? '')}`}
    replace
  />
);

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
export const Frontline = () => (
  <Routes>
    <Route index element={<Navigate to="settings/channels" replace />} />
    <Route path="settings/channels">
      <Route index element={<ChannelsPage />} />
      <Route path=":id" element={<RecordRoute contentType={CHANNEL_TYPE} />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
      <Route element={<Lazy />}>
        <Route path=":id/response" element={<ResponseTemplatesPage />} />
        <Route path=":id/response/:responseId" element={<ResponseTemplateRedirect />} />
        <Route path=":id/pipelines" element={<PipelinesPage />} />
        <Route path=":id/pipelines/:pipelineId/*" element={<PipelineLayout />} />
      </Route>
    </Route>
    <Route
      path="settings/response-templates/:id"
      element={<RecordRoute contentType={RESPONSE_TEMPLATE_TYPE} />}
    />
    <Route
      path="knowledgebase"
      element={
        <Suspense fallback={<Skeleton className="m-3 h-40" />}>
          <KnowledgeBaseLayout />
        </Suspense>
      }
    >
      <Route index element={<TopicsPage />} />
      <Route path=":topicId" element={<Navigate to="articles" replace />} />
      <Route path=":topicId/articles" element={<ArticlesPage />} />
      <Route path=":topicId/categories" element={<CategoriesPage />} />
      <Route path=":topicId/kbsettings" element={<TopicSettingsPage />} />
    </Route>
  </Routes>
);
