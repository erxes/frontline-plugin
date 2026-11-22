import { addPluginStyles, IconsProvider, RecordPage } from 'erxes-ui';
import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import {
  CALL_TYPE,
  ACCOUNT_TYPE,
  FORM_SUBMISSION_TYPE,
  FORM_TYPE,
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
import { withText } from '~/i18n/withText.ts';
import { inboxPage, ticketsPage } from '~/pages.ts';
import { ChannelScope } from '~/shared/channelScope.ts';
import css from './styles.css?inline';

addPluginStyles(PLUGIN, css);

/** A record on its own page, where its panel's expand button leads: core draws it full size. */
const RecordRoute = ({ contentType }: { contentType: string }) => (
  <RecordPage contentType={contentType} contentId={useParams().id ?? ''} />
);

// A module's screens load on first visit, so what web loads on every page stays small. Each
// brings the Mongolian text, its own chunk, beside it, so no screen shows in English first.
const ResponseTemplatesPage = lazy(
  withText(async () => ({
    default: (await import('@/responseTemplates/ResponseTemplatesPage.tsx')).ResponseTemplatesPage,
  })),
);

const TopicsPage = lazy(
  withText(async () => ({ default: (await import('@/knowledgebase/pages.ts')).TopicsPage })),
);

const ArticlesPage = lazy(
  withText(async () => ({ default: (await import('@/knowledgebase/pages.ts')).ArticlesPage })),
);

const CategoriesPage = lazy(
  withText(async () => ({ default: (await import('@/knowledgebase/pages.ts')).CategoriesPage })),
);

const TopicSettingsPage = lazy(
  withText(async () => ({ default: (await import('@/knowledgebase/pages.ts')).TopicSettingsPage })),
);

const PipelinesPage = lazy(
  withText(async () => ({
    default: (await import('@/pipelines/PipelinesPage.tsx')).PipelinesPage,
  })),
);

const TagsPage = lazy(
  withText(async () => ({ default: (await import('@/settings/TagsPage.tsx')).TagsPage })),
);

// Help centers route their own list, record and appearance pages, so the page module holds one.
const HelpCenterRoutes = lazy(
  withText(async () => ({
    default: (await import('@/helpcenter/HelpCenterRoutes.tsx')).HelpCenterRoutes,
  })),
);

const InboxPage = lazy(inboxPage);

const MessengerSettingsPage = lazy(
  withText(async () => ({
    default: (await import('@/messenger/MessengerSettingsPage.tsx')).MessengerSettingsPage,
  })),
);

const ChannelsPage = lazy(
  withText(async () => ({ default: (await import('@/channels/pages.ts')).ChannelsPage })),
);

const ChannelMembersPage = lazy(
  withText(async () => ({ default: (await import('@/channels/pages.ts')).ChannelMembersPage })),
);

const ChannelSettingsPage = lazy(
  withText(async () => ({ default: (await import('@/channels/pages.ts')).ChannelSettingsPage })),
);

const PersonalChannel = lazy(
  withText(async () => ({ default: (await import('@/channels/pages.ts')).PersonalChannel })),
);

const TicketsPage = lazy(ticketsPage);

const FormsPage = lazy(
  withText(async () => ({ default: (await import('@/forms/FormsPage.tsx')).FormsPage })),
);

const FormBuilderPage = lazy(
  withText(async () => ({
    default: (await import('@/forms/FormBuilderPage.tsx')).FormBuilderPage,
  })),
);

const SubmissionsPage = lazy(
  withText(async () => ({
    default: (await import('@/forms/SubmissionsPage.tsx')).SubmissionsPage,
  })),
);

const ReportsPage = lazy(
  withText(async () => ({ default: (await import('@/reports/ReportsPage.tsx')).ReportsPage })),
);

const SurveysPage = lazy(
  withText(async () => ({ default: (await import('@/surveys/SurveysPage.tsx')).SurveysPage })),
);

const SurveyBuilderPage = lazy(
  withText(async () => ({
    default: (await import('@/surveys/SurveyBuilderPage.tsx')).SurveyBuilderPage,
  })),
);

/**
 * An old link's new place: `/frontline/<path>/<the link's param>`, then `rest`. The param `*`
 * carries the rest of the old address, each of its segments kept.
 */
const Redirect = ({
  path,
  param = 'id',
  rest = '',
}: {
  path: string;
  param?: string;
  rest?: string;
}) => {
  const value = (useParams()[param] ?? '').split('/').map(encodeURIComponent).join('/');

  return <Navigate to={`/${PLUGIN}/${path}/${value}${rest}`} replace />;
};

const CallHistoryPage = lazy(
  withText(async () => ({ default: (await import('@/calls/pages.ts')).CallHistoryPage })),
);

const PhonePage = lazy(
  withText(async () => ({ default: (await import('@/calls/pages.ts')).PhonePage })),
);

const QueuesPage = lazy(
  withText(async () => ({ default: (await import('@/calls/pages.ts')).QueuesPage })),
);

const QueuePage = lazy(
  withText(async () => ({ default: (await import('@/calls/pages.ts')).QueuePage })),
);

/** Frontline's settings, under `/frontline/settings`, in their own sidebar. */
const settingsRoutes = (
  <Route path="settings" element={<SettingsLayout />}>
    <Route index element={<Navigate to="channels" replace />} />
    <Route path="channels">
      <Route index element={<ChannelsPage />} />
      {/* A channel's settings are a page inside it now. */}
      <Route path=":id" element={<Redirect path="channels" rest="/settings" />} />
      <Route path=":id/members" element={<ChannelMembersPage />} />
      <Route path=":id/response" element={<ResponseTemplatesPage />} />
      {/* The old link opens that template on its own page. */}
      <Route
        path=":id/response/:responseId"
        element={<Redirect path="settings/response-templates" param="responseId" />}
      />
      <Route path=":id/pipelines" element={<PipelinesPage />} />
      {/* The old channel pages' links open their record's new place. */}
      <Route path=":id/general" element={<Redirect path="settings/channels" />} />
      <Route
        path=":id/pipelines/:pipelineId/*"
        element={<Redirect path="settings/pipelines" param="pipelineId" />}
      />
      {[':id/forms/*', ':id/forms/create'].map((path) => (
        <Route key={path} path={path} element={<Navigate to={`/${PLUGIN}/forms`} replace />} />
      ))}
      <Route path=":id/forms/:formId" element={<Redirect path="forms" param="formId" />} />
      <Route
        path=":id/forms/submissions/:formId"
        element={<Redirect path="forms" param="formId" rest="/submissions" />}
      />
      {[':id/surveys/*', ':id/surveys/create'].map((path) => (
        <Route key={path} path={path} element={<Navigate to={`/${PLUGIN}/surveys`} replace />} />
      ))}
      <Route path=":id/surveys/:surveyId" element={<Redirect path="surveys" param="surveyId" />} />
      {/* The old integration detail page, one per channel and kind: a channel's settings list its own now. */}
      <Route
        path="details/:id/:integrationType"
        element={<Redirect path="channels" rest="/settings/integrations" />}
      />
    </Route>
    <Route
      path="personal-channel/*"
      element={<Navigate to={`/${PLUGIN}/personal-channel`} replace />}
    />
    <Route path="pipelines/:id" element={<RecordRoute contentType={PIPELINE_TYPE} />} />
    <Route
      path="response-templates/:id"
      element={<RecordRoute contentType={RESPONSE_TEMPLATE_TYPE} />}
    />
    <Route path="tags" element={<TagsPage />} />
    {/* Help centers moved out of settings. */}
    <Route path="help-centers/*" element={<Redirect path="help-centers" param="*" />} />
    <Route path="accounts/:id" element={<RecordRoute contentType={ACCOUNT_TYPE} />} />
    <Route path="meta/bots/:id" element={<RecordRoute contentType={META_BOT_TYPE} />} />
    {/*
      Any other settings address opens the channels: a record's list without its id, and old links
      to branches, departments and ticket properties, which are core's. These stay in settings:
      leaving the plugin would keep the old page as the tab's last place, so every return would
      leave again.
    */}
    <Route path="*" element={<Navigate to={`/${PLUGIN}/settings/channels`} replace />} />
  </Route>
);

/**
 * Inside a channel: its inbox, tickets and settings, each page narrowed to the channel. A new
 * channel starts its pages afresh, with none of the last one's rows or form.
 */
const ChannelWorkspace = () => {
  const { channelId = '' } = useParams();

  return (
    <ChannelScope value={channelId}>
      <Outlet key={channelId} />
    </ChannelScope>
  );
};

/** A channel's own pages, each narrowed to it. */
const channelRoutes = (
  <Route path="channels/:channelId" element={<ChannelWorkspace />}>
    <Route index element={<Navigate to="inbox" replace />} />
    <Route path="inbox" element={<InboxPage />} />
    <Route path="tickets" element={<TicketsPage />} />
    <Route path="settings" element={<ChannelSettingsPage />} />
    <Route path="settings/:section" element={<ChannelSettingsPage />} />
    <Route path="settings/integrations/:kind" element={<ChannelSettingsPage />} />
  </Route>
);

/**
 * Frontline's routes. The icons members pick for channels and categories load in the background
 * for every page, its settings included.
 */
export const Frontline = () => (
  <IconsProvider>
    <Routes>
      <Route element={<FrontlineLayout />}>
        <Route index element={<Navigate to="inbox" replace />} />
        <Route path="inbox">
          <Route index element={<InboxPage />} />
          <Route path="integrations/:id" element={<RecordRoute contentType={INTEGRATION_TYPE} />} />
          <Route
            path="conversations/:id"
            element={<RecordRoute contentType={CONVERSATION_TYPE} />}
          />
          <Route path="messengers/:id" element={<MessengerSettingsPage />} />
        </Route>
        {channelRoutes}
        <Route path="tickets">
          <Route index element={<TicketsPage />} />
          <Route path=":id" element={<RecordRoute contentType={TICKET_TYPE} />} />
        </Route>
        <Route path="forms">
          <Route index element={<FormsPage />} />
          {/* The old link opens that form's submissions. */}
          <Route
            path="submissions/:formId"
            element={<Redirect path="forms" param="formId" rest="/submissions" />}
          />
          <Route
            path="submission/:id"
            element={<RecordRoute contentType={FORM_SUBMISSION_TYPE} />}
          />
          <Route path=":id" element={<RecordRoute contentType={FORM_TYPE} />} />
          <Route path=":id/builder" element={<FormBuilderPage />} />
          <Route path=":id/submissions" element={<SubmissionsPage />} />
        </Route>
        <Route path="surveys">
          <Route index element={<SurveysPage />} />
          <Route path=":id" element={<RecordRoute contentType={SURVEY_TYPE} />} />
          <Route path=":id/builder" element={<SurveyBuilderPage />} />
        </Route>
        <Route path="reports">
          <Route index element={<ReportsPage section="conversations" />} />
          <Route path="ticket" element={<ReportsPage section="tickets" />} />
          <Route path="facebook" element={<ReportsPage section="meta" />} />
          <Route path="call" element={<ReportsPage section="calls" />} />
          <Route path="*" element={<Navigate to={`/${PLUGIN}/reports`} replace />} />
        </Route>
        <Route path="personal-channel" element={<PersonalChannel />} />
        <Route path="calls">
          <Route index element={<Navigate to="history" replace />} />
          <Route path="history" element={<CallHistoryPage />} />
          <Route path="history/:id" element={<RecordRoute contentType={CALL_TYPE} />} />
          <Route path="phone" element={<PhonePage />} />
          <Route path="queues" element={<QueuesPage />} />
          <Route path="queues/:id" element={<QueuePage />} />
          <Route path="dashboard" element={<Navigate to="../queues" replace />} />
          <Route path="statistics" element={<Navigate to="../queues" replace />} />
          {/* The old dashboard's queue links open that queue's board. */}
          <Route path="dashboard/:id" element={<Redirect path="calls/queues" />} />
          <Route path="statistics/:id" element={<Redirect path="calls/queues" />} />
          <Route path=":id" element={<Redirect path="calls/queues" />} />
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
        <Route path="help-centers/*" element={<HelpCenterRoutes />} />
        <Route path="knowledge-base/*" element={<Redirect path="knowledgebase" param="*" />} />
        {/* Any other address opens the inbox rather than an empty page. */}
        <Route path="*" element={<Navigate to={`/${PLUGIN}/inbox`} replace />} />
      </Route>
      {settingsRoutes}
      <Route path="helpcenter" element={<Navigate to="../help-centers" replace />} />
    </Routes>
  </IconsProvider>
);
