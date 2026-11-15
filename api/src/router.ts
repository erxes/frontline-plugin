import type { RouterClient } from '@orpc/server';
import { channelProcedures } from '#/modules/channels/channels.ts';
import { memberProcedures } from '#/modules/channels/members.ts';
import { articleProcedures } from '#/modules/knowledgebase/articles.ts';
import { categoryProcedures } from '#/modules/knowledgebase/categories.ts';
import { topicProcedures } from '#/modules/knowledgebase/topics.ts';
import { pipelineProcedures } from '#/modules/pipelines/pipelines.ts';
import { statusProcedures } from '#/modules/pipelines/statuses.ts';
import { responseTemplateProcedures } from '#/modules/responseTemplates/responseTemplates.ts';
import { settingsProcedures } from '#/modules/settings/settings.ts';
import { tagProcedures } from '#/modules/tags/tags.ts';
import { teamProcedures } from '#/modules/teams/teams.ts';
import { changeProcedures } from '#/modules/tickets/changes.ts';
import { propertyProcedures } from '#/modules/tickets/properties.ts';
import { ticketProcedures } from '#/modules/tickets/tickets.ts';

/** Every procedure, served at `/api/rpc/<group>/<name>`. */
export const router = {
  channels: { ...channelProcedures, ...memberProcedures },
  responseTemplates: responseTemplateProcedures,
  pipelines: { ...pipelineProcedures, statuses: statusProcedures },
  tickets: { ...ticketProcedures, ...changeProcedures, properties: propertyProcedures },
  settings: settingsProcedures,
  tags: tagProcedures,
  teams: teamProcedures,
  knowledgebase: {
    topics: topicProcedures,
    categories: categoryProcedures,
    articles: articleProcedures,
  },
};

/** The typed client the UI builds (`ui/src/orpc.ts`). */
export type Client = RouterClient<typeof router>;
