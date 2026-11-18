import {
  IconArticle,
  IconBook,
  IconBox,
  IconChartBar,
  IconChecklist,
  IconCircleDot,
  IconCircles,
  IconClockHour4,
  IconFolder,
  IconForms,
  IconSend,
  IconGitBranch,
  IconHelpCircle,
  IconLock,
  IconMessageCircle,
  IconMessageReply,
  IconMessages,
  IconRobot,
  IconPhone,
  IconPlugConnected,
  IconTicket,
  IconWorldWww,
} from '@tabler/icons-react';
import type { IUIConfig, TPropertyValue, TRecordDraftProps, TRecordSlotProps } from 'erxes-ui';
import { type ComponentType, lazy } from 'react';
import { addConfigText } from '~/i18n/configText.ts';
import { withText } from '~/i18n/withText.ts';
import { DASHBOARD_WIDGETS } from '~/dashboardWidgets.ts';
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
  PIPELINE_TYPE,
  PLUGIN,
  RESPONSE_TEMPLATE_TYPE,
  SURVEY_TYPE,
  TICKET_TYPE,
} from '~/plugin.ts';

// web loads this module on every page, so it imports only icons and names. Each record type's
// slots come from one `slots.ts` that loads when the first of them shows: every import here
// costs `./config` bytes.
type Slot = ComponentType<TRecordSlotProps>;

type ReadSlots = { Title: Slot; Actions: Slot; Detail: Slot };

type Slots = ReadSlots & { New: ComponentType<TRecordDraftProps> };

addConfigText();

/** The slots of a record members read and change but never draft. */
const readSlots = (loadSlots: () => Promise<ReadSlots>) => {
  const load = withText(loadSlots);

  return {
    Title: lazy(async () => ({ default: (await load()).Title })),
    Actions: lazy(async () => ({ default: (await load()).Actions })),
    Detail: lazy(async () => ({ default: (await load()).Detail })),
  };
};

const slots = (loadSlots: () => Promise<Slots>) => {
  const load = withText(loadSlots);

  return {
    ...readSlots(load),
    New: lazy(async () => ({ default: (await load()).New })),
  };
};

const pipeline = withText(() => import('@/pipelines/slots.ts'));
const ticket = withText(() => import('@/tickets/slots.ts'));

/** Custom fields core keeps; the API client loads only when the Properties tab does. */
const propertiesOf = (records: 'tickets' | 'conversations') => ({
  type: `${PLUGIN}.${records.slice(0, -1)}`,
  values: (id: string) => ({
    queryKey: [PLUGIN, records, 'properties', id],
    queryFn: async () => (await import('~/orpc.ts')).orpc[records].properties.values.call({ id }),
  }),
  save: async (id: string, patch: Record<string, TPropertyValue | null>) =>
    (await import('~/orpc.ts')).orpc[records].properties.save.call({ id, patch }),
});

const helpCenter = withText(() => import('@/helpcenter/slots.ts'));
const kb = withText(() => import('@/knowledgebase/slots.ts'));

/** A record's own page, `/frontline/<path>/<id>`, where its panel expands to. */
const pageOf = (path: string) => (id: string) => `/${PLUGIN}/${path}/${encodeURIComponent(id)}`;
const forms = withText(() => import('@/forms/slots.ts'));
const surveys = withText(() => import('@/surveys/slots.ts'));

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
      tabs: [
        {
          value: 'statuses',
          label: 'Ticket statuses',
          icon: IconCircleDot,
          component: lazy(async () => ({ default: (await pipeline()).PipelineStatuses })),
        },
        {
          value: 'sla',
          label: 'SLA',
          icon: IconClockHour4,
          component: lazy(async () => ({ default: (await pipeline()).PipelineSla })),
        },
        {
          value: 'permissions',
          label: 'Permissions',
          icon: IconLock,
          component: lazy(async () => ({ default: (await pipeline()).PipelinePermissions })),
        },
      ],
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
        queryFn: async () => (await ticket()).ticketContacts(id),
      }),
      // The manifest's timeline (`api/src/core.ts`): core's Activity tab shows its events.
      activity: `${PLUGIN}.ticket`,
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
          queryFn: async () => (await ticket()).ticketAppliesTo(id),
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
      ...slots(() => import('@/inbox/slots.ts')),
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
      detailPath: pageOf('settings/integrations'),
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
      hosts: ['core:customer', 'core:company'],
      component: lazy(async () => ({ default: (await ticket()).TicketRelations })),
    },
  ],
  dashboardWidgets: DASHBOARD_WIDGETS,
};
