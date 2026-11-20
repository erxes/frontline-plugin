import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { channels } from '#/db/schema.ts';

export const INTEGRATION_RECORDS = {
  facebook_page: { kind: 'facebook', label: 'Page' },
  instagram_account: { kind: 'instagram', label: 'Account' },
  telegram_bot: { kind: 'telegram', label: 'Bot' },
  discord_bot: { kind: 'discord', label: 'Bot' },
  mailbox: { kind: 'mail', label: 'Mailbox' },
  messenger: { kind: 'messenger', label: 'Messenger' },
  integration: { kind: null, label: 'Integration' },
} as const;

export type IntegrationRecord = keyof typeof INTEGRATION_RECORDS;

const isIntegrationRecord = (type: string): type is IntegrationRecord =>
  Object.hasOwn(INTEGRATION_RECORDS, type);

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const integrationChoices = async (member: PluginMember, type: string) => {
  if (!isIntegrationRecord(type)) return null;

  if (!member.can(PERMISSIONS.channelView))
    throw new ORPCError('FORBIDDEN', {
      message: `You need the ${PERMISSIONS.channelView} permission`,
    });

  const { kind } = INTEGRATION_RECORDS[type];

  const rows = await withOrg(member.orgId, (tx) =>
    tx
      .select({
        value: integrations.id,
        name: integrations.name,
        kind: integrations.kind,
        channel: channels.name,
      })
      .from(integrations)
      .innerJoin(channels, eq(channels.id, integrations.channelId))
      .where(kind ? eq(integrations.kind, kind) : undefined)
      .orderBy(asc(integrations.name), asc(channels.name)),
  );

  return rows.map((row) => ({
    value: row.value,
    label: kind
      ? `${row.name} · ${row.channel}`
      : `${capitalized(row.kind)} · ${row.name} · ${row.channel}`,
  }));
};
