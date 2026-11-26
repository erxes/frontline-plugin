import {
  type Icon,
  IconAlertTriangle,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconTag,
  IconClock,
  IconHeartbeat,
  IconListNumbers,
  IconPhone,
  IconServer,
} from '@tabler/icons-react';
import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { PanelField, PanelSection, TextField, useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { useChange, useMinute } from '~/shared/hooks.ts';
import { ZonePicker } from './ConnectFields.tsx';
import { OperatorList, queuesOf, queueText } from './PbxLines.tsx';
import { QueueChannels } from './QueueChannels.tsx';
import type { Account } from './useIntegrations.ts';

/**
 * A PBX's own settings, which `saveSettings` takes again with each change; its address shows
 * only.
 */
const PbxConfig = z.object({
  host: z.string(),
  phone: z.string(),
  srcTrunk: z.string().default(''),
  dstTrunk: z.string().default(''),
  timeZone: z.string(),
});

type PbxConfig = z.infer<typeof PbxConfig>;

type Settings = InferClientOutputs<Client>['integrations']['call']['settings'];

type SaveInput = InferClientInputs<Client>['integrations']['call']['saveSettings'];

/**
 * A PBX's settings, queues and operators as `saveSettings` takes them, and `change`, which saves
 * them all with `patch` applied. Softphones read the extensions again after it.
 */
const usePbx = (account: Account, settings: Settings) => {
  const save = useMutation(
    orpc.integrations.call.saveSettings.mutationOptions(
      useChange(orpc.integrations.key(), orpc.calls.phone.key()),
    ),
  );

  const config = PbxConfig.safeParse(account.config);
  const queues = settings.queues.map(({ queue, name, channelId }) => ({ queue, name, channelId }));

  // A kept operator keeps its SIP password: the API only takes a new one.
  const operators: SaveInput['operators'] = settings.operators.map(({ userId, extension }) => ({
    userId,
    extension,
  }));

  const softphones = new Set(
    settings.operators.flatMap((operator) => (operator.hasSipPassword ? [operator.extension] : [])),
  );

  const change = (patch: Partial<Omit<SaveInput, 'accountId'>>) => {
    if (!config.success) return;

    const { host, ...stored } = config.data;

    save.mutate({
      accountId: account.id,
      name: account.name,
      ...stored,
      queues,
      operators,
      ...patch,
    });
  };

  return { name: account.name, config: config.data, queues, operators, softphones, change };
};

type Pbx = ReturnType<typeof usePbx>;

/** One text setting of the PBX, saved when its popover closes with a new value. */
const SettingRow = ({
  pbx,
  name,
  label,
  icon,
  placeholder,
}: {
  pbx: Pbx & { config: PbxConfig };
  name: Exclude<keyof PbxConfig, 'host' | 'timeZone'>;
  label: string;
  icon: Icon;
  placeholder?: string;
}) => (
  <PanelField icon={icon} label={label}>
    <TextField
      scope={`frontline-pbx.${name}`}
      value={pbx.config[name]}
      placeholder={placeholder ?? label}
      onSave={(value) => {
        const next = value.trim();

        if (next !== pbx.config[name] && (next || name !== 'phone')) pbx.change({ [name]: next });
      }}
    />
  </PanelField>
);

/**
 * The PBX's name, number, time zone, queues and trunks, each edited in place, and its WebSocket
 * server. The softphones' TURN key is the install's, `CF_TURN_KEY_ID`.
 */
const SystemSection = ({ pbx }: { pbx: Pbx & { config: PbxConfig } }) => {
  const { t } = useTranslation('frontline');
  const { config, change } = pbx;

  return (
    <PanelSection title={t('phone-system', 'Phone system')}>
      <PanelField icon={IconTag} label={t('name', 'Name')}>
        <TextField
          scope="frontline-pbx.name"
          value={pbx.name}
          placeholder={config.phone}
          onSave={(value) => value.trim() !== pbx.name && change({ name: value.trim() })}
        />
      </PanelField>
      <SettingRow
        pbx={pbx}
        name="phone"
        label={t('phone-number', 'Phone number')}
        icon={IconPhone}
      />
      {/* Connecting the PBX again moves it to another address, so its address shows only. */}
      <PanelField icon={IconServer} label={t('websocket-server', 'WebSocket server')} cell={false}>
        <span className="truncate px-2 text-xs">{config.host}</span>
      </PanelField>
      <PanelField icon={IconClock} label={t('time-zone', 'Time zone')} cell={false}>
        <ZonePicker value={config.timeZone} onValueChange={(timeZone) => change({ timeZone })} />
      </PanelField>
      <PanelField icon={IconListNumbers} label={t('queues', 'Queues')}>
        <TextField
          scope="frontline-pbx.queues"
          value={queueText(pbx.queues)}
          placeholder="6500, 6501"
          onSave={(value) => {
            const next = queuesOf(value, pbx.queues);

            if (queueText(next) !== queueText(pbx.queues)) change({ queues: next });
          }}
        />
      </PanelField>
      <SettingRow
        pbx={pbx}
        name="srcTrunk"
        label={t('source-trunk', 'Source trunk')}
        icon={IconArrowDownLeft}
      />
      <SettingRow
        pbx={pbx}
        name="dstTrunk"
        label={t('destination-trunk', 'Destination trunk')}
        icon={IconArrowUpRight}
      />
    </PanelSection>
  );
};

/** How long a PBX with queues may send no queue stats or live board before the panel warns. */
const FEED_QUIET_MS = 10 * 60_000;

/**
 * When the PBX last sent each followed queue's stats and live board, and a warning once it has
 * sent neither for any queue in 10 minutes.
 */
const QueueFeed = ({ queues }: { queues: Settings['queues'] }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const now = useMinute();

  if (queues.length === 0) return null;

  const lastHeard = Math.max(
    0,
    ...queues.flatMap((queue) => [queue.statsAt, queue.liveAt]).map((at) => at?.getTime() ?? 0),
  );

  const when = (at: Date | null) => (at ? format.relative(at, now) : t('queue-never', 'never'));

  return (
    <PanelSection title={t('queue-feed', 'Queue feed')} icon={IconHeartbeat}>
      {now - lastHeard > FEED_QUIET_MS && (
        <p role="alert" className="flex items-center gap-2 px-2 py-1 text-xs text-destructive-text">
          <IconAlertTriangle className="size-4 shrink-0" />
          {t('queue-feed-quiet', 'No queue stats or live board from this PBX for 10 minutes')}
        </p>
      )}
      <ul aria-label={t('queue-feed', 'Queue feed')}>
        {queues.map((queue) => (
          <li key={queue.id} className="flex items-center gap-2 px-2 py-1 text-xs">
            <span className="flex-1 truncate">
              {queue.queue}
              {queue.name && <span className="ml-2 text-muted-foreground">{queue.name}</span>}
            </span>
            <span className="text-muted-foreground">
              {t('queue-heard', 'Stats {{stats}}, live board {{live}}', {
                stats: when(queue.statsAt),
                live: when(queue.liveAt),
              })}
            </span>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
};

/** A Grandstream PBX's settings, with the queues frontline follows, and the members who answer it. */
export const PbxSettings = ({ account, settings }: { account: Account; settings: Settings }) => {
  const pbx = usePbx(account, settings);
  const { config } = pbx;

  return (
    <>
      {config && <SystemSection pbx={{ ...pbx, config }} />}
      <QueueChannels queues={pbx.queues} onChange={(queues) => pbx.change({ queues })} />
      <QueueFeed queues={settings.queues} />
      <OperatorList
        operators={pbx.operators}
        softphones={pbx.softphones}
        onChange={(operators) => pbx.change({ operators })}
      />
    </>
  );
};
