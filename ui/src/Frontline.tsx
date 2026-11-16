import { addPluginStyles, RecordPage } from 'erxes-ui';
import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ChannelMembersPage } from '@/channels/ChannelMembersPage.tsx';
import { ChannelsPage } from '@/channels/ChannelsPage.tsx';
import { PersonalChannel } from '@/channels/PersonalChannel.tsx';
import {
  CALL_TYPE,
  CHANNEL_TYPE,
  ACCOUNT_TYPE,
  FORM_SUBMISSION_TYPE,
  FORM_TYPE,
  HELP_CENTER_TYPE,
  CONVERSATION_TYPE,
  INTEGRATION_TYPE,
  KB_ARTICLE_TYPE,
  KB_CATEGORY_TYPE,
  KB_TOPIC_TYPE,
  META_BOT_TYPE,
  PIPELINE_TYPE,
  PLUGIN,
  RESPONSE_TEMPLATE_TYPE,
  SURVEY_TYPE,
  TICKET_TYPE,
} from '~/plugin.ts';
import { FrontlineLayout, SettingsLayout } from './Layout.tsx';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** A record on its own page, where its panel's expand button leads: core draws it full size. */
const RecordRoute = ({ contentType }: { contentType: string }) => (
  <RecordPage contentType={contentType} contentId={useParams().id ?? ''} />
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

const PropertiesPage = lazy(async () => ({
  default: (await import('@/settings/PropertiesPage.tsx')).PropertiesPage,
}));

const HelpCentersPage = lazy(async () => ({
  default: (await import('@/helpcenter/HelpCentersPage.tsx')).HelpCentersPage,
}));

const InboxPage = lazy(async () => ({
  default: (await import('@/inbox/InboxPage.tsx')).InboxPage,
}));

const MessengerSettingsPage = lazy(async () => ({
  default: (await import('@/messenger/MessengerSettingsPage.tsx')).MessengerSettingsPage,
}));

const IntegrationsPage = lazy(async () => ({
  default: (await import('@/integrations/IntegrationsPage.tsx')).IntegrationsPage,
}));

const TicketsPage = lazy(async () => ({
  default: (await import('@/tickets/TicketsPage.tsx')).TicketsPage,
}));

const FormsPage = lazy(async () => ({
  default: (await import('@/forms/FormsPage.tsx')).FormsPage,
}));

const FormBuilderPage = lazy(async () => ({
  default: (await import('@/forms/FormBuilderPage.tsx')).FormBuilderPage,
}));

const SubmissionsPage = lazy(async () => ({
  default: (await import('@/forms/SubmissionsPage.tsx')).SubmissionsPage,
}));

const SurveysPage = lazy(async () => ({
  default: (await import('@/surveys/SurveysPage.tsx')).SurveysPage,
}));

/** The old `/forms/submissions/:formId` link opens that form's submissions. */
const SubmissionsRedirect = () => (
  <Navigate
    to={`/${PLUGIN}/forms/${encodeURIComponent(useParams().formId ?? '')}/submissions`}
    replace
  />
);

const CallHistoryPage = lazy(async () => ({
  default: (await import('@/calls/CallHistoryPage.tsx')).CallHistoryPage,
}));

const QueuesPage = lazy(async () => ({
  default: (await import('@/calls/QueuesPage.tsx')).QueuesPage,
}));

const QueuePage = lazy(async () => ({
  default: (await import('@/calls/QueuePage.tsx')).QueuePage,
}));

/** The old calls dashboard's queue links open that queue's board. */
const QueueRedirect = () => (
  <Navigate to={`/${PLUGIN}/calls/queues/${encodeURIComponent(useParams().id ?? '')}`} replace />
);

/** The old `/:id/response/:responseId` link opens that template on its own page. */
const ResponseTemplateRedirect = () => (
  <Navigate
    to={`/${PLUGIN}/settings/response-templates/${encodeURIComponent(useParams().responseId ?? '')}`}
    replace
  />
);

/** The page module web renders under `/frontline/*` (loaded as `frontline_ui/frontline`). */
/** Frontline's settings, under `/frontline/settings`, in their own sidebar. */
const settingsRoutes = (
  <Route path="settings" element={<SettingsLayout />}>
    <Route index element={<Navigate to="channels" replace />} />
    <Route path="channels">
      <Route index element={<ChannelsPage />} />
      <Route path=":id" element={<RecordRoute contentType={CHANNEL_TYPE} />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
      <Route path=":id/response" element={<ResponseTemplatesPage />} />
      <Route path=":id/response/:responseId" element={<ResponseTemplateRedirect />} />
      <Route path=":id/pipelines" element={<PipelinesPage />} />
    </Route>
    <Route path="pipelines/:id" element={<RecordRoute contentType={PIPELINE_TYPE} />} />
    <Route
      path="response-templates/:id"
      element={<RecordRoute contentType={RESPONSE_TEMPLATE_TYPE} />}
    />
    <Route path="tags" element={<TagsPage />} />
    {/*
      Branches and departments are core's. Old links stay in settings: leaving the plugin
      would keep the old page as the tab's last place, so every return would leave again.
    */}
    <Route path="departments" element={<Navigate to="../channels" replace />} />
    <Route path="branches" element={<Navigate to="../channels" replace />} />
    <Route path="ticket-properties" element={<PropertiesPage />} />
    <Route path="help-centers" element={<HelpCentersPage />} />
    <Route path="help-centers/:id" element={<RecordRoute contentType={HELP_CENTER_TYPE} />} />
    <Route path="integrations" element={<IntegrationsPage />} />
    <Route path="integrations/:id" element={<RecordRoute contentType={ACCOUNT_TYPE} />} />
    <Route path="meta" element={<Navigate to="../integrations" replace />} />
    <Route path="meta/bots/:id" element={<RecordRoute contentType={META_BOT_TYPE} />} />
  </Route>
);

export const Frontline = () => (
  <Routes>
    <Route element={<FrontlineLayout />}>
      <Route index element={<Navigate to="inbox" replace />} />
      <Route path="inbox">
        <Route index element={<InboxPage />} />
        <Route path="integrations/:id" element={<RecordRoute contentType={INTEGRATION_TYPE} />} />
        <Route path="conversations/:id" element={<RecordRoute contentType={CONVERSATION_TYPE} />} />
        <Route path="messengers/:id" element={<MessengerSettingsPage />} />
      </Route>
      <Route path="tickets">
        <Route index element={<TicketsPage />} />
        <Route path=":id" element={<RecordRoute contentType={TICKET_TYPE} />} />
      </Route>
      <Route path="forms">
        <Route index element={<FormsPage />} />
        <Route path="submissions/:formId" element={<SubmissionsRedirect />} />
        <Route path="submission/:id" element={<RecordRoute contentType={FORM_SUBMISSION_TYPE} />} />
        <Route path=":id" element={<RecordRoute contentType={FORM_TYPE} />} />
        <Route path=":id/builder" element={<FormBuilderPage />} />
        <Route path=":id/submissions" element={<SubmissionsPage />} />
      </Route>
      <Route path="surveys">
        <Route index element={<SurveysPage />} />
        <Route path=":id" element={<RecordRoute contentType={SURVEY_TYPE} />} />
      </Route>
      <Route path="personal-channel" element={<PersonalChannel />} />
      <Route path="calls">
        <Route index element={<Navigate to="history" replace />} />
        <Route path="history" element={<CallHistoryPage />} />
        <Route path="history/:id" element={<RecordRoute contentType={CALL_TYPE} />} />
        <Route path="queues" element={<QueuesPage />} />
        <Route path="queues/:id" element={<QueuePage />} />
        <Route path="dashboard" element={<Navigate to="../queues" replace />} />
        <Route path="statistics" element={<Navigate to="../queues" replace />} />
        <Route path="dashboard/:id" element={<QueueRedirect />} />
        <Route path="statistics/:id" element={<QueueRedirect />} />
        <Route path=":id" element={<QueueRedirect />} />
      </Route>
      <Route path="knowledgebase">
        <Route index element={<TopicsPage />} />
        <Route path="category/:id" element={<RecordRoute contentType={KB_CATEGORY_TYPE} />} />
        <Route path="article/:id" element={<RecordRoute contentType={KB_ARTICLE_TYPE} />} />
        <Route path=":id" element={<RecordRoute contentType={KB_TOPIC_TYPE} />} />
        <Route path=":topicId/articles" element={<ArticlesPage />} />
        <Route path=":topicId/categories" element={<CategoriesPage />} />
        <Route path=":topicId/kbsettings" element={<TopicSettingsPage />} />
      </Route>
    </Route>
    {settingsRoutes}
    <Route path="helpcenter" element={<Navigate to="../settings/help-centers" replace />} />
    {/* The old integration detail page, one per channel and kind, is now the accounts list. */}
    <Route
      path="details/:id/:integrationType"
      element={<Navigate to={`/${PLUGIN}/settings/integrations`} replace />}
    />
  </Routes>
);
