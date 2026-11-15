import { addPluginStyles, RecordPage, Skeleton } from 'erxes-ui';
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { ChannelMembersPage } from '@/channels/ChannelMembersPage.tsx';
import { ChannelsPage } from '@/channels/ChannelsPage.tsx';
import { PersonalChannel } from '@/channels/PersonalChannel.tsx';
import {
  CHANNEL_TYPE,
  HELP_CENTER_TYPE,
  KB_ARTICLE_TYPE,
  KB_CATEGORY_TYPE,
  KB_TOPIC_TYPE,
  PIPELINE_TYPE,
  PLUGIN,
  RESPONSE_TEMPLATE_TYPE,
  TICKET_TYPE,
} from '~/plugin.ts';
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

const TagsPage = lazy(async () => ({
  default: (await import('@/settings/TagsPage.tsx')).TagsPage,
}));

const TeamsPage = lazy(async () => ({
  default: (await import('@/settings/TeamsPage.tsx')).TeamsPage,
}));

const PropertiesPage = lazy(async () => ({
  default: (await import('@/settings/PropertiesPage.tsx')).PropertiesPage,
}));

const HelpCentersPage = lazy(async () => ({
  default: (await import('@/helpcenter/HelpCentersPage.tsx')).HelpCentersPage,
}));

const TicketsPage = lazy(async () => ({
  default: (await import('@/tickets/TicketsPage.tsx')).TicketsPage,
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
    <Route index element={<Navigate to="tickets" replace />} />
    <Route path="tickets" element={<Lazy />}>
      <Route index element={<TicketsPage />} />
      <Route path=":id" element={<RecordRoute contentType={TICKET_TYPE} />} />
    </Route>
    <Route path="settings/channels">
      <Route index element={<ChannelsPage />} />
      <Route path=":id" element={<RecordRoute contentType={CHANNEL_TYPE} />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
      <Route element={<Lazy />}>
        <Route path=":id/response" element={<ResponseTemplatesPage />} />
        <Route path=":id/response/:responseId" element={<ResponseTemplateRedirect />} />
        <Route path=":id/pipelines" element={<PipelinesPage />} />
      </Route>
    </Route>
    <Route path="personal-channel" element={<PersonalChannel />} />
    <Route path="settings/pipelines/:id" element={<RecordRoute contentType={PIPELINE_TYPE} />} />
    <Route path="settings" element={<Lazy />}>
      <Route path="tags" element={<TagsPage />} />
      <Route path="departments" element={<TeamsPage key="department" kind="department" />} />
      <Route path="branches" element={<TeamsPage key="branch" kind="branch" />} />
      <Route path="ticket-properties" element={<PropertiesPage />} />
      <Route path="help-centers" element={<HelpCentersPage />} />
      <Route path="help-centers/:id" element={<RecordRoute contentType={HELP_CENTER_TYPE} />} />
    </Route>
    <Route
      path="settings/response-templates/:id"
      element={<RecordRoute contentType={RESPONSE_TEMPLATE_TYPE} />}
    />
    <Route path="helpcenter" element={<Navigate to="../settings/help-centers" replace />} />
    <Route path="knowledgebase" element={<Lazy />}>
      <Route index element={<TopicsPage />} />
      <Route path="category/:id" element={<RecordRoute contentType={KB_CATEGORY_TYPE} />} />
      <Route path="article/:id" element={<RecordRoute contentType={KB_ARTICLE_TYPE} />} />
      <Route path=":id" element={<RecordRoute contentType={KB_TOPIC_TYPE} />} />
      <Route path=":topicId/articles" element={<ArticlesPage />} />
      <Route path=":topicId/categories" element={<CategoriesPage />} />
      <Route path=":topicId/kbsettings" element={<TopicSettingsPage />} />
    </Route>
  </Routes>
);
