import type { PluginMember } from '@erxes/plugin-sdk';
import { type Column, sql } from 'drizzle-orm';
import { pipelines, pipelineStatuses, tickets } from '#/db/tickets.ts';
import { canChangeSql } from '../channels/access.ts';
import { teamsOf } from '../teams/teams.ts';

/**
 * Whether `member` sees the pipeline `id` points to: it is public, or private and lists them.
 * Callers let the channel's admins see it anyway.
 */
const pipelineOpenTo = (member: PluginMember, id: Column) =>
  sql<boolean>`exists (
    select 1 from ${pipelines}
    where ${pipelines.id} = ${id}
      and (${pipelines.visibility} = 'public' or ${member.userId} = any(${pipelines.memberIds}))
  )`;

/**
 * Whether `member` sees the pipeline: a private one shows to its `memberIds` and the channel's
 * admins. The query joins the member's `membership` row of its channel.
 */
export const pipelineSeen = (member: PluginMember) =>
  sql<boolean>`(${canChangeSql(member)} or ${pipelines.visibility} = 'public' or ${member.userId} = any(${pipelines.memberIds}))`;

/**
 * What `member` may do with tickets in a status, by its lists: a status shows where its pipeline
 * shows (`pipelineSeen`), and a private one to its `memberIds`; a non-empty `canEditMemberIds` or
 * `canMoveMemberIds` keeps editing or moving its tickets to those members. The channel's admins
 * may do all three. The query joins the status and the member's `membership` row of its channel.
 */
export const statusRights = (member: PluginMember) => {
  const admin = canChangeSql(member);

  const listed = (ids: Column) =>
    sql<boolean>`(${admin} or cardinality(${ids}) = 0 or ${member.userId} = any(${ids}))`;

  return {
    canSee: sql<boolean>`(${admin} or (
      (${pipelineStatuses.visibilityType} = 'public' or ${member.userId} = any(${pipelineStatuses.memberIds}))
      and ${pipelineOpenTo(member, pipelineStatuses.pipelineId)}
    ))`,
    canEdit: listed(pipelineStatuses.canEditMemberIds),
    canMove: listed(pipelineStatuses.canMoveMemberIds),
  };
};

/**
 * Whether `member` sees the ticket under its status's and pipeline's rules: neither is private
 * to others, and where the pipeline checks people, the ticket is theirs (created,
 * assigned), one they follow or nobody holds (`isCheckUser`), or their departments' or
 * branches' (`isCheckDepartment`, `isCheckBranch`), and with `isCheckDate` it was created today
 * by UTC. The channel's admins and `excludeCheckUserIds` see every ticket; the
 * query joins the member's `membership` row of the ticket's channel.
 */
export const ticketVisible = (member: PluginMember) => {
  const user = member.userId;

  return sql<boolean>`(${canChangeSql(member)} or (
    not exists (
      select 1 from ${pipelineStatuses}
      where ${pipelineStatuses.id} = ${tickets.statusId}
        and ${pipelineStatuses.visibilityType} = 'private'
        and not ${user} = any(${pipelineStatuses.memberIds})
    )
    and exists (
      select 1 from ${pipelines}
      where ${pipelines.id} = ${tickets.pipelineId}
      and (${pipelines.visibility} = 'public' or ${user} = any(${pipelines.memberIds}))
      and (
        not (${pipelines.isCheckUser} or ${pipelines.isCheckDepartment} or ${pipelines.isCheckBranch})
        or ${user} = any(${pipelines.excludeCheckUserIds})
        or ${tickets.createdBy} = ${user}
        or ${tickets.assigneeId} = ${user}
        or ${user} = any(${tickets.assignedMemberIds})
        or (${pipelines.isCheckUser} and (
          ${user} = any(${tickets.subscribedUserIds})
          or (${tickets.assigneeId} is null and cardinality(${tickets.subscribedUserIds}) = 0)
        ))
        or (${pipelines.isCheckDepartment} and ${tickets.departmentId} in ${teamsOf(user)})
        or (${pipelines.isCheckBranch} and ${tickets.branchId} in ${teamsOf(user)})
      ) and (
        not ${pipelines.isCheckDate}
        or ${user} = any(${pipelines.excludeCheckUserIds})
        or ${tickets.createdAt} >= date_trunc('day', now(), 'UTC')
      )
    )
  ))`;
};
