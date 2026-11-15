import {
  IconArticle,
  IconBook,
  IconBox,
  IconCircleDot,
  IconCircles,
  IconClockHour4,
  IconFolder,
  IconGitBranch,
  IconMessageReply,
} from '@tabler/icons-react';
import type { IUIConfig, TRecordDraftProps, TRecordSlotProps } from 'erxes-ui';
import { type ComponentType, lazy } from 'react';
import {
  CHANNEL_TYPE,
  KB_ARTICLE_TYPE,
  KB_CATEGORY_TYPE,
  KB_TOPIC_TYPE,
  PIPELINE_TYPE,
  PLUGIN,
  RESPONSE_TEMPLATE_TYPE,
} from '~/plugin.ts';

// web loads this module on every page, so it imports only icons and names. Each record type's
// slots come from one `slots.ts` that loads when the first of them shows: every import here
// costs `./config` bytes.
type Slot = ComponentType<TRecordSlotProps>;

type Slots = { Title: Slot; Actions: Slot; Detail: Slot; New: ComponentType<TRecordDraftProps> };

const slots = (load: () => Promise<Slots>) => ({
  Title: lazy(async () => ({ default: (await load()).Title })),
  Actions: lazy(async () => ({ default: (await load()).Actions })),
  Detail: lazy(async () => ({ default: (await load()).Detail })),
  New: lazy(async () => ({ default: (await load()).New })),
});

const pipeline = () => import('@/pipelines/slots.ts');
const kb = () => import('@/knowledgebase/slots.ts');
const KB = `/${PLUGIN}/knowledgebase`;

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
  ],
};
