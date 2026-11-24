import { AgentRun } from '@erxes/core-contract';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { core, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { readsWithCore, writesWithCore } from '#/orpc.ts';
import { conversationById } from './shared.ts';

/** The core agent of a conversation the member sees: its integration's, or BAD_REQUEST. */
const agentOf = async (member: PluginMember, id: string) => {
  const { agentId } = await withOrg(member.orgId, (tx) => conversationById(tx, member, id));

  if (!agentId)
    throw new ORPCError('BAD_REQUEST', { message: 'No agent answers this conversation' });

  return agentId;
};

/** Core answers 404 for a conversation its agent never ran in, such as before the agent changed. */
const neverRan = (error: unknown) => error instanceof ORPCError && error.status === 404;

const Input = z.object({ id: z.string() });

/**
 * The latest runs of the conversation's agent in it, newest first: what the customer wrote, the
 * answer, the model, the API calls and whether it handed off. Core reads them for the plugin.
 */
const agentRuns = readsWithCore(PERMISSIONS.inboxView, Input, async (member, { id }) => {
  const agentId = await agentOf(member, id);

  const runs = await core
    .forOrg(member.orgId)
    .agents.runs({ id: agentId, key: id })
    .then(({ data }) => data[0]?.runs ?? [])
    .catch((error: unknown) => {
      if (neverRan(error)) return [];

      throw error;
    });

  return { agentId, runs };
})
  // Core's client hands `at` over as the ISO string it sent, so it passes through as one.
  .output(
    z.object({ agentId: z.string(), runs: z.array(AgentRun.extend({ at: z.iso.datetime() })) }),
  )
  .handler(({ context: { fromCore } }) => fromCore);

/** Makes the conversation's agent forget it, so the customer's next message starts afresh. */
const restartAgent = writesWithCore(PERMISSIONS.inboxView, Input, async (member, { id }) => {
  const agentId = await agentOf(member, id);

  return core
    .forOrg(member.orgId)
    .agents.restart({ id: agentId, key: id })
    .catch((error: unknown) => {
      if (neverRan(error))
        throw new ORPCError('BAD_REQUEST', {
          message: 'The agent has not answered this conversation yet',
        });

      throw error;
    });
})
  .output(z.object({ ok: z.literal(true) }))
  .handler(({ context: { fromCore } }) => fromCore);

export const agentRunProcedures = { agentRuns, restartAgent };
