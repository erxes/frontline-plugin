import type { PluginJobDelivery } from '@erxes/core-contract';
import { JOBS } from '#/core.ts';
import { checkDomains } from '#/modules/helpcenter/domains.ts';
import { sendReply } from '#/modules/inbox/send.ts';
import { publishScheduled } from '#/modules/knowledgebase/articles.ts';
import { checkAccounts, syncMail } from '#/modules/integrations/jobs.ts';
import { copyRecording } from '#/modules/integrations/providers/call/recording.ts';
import { keepDiscordGateways } from '#/modules/integrations/providers/discordGateway.ts';
import { copyMetaFiles } from '#/modules/integrations/providers/metaFiles.ts';
import { importMeta } from '#/modules/integrations/providers/metaImport.ts';
import { syncUnits } from '#/modules/teams/sync.ts';
import { checkSla } from '#/modules/tickets/sla.ts';

/** What each job in the manifest's `jobs` does when core runs it at `/api/jobs/<name>`. */
export const JOB_RUNS: Record<string, (job: PluginJobDelivery) => Promise<unknown>> = {
  [JOBS.sla.name]: (job) => checkSla(job.orgId),
  [JOBS.domains.name]: (job) => checkDomains(job.orgId),
  [JOBS.kbPublish.name]: (job) => publishScheduled(job.orgId),
  [JOBS.send.name]: sendReply,
  [JOBS.mailSync.name]: syncMail,
  [JOBS.check.name]: checkAccounts,
  [JOBS.discordGateway.name]: keepDiscordGateways,
  [JOBS.recording.name]: copyRecording,
  [JOBS.metaFiles.name]: copyMetaFiles,
  [JOBS.metaImport.name]: importMeta,
  [JOBS.units.name]: (job) => syncUnits(job.orgId),
};
