import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlertTriangle,
  IconCalendarCheck,
  IconCircles,
  IconDots,
  IconHeartbeat,
  IconKey,
  IconLink,
  IconListNumbers,
  IconPlugConnected,
  IconRefresh,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import {
  Button,
  PanelSection,
  Skeleton,
  Spinner,
  type TRecordSlotProps,
  useFormat,
  useMembersById,
  memberName,
  useOpenRecord,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { InfoRow } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { AddRow, ItemRow, StatusBadge } from './parts.tsx';
import {
  type Account,
  useAccount,
  useRepairAccount,
  useProviderNames,
  useRemoveAccount,
} from './useIntegrations.ts';

/** The panel header's title: the account's name. */
export const AccountTitle = ({ contentId }: TRecordSlotProps) => {
  const account = useAccount(contentId);

  if (account.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{account.data?.name ?? account.error?.message}</span>;
};

/** The header's menu: add the account to a channel, repair it, or disconnect it. */
export const AccountActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const account = useAccount(contentId).data;
  const repair = useRepairAccount();
  const remove = useRemoveAccount();

  if (!account) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('account-menu', 'Account actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'channel',
          icon: <IconCircles />,
          label: t('add-to-channel', 'Add to a channel'),
          onSelect: () =>
            openNew(INTEGRATION_TYPE, {
              kind: account.provider,
              accountId: account.id,
              name: account.name,
            }),
        },
        {
          value: 'repair',
          icon: <IconRefresh />,
          label: t('repair', 'Repair'),
          onSelect: () => repair.mutate({ id: account.id }),
        },
        {
          value: 'remove',
          icon: <IconTrash />,
          label: t('disconnect', 'Disconnect'),
          onSelect: () => void remove(account),
        },
      ]}
    />
  );
};

/** What Telegram last said about delivering the bot's updates here. */
const TelegramWebhook = ({ account }: { account: Account }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  const webhook = useQuery(
    orpc.integrations.telegram.webhookInfo.queryOptions({ input: { id: account.id } }),
  ).data;

  if (!webhook) return null;

  return (
    <PanelSection title={t('webhook', 'Webhook')}>
      <InfoRow icon={IconLink} label={t('address', 'Address')}>
        <span className="truncate">{webhook.url}</span>
      </InfoRow>
      <InfoRow icon={IconListNumbers} label={t('waiting-updates', 'Waiting updates')}>
        {webhook.pendingUpdateCount}
      </InfoRow>
      {webhook.lastErrorMessage && (
        <InfoRow icon={IconAlertTriangle} label={t('last-error', 'Last error')}>
          {webhook.lastErrorAt && format.dateTime(webhook.lastErrorAt)} {webhook.lastErrorMessage}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/** A PBX's own settings, which `saveSettings` takes again with each change. */
const PbxConfig = z.object({
  phone: z.string(),
  srcTrunk: z.string().default(''),
  dstTrunk: z.string().default(''),
  timeZone: z.string(),
  turnUrl: z.string().default(''),
  turnUsername: z.string().default(''),
  turnPassword: z.string().default(''),
});

type Settings = InferClientOutputs<Client>['integrations']['call']['settings'];

type OperatorInput =
  InferClientInputs<Client>['integrations']['call']['saveSettings']['operators'][number];

/**
 * A phone account's queues and operators as `saveSettings` takes them, and `change`, which saves
 * them with one list replaced.
 */
const usePbxLists = (account: Account, settings: Settings) => {
  const save = useMutation(
    orpc.integrations.call.saveSettings.mutationOptions(useIntegrationChange()),
  );

  const config = PbxConfig.safeParse(account.config);
  const queues = settings.queues.map(({ queue, name }) => ({ queue, name }));

  // A kept operator keeps its SIP password: the API only takes a new one.
  const operators: OperatorInput[] = settings.operators.map(({ userId, extension }) => ({
    userId,
    extension,
  }));

  const softphones = new Set(
    settings.operators.flatMap((operator) => (operator.hasSipPassword ? [operator.extension] : [])),
  );

  const change = (lists: Partial<{ queues: typeof queues; operators: typeof operators }>) => {
    if (config.success)
      save.mutate({ accountId: account.id, ...config.data, queues, operators, ...lists });
  };

  return { queues, operators, softphones, change };
};

type Lists = ReturnType<typeof usePbxLists>;

/** The PBX queues frontline follows, by number. */
const QueuesSection = ({ lists: { queues, change } }: { lists: Lists }) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelSection title={t('queues', 'Queues')} icon={IconListNumbers}>
      <ul aria-label={t('queues', 'Queues')}>
        {queues.map((queue) => (
          <ItemRow
            key={queue.queue}
            label={queue.queue}
            hint={queue.name}
            onRemove={() => change({ queues: queues.filter((each) => each.queue !== queue.queue) })}
          />
        ))}
      </ul>
      <AddRow
        fields={[
          { name: 'queue', label: t('queue-number', 'Queue number'), required: true },
          { name: 'name', label: t('name', 'Name') },
        ]}
        onAdd={({ queue = '', name = '' }) => change({ queues: [...queues, { queue, name }] })}
      />
    </PanelSection>
  );
};

/**
 * The members who answer the PBX, each by an extension; a member is picked before the extension.
 * An extension's SIP password gives its member the softphone on every page.
 */
const OperatorsSection = ({ lists: { operators, softphones, change } }: { lists: Lists }) => {
  const { t } = useTranslation('frontline');
  const [userId, setUserId] = useState<string | null>(null);

  const members = useMembersById(
    operators.map((operator) => operator.userId),
    memberQueries,
  );

  return (
    <PanelSection title={t('operators', 'Operators')} icon={IconUsers}>
      <ul aria-label={t('operators', 'Operators')}>
        {operators.map((operator) => {
          const member = members.get(operator.userId);

          return (
            <ItemRow
              key={operator.extension}
              label={operator.extension}
              hint={[
                member && memberName(member),
                softphones.has(operator.extension) && t('with-softphone', 'softphone'),
              ]
                .filter(Boolean)
                .join(', ')}
              onRemove={() =>
                change({
                  operators: operators.filter((each) => each.extension !== operator.extension),
                })
              }
            />
          );
        })}
      </ul>
      <div className="px-2 py-1">
        <MemberSelect
          value={userId}
          onValueChange={setUserId}
          placeholder={t('operator-member', 'Member who answers')}
          aria-label={t('operator-member', 'Member who answers')}
        />
      </div>
      {userId && (
        <AddRow
          fields={[
            { name: 'extension', label: t('extension', 'Extension'), required: true },
            { name: 'sipPassword', label: t('sip-password', 'SIP password'), type: 'password' },
          ]}
          onAdd={({ extension = '', sipPassword }) => {
            change({
              operators: [
                ...operators,
                { userId, extension, sipPassword: sipPassword || undefined },
              ],
            });
            setUserId(null);
          }}
        />
      )}
    </PanelSection>
  );
};

/** A Grandstream PBX's queues and operators. */
const PbxLists = ({ account, settings }: { account: Account; settings: Settings }) => {
  const lists = usePbxLists(account, settings);

  return (
    <>
      <QueuesSection lists={lists} />
      <OperatorsSection lists={lists} />
    </>
  );
};

/**
 * A phone account's webhook, where its bridge posts calls, and for a Grandstream PBX the queues
 * frontline follows and the members who answer it by extension.
 */
const PhoneSettings = ({ account }: { account: Account }) => {
  const { t } = useTranslation('frontline');

  const settings = useQuery(
    orpc.integrations.call.settings.queryOptions({ input: { accountId: account.id } }),
  ).data;

  if (!settings) return <Spinner area="lg" />;

  return (
    <>
      <PanelSection title={t('webhook', 'Webhook')}>
        <InfoRow icon={IconLink} label={t('address', 'Address')}>
          <span className="truncate">{settings.webhookUrl}</span>
        </InfoRow>
        {settings.webhookSecret && (
          <InfoRow icon={IconKey} label={t('secret', 'Secret')}>
            <span className="truncate font-mono">{settings.webhookSecret}</span>
          </InfoRow>
        )}
      </PanelSection>
      {account.provider === 'call' && <PbxLists account={account} settings={settings} />}
    </>
  );
};

/** The Detail tab: the account's provider and health, then what its provider adds. */
export const AccountDetail = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const names = useProviderNames();
  const account = useAccount(contentId);

  if (account.isPending) return <Spinner area="lg" />;

  if (!account.data)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {account.error?.message ?? t('no-such-account', 'No such account')}
      </p>
    );

  const { data } = account;

  return (
    <div key={data.id}>
      <PanelSection title={t('account', 'Account')}>
        <InfoRow icon={IconPlugConnected} label={t('type', 'Type')}>
          {names[data.provider]}
        </InfoRow>
        <InfoRow icon={IconHeartbeat} label={t('status', 'Status')}>
          <StatusBadge status={data.status} />
          {data.error}
        </InfoRow>
        <InfoRow icon={IconCalendarCheck} label={t('checked-at', 'Checked at')}>
          {data.checkedAt ? format.dateTime(data.checkedAt) : t('never', 'Never')}
        </InfoRow>
      </PanelSection>
      {data.provider === 'telegram' && <TelegramWebhook account={data} />}
      {(data.provider === 'call' || data.provider === 'callpro') && (
        <PhoneSettings account={data} />
      )}
    </div>
  );
};
