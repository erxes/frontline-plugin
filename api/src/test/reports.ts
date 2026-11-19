import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { clientAs } from '#/test/member.ts';

/** 1 to 3 March 2026 in Ulaanbaatar, UTC+8: 1 March is a Sunday. */
export const PERIOD = {
  from: new Date('2026-03-01T00:00:00+08:00'),
  to: new Date('2026-03-04T00:00:00+08:00'),
  timeZone: 'Asia/Ulaanbaatar',
};

export const at = (iso: string) => new Date(iso);

export const seconds = (date: Date, add: number) => new Date(date.getTime() + add * 1000);

/** A call `teammate` answered `wait` seconds after it rang and talked for `durationSec`. */
export const answeredBy = (startedAt: Date, wait: number, durationSec: number) => ({
  answeredAt: seconds(startedAt, wait),
  durationSec,
  answeredBy: 'teammate',
});

/**
 * An owner, a channel with `teammate` in it and another without, each with a messenger.
 * `teammate` may read the inbox, tickets and calls but manages no channel.
 */
export const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);

  const teammate = clientAs(
    orgId,
    [PERMISSIONS.channelView, PERMISSIONS.inboxView, PERMISSIONS.callView],
    'teammate',
  );

  const ours = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });
  const other = await owner.channels.create({ name: 'Sales' });

  const messenger = async (channelId: string) =>
    owner.integrations.create({ channelId, kind: 'messenger', name: 'Website', config: {} });

  return {
    owner,
    teammate,
    ours,
    other,
    inOurs: await messenger(ours.id),
    inOther: await messenger(other.id),
  };
};

type Seeded = Awaited<ReturnType<typeof setUp>>;

/** A conversation in the channel of `integration`, started at `createdAt`. */
export const conversation = (
  orgId: string,
  integration: Seeded['inOurs'],
  values: Partial<typeof conversations.$inferInsert> & { createdAt: Date },
) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(conversations)
      .values({
        orgId,
        channelId: integration.channelId,
        integrationId: integration.id,
        customerId: 'customer-1',
        ...values,
      })
      .returning({ id: conversations.id });

    return row?.id ?? '';
  });
