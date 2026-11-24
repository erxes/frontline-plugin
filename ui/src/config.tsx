import {
  IconArticle,
  IconBook,
  IconBox,
  IconChartBar,
  IconChecklist,
  IconCircles,
  IconFolder,
  IconForms,
  IconSend,
  IconGitBranch,
  IconHelpCircle,
  IconMessageCircle,
  IconMessageReply,
  IconMessageShare,
  IconMessages,
  IconRobot,
  IconPhone,
  IconPlugConnected,
  IconTicket,
  IconWorldWww,
} from '@tabler/icons-react';
import type { IUIConfig } from 'erxes-ui';
import { lazy } from 'react';
import { addConfigText } from '~/i18n/configText.ts';
import { withText } from '~/i18n/withText.ts';
import { CHANNEL_TABS, PIPELINE_TABS } from '~/recordTabs.ts';
import { DASHBOARD_WIDGETS } from '~/dashboardWidgets.ts';
import { INTEGRATION_TILES } from '~/integrationTiles.ts';
import { propertiesOf, readSlots, slots } from '~/recordSlots.ts';
import {
  ACCOUNT_TYPE,
  CALL_TYPE,
  CONVERSATION_TYPE,
  CHANNEL_TYPE,
  FORM_SUBMISSION_TYPE,
  FORM_TYPE,
  HELP_CENTER_TYPE,
  INTEGRATION_TYPE,
  KB_ARTICLE_TYPE,
  KB_CATEGORY_TYPE,
  KB_TOPIC_TYPE,
  META_BOT_TYPE,
  pageOf,
  PIPELINE_TYPE,
  PLUGIN,
  RESPONSE_TEMPLATE_TYPE,
  SURVEY_TYPE,
  TICKET_TYPE,
} from '~/plugin.ts';

// web loads this module on every page, so it imports only icons and names, and lazy slots
// (`recordSlots.ts`): every import here costs `./config` bytes.
addConfigText();

const pipeline = withText(() => import('@/pipelines/slots.ts'));
const ticket = withText(() => import('@/tickets/slots.ts'));
const ticketComments = withText(() => import('@/ticketComments/TicketComments.tsx'));

const helpCenter = withText(() => import('@/helpcenter/slots.ts'));
const kb = withText(() => import('@/knowledgebase/slots.ts'));
const forms = withText(() => import('@/forms/slots.ts'));
const surveys = withText(() => import('@/surveys/slots.ts'));
const integration = withText(() => import('@/inbox/slots.ts'));
const conversationRelations = withText(() => import('@/inbox/ConversationRelations.tsx'));

/**
 * What web reads from `./config`: the app tab, the page module under `/frontline/*`, and the
 * records core's side panel opens. Core draws a record's panel; these slots fill it. A record
 * expands to its `detailPath` (`Frontline.tsx`).
 */
export const CONFIG: IUIConfig = {
  name: PLUGIN,
  path: PLUGIN,
  icon: IconBox,
  modules: [{ name: PLUGIN, path: PLUGIN, icon: IconBox }],
  recordTypes: [
    {
      contentType: CHANNEL_TYPE,
      title: 'Channel',
      icon: IconCircles,
      detailPath: pageOf('settings/channels'),
      ...slots(() => import('@/channels/slots.ts')),
      tabs: CHANNEL_TABS,
    },
    {
      contentType: RESPONSE_TEMPLATE_TYPE,
      title: 'Response template',
      icon: IconMessageReply,
      detailPath: pageOf('settings/response-templates'),
      ...slots(() => import('@/responseTemplates/slots.ts')),
    },
    {
      contentType: PIPELINE_TYPE,
      title: 'Pipeline',
      icon: IconGitBranch,
      detailPath: pageOf('settings/pipelines'),
      ...slots(pipeline),
      tabs: PIPELINE_TABS,
    },
    {
      contentType: KB_TOPIC_TYPE,
      title: 'Topic',
      icon: IconBook,
      detailPath: pageOf('knowledgebase'),
      ...slots(async () => (await kb()).Topic),
    },
    {
      contentType: KB_CATEGORY_TYPE,
      title: 'Category',
      icon: IconFolder,
      detailPath: pageOf('knowledgebase/category'),
      ...slots(async () => (await kb()).Category),
    },
    {
      contentType: KB_ARTICLE_TYPE,
      title: 'Article',
      icon: IconArticle,
      detailPath: pageOf('knowledgebase/article'),
      ...slots(async () => (await kb()).Article),
      tabs: [
        {
          value: 'content',
          label: 'Content',
          icon: IconArticle,
          component: lazy(async () => ({ default: (await kb()).ArticleContent })),
        },
      ],
    },
    {
      contentType: TICKET_TYPE,
      title: 'Ticket',
      icon: IconTicket,
      detailPath: pageOf('tickets'),
      ...slots(ticket),
      contacts: (id) => ({
        queryKey: [PLUGIN, 'ticket-contacts', id],
        queryFn: async ({ client }) => (await ticket()).ticketContacts(client, id),
      }),
      // The manifest's timeline (`api/src/core.ts`): core's Activity tab shows its events.
      activity: `${PLUGIN}.ticket`,
      tabs: [
        {
          value: 'comments',
          label: 'Comments',
          after: 'detail',
          icon: IconMessageShare,
          component: lazy(async () => ({ default: (await ticketComments()).TicketComments })),
        },
      ],
      // Its field groups can be limited to pipelines.
      properties: {
        ...propertiesOf('tickets'),
        limits: [
          {
            key: 'pipeline',
            label: 'Pipelines',
            options: {
              queryKey: [PLUGIN, 'pipeline-limits'],
              queryFn: async () => (await ticket()).pipelineLimits(),
            },
          },
        ],
        appliesTo: (id) => ({
          queryKey: [PLUGIN, 'ticket-applies-to', id],
          queryFn: async ({ client }) => (await ticket()).ticketAppliesTo(client, id),
        }),
      },
    },
    {
      contentType: HELP_CENTER_TYPE,
      title: 'Help center',
      icon: IconHelpCircle,
      detailPath: pageOf('help-centers'),
      ...slots(helpCenter),
      tabs: [
        {
          value: 'domain',
          label: 'Domain',
          icon: IconWorldWww,
          component: lazy(async () => ({ default: (await helpCenter()).HelpCenterDomain })),
        },
      ],
    },
    {
      contentType: FORM_TYPE,
      title: 'Form',
      icon: IconForms,
      detailPath: pageOf('forms'),
      ...slots(async () => (await forms()).FormSlots),
      activity: `${PLUGIN}.form`,
    },
    {
      contentType: FORM_SUBMISSION_TYPE,
      title: 'Submission',
      icon: IconSend,
      detailPath: pageOf('forms/submission'),
      ...readSlots(async () => (await forms()).SubmissionSlots),
    },
    {
      contentType: SURVEY_TYPE,
      title: 'Survey',
      icon: IconChecklist,
      detailPath: pageOf('surveys'),
      ...slots(async () => (await surveys()).SurveySlots),
      tabs: [
        {
          value: 'results',
          label: 'Results',
          icon: IconChartBar,
          component: lazy(async () => ({ default: (await surveys()).SurveyResults })),
        },
      ],
      activity: `${PLUGIN}.survey`,
    },
    {
      contentType: INTEGRATION_TYPE,
      title: 'Integration',
      icon: IconMessageCircle,
      detailPath: pageOf('inbox/integrations'),
      ...slots(integration),
      tabs: [
        {
          value: 'bot',
          label: 'Bot',
          icon: IconRobot,
          component: lazy(async () => ({ default: (await integration()).Bot })),
        },
      ],
    },
    {
      contentType: META_BOT_TYPE,
      title: 'Bot',
      icon: IconRobot,
      detailPath: pageOf('settings/meta/bots'),
      ...slots(() => import('@/integrations/botSlots.ts')),
    },
    {
      contentType: ACCOUNT_TYPE,
      title: 'Account',
      icon: IconPlugConnected,
      detailPath: pageOf('settings/accounts'),
      ...slots(() => import('@/integrations/accountSlots.ts')),
    },
    {
      contentType: CALL_TYPE,
      title: 'Call',
      icon: IconPhone,
      detailPath: pageOf('calls/history'),
      // A call comes from the PBX or CallPro, so it has no draft.
      ...readSlots(() => import('@/calls/slots.ts')),
    },
    {
      contentType: CONVERSATION_TYPE,
      // Its draft is a new mail, which starts one.
      title: 'Conversation',
      icon: IconMessages,
      detailPath: pageOf('inbox/conversations'),
      ...slots(() => import('@/inbox/conversationSlots.ts')),
      activity: `${PLUGIN}.conversation`,
      properties: propertiesOf('conversations'),
    },
  ],
  // The softphone on every page, for a member with a SIP line.
  floatingWidget: lazy(async () => ({
    default: (await withText(() => import('@/calls/softphone/Softphone.tsx'))()).Softphone,
  })),
  relationTabs: [
    {
      name: 'tickets',
      title: 'Tickets',
      icon: IconTicket,
      // An ecommerce order's panel lists its customer's tickets.
      hosts: ['core:customer', 'core:company', 'ecommerce:order'],
      component: lazy(async () => ({ default: (await ticket()).TicketRelations })),
    },
    {
      name: 'conversations',
      title: 'Conversations',
      icon: IconMessages,
      hosts: ['core:customer'],
      component: lazy(async () => ({
        default: (await conversationRelations()).ConversationRelations,
      })),
    },
  ],
  dashboardWidgets: DASHBOARD_WIDGETS,
  // The organisation's own Meta app, on core's Settings › Integrations.
  integrations: INTEGRATION_TILES,
};
