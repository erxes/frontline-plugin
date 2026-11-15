import type { PluginJobDelivery } from '@erxes/core-contract';
import { JOBS } from '#/core.ts';
import { checkDomains } from '#/modules/helpcenter/domains.ts';
import { sendReply } from '#/modules/inbox/send.ts';
import { checkSla } from '#/modules/tickets/sla.ts';

/** What each job in the manifest's `jobs` does when core runs it at `/api/jobs/<name>`. */
export const JOB_RUNS: Record<string, (job: PluginJobDelivery) => Promise<unknown>> = {
  [JOBS.sla.name]: (job) => checkSla(job.orgId),
  [JOBS.domains.name]: (job) => checkDomains(job.orgId),
  [JOBS.send.name]: sendReply,
};
