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
import type { IUIConfig, TRecordDraftProps, TRecordSlotProps } from 'erxes-ui';
import { type ComponentType, lazy } from 'react';
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

/** The slots of a record members read and change but never draft. */
const readSlots = (load: () => Promise<ReadSlots>) => ({
  Title: lazy(async () => ({ default: (await load()).Title })),
  Actions: lazy(async () => ({ default: (await load()).Actions })),
  Detail: lazy(async () => ({ default: (await load()).Detail })),
});

const slots = (load: () => Promise<Slots>) => ({
  ...readSlots(load),
  New: lazy(async () => ({ default: (await load()).New })),
});

const pipeline = () => import('@/pipelines/slots.ts');
const ticket = () => import('@/tickets/slots.ts');
const helpCenter = () => import('@/helpcenter/slots.ts');
const kb = () => import('@/knowledgebase/slots.ts');
const KB = `/${PLUGIN}/knowledgebase`;
const forms = () => import('@/forms/slots.ts');
const surveys = () => import('@/surveys/slots.ts');

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
      detailPath: (id) => `/${PLUGIN}/settings/channels/${encodeURIComponent(id)}`,
      ...slots(() => import('@/channels/slots.ts')),
    },
    {
      contentType: RESPONSE_TEMPLATE_TYPE,
      title: 'Response template',
      icon: IconMessageReply,
      detailPath: (id) => `/${PLUGIN}/settings/response-templates/${encodeURIComponent(id)}`,
      ...slots(() => import('@/responseTemplates/slots.ts')),
    },
    {
      contentType: PIPELINE_TYPE,
      title: 'Pipeline',
      icon: IconGitBranch,
      detailPath: (id) => `/${PLUGIN}/settings/pipelines/${encodeURIComponent(id)}`,
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
      detailPath: (id) => `${KB}/${encodeURIComponent(id)}`,
      ...slots(async () => (await kb()).Topic),
    },
    {
      contentType: KB_CATEGORY_TYPE,
      title: 'Category',
      icon: IconFolder,
      detailPath: (id) => `${KB}/category/${encodeURIComponent(id)}`,
      ...slots(async () => (await kb()).Category),
    },
    {
      contentType: KB_ARTICLE_TYPE,
      title: 'Article',
      icon: IconArticle,
      detailPath: (id) => `${KB}/article/${encodeURIComponent(id)}`,
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
      detailPath: (id) => `/${PLUGIN}/tickets/${encodeURIComponent(id)}`,
      ...slots(ticket),
      contacts: (id) => ({
        queryKey: [PLUGIN, 'ticket-contacts', id],
        queryFn: async () => (await ticket()).ticketContacts(id),
      }),
      // The manifest's timeline (`api/src/core.ts`): core's Activity tab shows its events.
      activity: `${PLUGIN}.ticket`,
    },
    {
      contentType: HELP_CENTER_TYPE,
      title: 'Help center',
      icon: IconHelpCircle,
      detailPath: (id) => `/${PLUGIN}/settings/help-centers/${encodeURIComponent(id)}`,
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
      detailPath: (id) => `/${PLUGIN}/forms/${encodeURIComponent(id)}`,
      ...slots(async () => (await forms()).FormSlots),
      activity: `${PLUGIN}.form`,
    },
    {
      contentType: FORM_SUBMISSION_TYPE,
      title: 'Submission',
      icon: IconSend,
      detailPath: (id) => `/${PLUGIN}/forms/submission/${encodeURIComponent(id)}`,
      ...readSlots(async () => (await forms()).SubmissionSlots),
    },
    {
      contentType: SURVEY_TYPE,
      title: 'Survey',
      icon: IconChecklist,
      detailPath: (id) => `/${PLUGIN}/surveys/${encodeURIComponent(id)}`,
      ...slots(async () => (await surveys()).SurveySlots),
      tabs: [
        {
          value: 'questions',
          label: 'Questions',
          icon: IconChecklist,
          component: lazy(async () => ({ default: (await surveys()).SurveyQuestions })),
        },
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
      detailPath: (id) => `/${PLUGIN}/inbox/integrations/${encodeURIComponent(id)}`,
      ...slots(() => import('@/inbox/slots.ts')),
    },
    {
      contentType: META_BOT_TYPE,
      title: 'Bot',
      icon: IconRobot,
      detailPath: (id) => `/${PLUGIN}/settings/meta/bots/${encodeURIComponent(id)}`,
      ...slots(() => import('@/integrations/botSlots.ts')),
    },
    {
      contentType: ACCOUNT_TYPE,
      title: 'Account',
      icon: IconPlugConnected,
      detailPath: (id) => `/${PLUGIN}/settings/integrations/${encodeURIComponent(id)}`,
      ...slots(() => import('@/integrations/accountSlots.ts')),
    },
    {
      contentType: CALL_TYPE,
      title: 'Call',
      icon: IconPhone,
      detailPath: (id) => `/${PLUGIN}/calls/history/${encodeURIComponent(id)}`,
      // A call comes from the PBX or CallPro, so it has no draft.
      ...readSlots(() => import('@/calls/slots.ts')),
    },
    {
      contentType: CONVERSATION_TYPE,
      // Its draft is a new mail, which starts one.
      title: 'Conversation',
      icon: IconMessages,
      detailPath: (id) => `/${PLUGIN}/inbox/conversations/${encodeURIComponent(id)}`,
      ...slots(() => import('@/inbox/conversationSlots.ts')),
    },
  ],
  relationTabs: [
    {
      name: 'tickets',
      title: 'Tickets',
      icon: IconTicket,
      hosts: ['core:customer', 'core:company'],
      component: lazy(async () => ({ default: (await ticket()).TicketRelations })),
    },
  ],
};
