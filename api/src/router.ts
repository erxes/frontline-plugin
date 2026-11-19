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
import { callReport } from '#/modules/reports/calls.ts';
import { conversationReport } from '#/modules/reports/conversations.ts';
import { metaReport } from '#/modules/reports/meta.ts';
import { ticketReport } from '#/modules/reports/tickets.ts';
import { responseTemplateProcedures } from '#/modules/responseTemplates/responseTemplates.ts';
import { conversationProcedures } from '#/modules/inbox/conversations.ts';
import { countProcedures } from '#/modules/inbox/counts.ts';
import { integrationProcedures } from '#/modules/inbox/integrations.ts';
import { accountProcedures } from '#/modules/integrations/accounts.ts';
import { discordProcedures } from '#/modules/integrations/providers/discord.ts';
import { mailProcedures } from '#/modules/integrations/providers/mailConnect.ts';
import { metaAppProcedures } from '#/modules/integrations/providers/metaApp.ts';
import { metaBotProcedures } from '#/modules/integrations/providers/metaBots.ts';
import { metaProcedures } from '#/modules/integrations/providers/metaLogin.ts';
import { metaPostProcedures } from '#/modules/integrations/providers/metaPosts.ts';
import { telegramProcedures } from '#/modules/integrations/providers/telegram.ts';
import { callListProcedures } from '#/modules/calls/calls.ts';
import { phoneProcedures } from '#/modules/calls/phone.ts';
import { agentProcedures, queueProcedures } from '#/modules/calls/queues.ts';
import {
  callProcedures,
  callProProcedures,
} from '#/modules/integrations/providers/call/connect.ts';
import { linkPreviewProcedures } from '#/modules/inbox/linkPreviews.ts';
import { messageProcedures } from '#/modules/inbox/messages.ts';
import { operatorProcedures } from '#/modules/inbox/operator.ts';
import { presenceProcedures } from '#/modules/inbox/presence.ts';
import { conversationPropertyProcedures } from '#/modules/inbox/properties.ts';
import { reactionProcedures } from '#/modules/inbox/reactions.ts';
import { messengerProcedures } from '#/modules/messenger/settings.ts';
import { settingsProcedures } from '#/modules/settings/settings.ts';
import { surveySendProcedures } from '#/modules/surveys/send.ts';
import { surveyStatusProcedures } from '#/modules/surveys/status.ts';
import { surveyProcedures } from '#/modules/surveys/surveys.ts';
import { tagProcedures } from '#/modules/tags/tags.ts';
import { teamProcedures } from '#/modules/teams/teams.ts';
import { changeProcedures } from '#/modules/tickets/changes.ts';
import { commentProcedures } from '#/modules/tickets/comments.ts';
import { followProcedures } from '#/modules/tickets/follow.ts';
import { propertyProcedures } from '#/modules/tickets/properties.ts';
import { responseProcedures } from '#/modules/tickets/responses.ts';
import { ticketProcedures } from '#/modules/tickets/tickets.ts';

/** Every procedure, served at `/api/rpc/<group>/<name>`. */
export const router = {
  channels: { ...channelProcedures, ...memberProcedures },
  responseTemplates: responseTemplateProcedures,
  pipelines: { ...pipelineProcedures, statuses: statusProcedures },
  tickets: {
    ...ticketProcedures,
    ...changeProcedures,
    ...followProcedures,
    ...commentProcedures,
    ...responseProcedures,
    properties: propertyProcedures,
  },
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
  surveys: { ...surveyProcedures, ...surveyStatusProcedures, ...surveySendProcedures },
  integrations: {
    ...integrationProcedures,
    messenger: messengerProcedures,
    accounts: accountProcedures,
    meta: {
      ...metaProcedures,
      app: metaAppProcedures,
      posts: metaPostProcedures,
      bots: metaBotProcedures,
    },
    telegram: telegramProcedures,
    discord: discordProcedures,
    mail: mailProcedures,
    call: callProcedures,
    callpro: callProProcedures,
  },
  calls: {
    ...callListProcedures,
    queues: queueProcedures,
    agents: agentProcedures,
    phone: phoneProcedures,
  },
  conversations: {
    ...conversationProcedures,
    ...countProcedures,
    ...operatorProcedures,
    ...presenceProcedures,
    ...conversationPropertyProcedures,
    messages: { ...messageProcedures, ...reactionProcedures, ...linkPreviewProcedures },
  },
  knowledgebase: {
    topics: topicProcedures,
    categories: categoryProcedures,
    articles: articleProcedures,
  },
  reports: {
    tickets: ticketReport,
    conversations: conversationReport,
    calls: callReport,
    meta: metaReport,
  },
};

/** The typed client the UI builds (`ui/src/orpc.ts`). */
export type Client = RouterClient<typeof router>;
