import type { RouterClient } from '@orpc/server';
import { channelProcedures } from '#/modules/channels/channels.ts';
import { memberProcedures } from '#/modules/channels/members.ts';
import { articleProcedures } from '#/modules/knowledgebase/articles.ts';
import { categoryProcedures } from '#/modules/knowledgebase/categories.ts';
import { topicProcedures } from '#/modules/knowledgebase/topics.ts';
import { responseTemplateProcedures } from '#/modules/responseTemplates/responseTemplates.ts';

/** Every procedure, served at `/api/rpc/<group>/<name>`. */
export const router = {
  channels: { ...channelProcedures, ...memberProcedures },
  responseTemplates: responseTemplateProcedures,
  knowledgebase: {
    topics: topicProcedures,
    categories: categoryProcedures,
    articles: articleProcedures,
  },
};

/** The typed client the UI builds (`ui/src/orpc.ts`). */
export type Client = RouterClient<typeof router>;
