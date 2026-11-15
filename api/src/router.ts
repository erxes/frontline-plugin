import type { RouterClient } from '@orpc/server';
import { channelProcedures } from '#/modules/channels/channels.ts';
import { memberProcedures } from '#/modules/channels/members.ts';
import { formActionProcedures } from '#/modules/forms/actions.ts';
import { embedProcedures } from '#/modules/forms/embed.ts';
import { fieldProcedures } from '#/modules/forms/fields.ts';
import { formProcedures } from '#/modules/forms/forms.ts';
import { submissionProcedures } from '#/modules/forms/submissions.ts';
import { helpCenterProcedures } from '#/modules/helpcenter/helpCenters.ts';
import { articleProcedures } from '#/modules/knowledgebase/articles.ts';
import { categoryProcedures } from '#/modules/knowledgebase/categories.ts';
import { topicProcedures } from '#/modules/knowledgebase/topics.ts';
import { pipelineProcedures } from '#/modules/pipelines/pipelines.ts';
import { statusProcedures } from '#/modules/pipelines/statuses.ts';
import { responseTemplateProcedures } from '#/modules/responseTemplates/responseTemplates.ts';
import { conversationProcedures } from '#/modules/inbox/conversations.ts';
import { integrationProcedures } from '#/modules/inbox/integrations.ts';
import { accountProcedures } from '#/modules/integrations/accounts.ts';
import { discordProcedures } from '#/modules/integrations/providers/discord.ts';
import { mailProcedures } from '#/modules/integrations/providers/mailConnect.ts';
import { metaBotProcedures } from '#/modules/integrations/providers/metaBots.ts';
import { metaProcedures } from '#/modules/integrations/providers/metaLogin.ts';
import { metaPostProcedures } from '#/modules/integrations/providers/metaPosts.ts';
import { telegramProcedures } from '#/modules/integrations/providers/telegram.ts';
import { callListProcedures } from '#/modules/calls/calls.ts';
import { agentProcedures, queueProcedures } from '#/modules/calls/queues.ts';
import {
  callProcedures,
  callProProcedures,
} from '#/modules/integrations/providers/call/connect.ts';
import { messageProcedures } from '#/modules/inbox/messages.ts';
import { operatorProcedures } from '#/modules/inbox/operator.ts';
import { presenceProcedures } from '#/modules/inbox/presence.ts';
import { messengerProcedures } from '#/modules/messenger/settings.ts';
import { settingsProcedures } from '#/modules/settings/settings.ts';
import { surveyStatusProcedures } from '#/modules/surveys/status.ts';
import { surveyProcedures } from '#/modules/surveys/surveys.ts';
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
  helpCenters: helpCenterProcedures,
  forms: {
    ...formProcedures,
    ...formActionProcedures,
    ...embedProcedures,
    fields: fieldProcedures,
    submissions: submissionProcedures,
  },
  surveys: { ...surveyProcedures, ...surveyStatusProcedures },
  integrations: {
    ...integrationProcedures,
    messenger: messengerProcedures,
    accounts: accountProcedures,
    meta: { ...metaProcedures, posts: metaPostProcedures, bots: metaBotProcedures },
    telegram: telegramProcedures,
    discord: discordProcedures,
    mail: mailProcedures,
    call: callProcedures,
    callpro: callProProcedures,
  },
  calls: { ...callListProcedures, queues: queueProcedures, agents: agentProcedures },
  conversations: {
    ...conversationProcedures,
    ...operatorProcedures,
    ...presenceProcedures,
    messages: messageProcedures,
  },
  knowledgebase: {
    topics: topicProcedures,
    categories: categoryProcedures,
    articles: articleProcedures,
  },
};

/** The typed client the UI builds (`ui/src/orpc.ts`). */
export type Client = RouterClient<typeof router>;
