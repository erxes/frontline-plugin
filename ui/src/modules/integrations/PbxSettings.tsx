import { memberQueries } from '@erxes/core-contract/client';
import {
  type Icon,
  IconClock,
  IconListNumbers,
  IconLock,
  IconPhone,
  IconServer,
  IconUser,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { Button, PanelField, PanelSection, TextField, useMembersById, memberName } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { ZonePicker } from './ConnectFields.tsx';
import { AddRow, ItemRow } from './parts.tsx';
import type { Account } from './useIntegrations.ts';

/**
 * A PBX's own settings, which `saveSettings` takes again with each change, and whether a TURN
 * password is saved: the API keeps it sealed and never sends it back.
 */
const PbxConfig = z.object({
  phone: z.string(),
  timeZone: z.string(),
  turnUrl: z.string().default(''),
  turnUsername: z.string().default(''),
  hasTurnPassword: z.boolean().default(false),
});

type PbxConfig = z.infer<typeof PbxConfig>;

type Settings = InferClientOutputs<Client>['integrations']['call']['settings'];

type SaveInput = InferClientInputs<Client>['integrations']['call']['saveSettings'];

/**
 * A PBX's settings, queues and operators as `saveSettings` takes them, and `change`, which saves
 * them all with `patch` applied. Softphones read the TURN server and extensions again after it.
 */
const usePbx = (account: Account, settings: Settings) => {
  const save = useMutation(
    orpc.integrations.call.saveSettings.mutationOptions(
      useChange(orpc.integrations.key(), orpc.calls.phone.key()),
    ),
  );

  const config = PbxConfig.safeParse(account.config);
  const queues = settings.queues.map(({ queue, name }) => ({ queue, name }));

  // A kept operator keeps its SIP password: the API only takes a new one.
  const operators: SaveInput['operators'] = settings.operators.map(({ userId, extension }) => ({
    userId,
    extension,
  }));

  const softphones = new Set(
    settings.operators.flatMap((operator) => (operator.hasSipPassword ? [operator.extension] : [])),
  );

  // Left out, the TURN password stays as saved; `turnPassword` in `patch` replaces or clears it.
  const change = (patch: Partial<Omit<SaveInput, 'accountId'>>) => {
    if (!config.success) return;

    const { hasTurnPassword, ...stored } = config.data;

    save.mutate({ accountId: account.id, ...stored, queues, operators, ...patch });
  };

  return { config: config.data, queues, operators, softphones, change };
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
  name: Exclude<keyof PbxConfig, 'timeZone' | 'hasTurnPassword'>;
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
 * The PBX's number, time zone and the TURN server its softphones relay through, each edited in
 * place. The TURN password shows only that it is set; a new one replaces it, and Clear drops it.
 */
const SystemSection = ({ pbx }: { pbx: Pbx & { config: PbxConfig } }) => {
  const { t } = useTranslation('frontline');
  const { config, change } = pbx;

  return (
    <PanelSection title={t('phone-system', 'Phone system')}>
      <SettingRow pbx={pbx} name="phone" label={t('phone', 'Phone')} icon={IconPhone} />
      <PanelField icon={IconClock} label={t('time-zone', 'Time zone')} cell={false}>
        <ZonePicker value={config.timeZone} onValueChange={(timeZone) => change({ timeZone })} />
      </PanelField>
      <SettingRow
        pbx={pbx}
        name="turnUrl"
        label={t('turn-server', 'TURN server')}
        icon={IconServer}
        placeholder="turn:turn.example.com:3478"
      />
      <SettingRow
        pbx={pbx}
        name="turnUsername"
        label={t('turn-user', 'TURN user')}
        icon={IconUser}
      />
      <PanelField icon={IconLock} label={t('turn-password', 'TURN password')}>
        <div className="flex items-center gap-1">
          <TextField
            scope="frontline-pbx.turnPassword"
            value=""
            placeholder={
              config.hasTurnPassword
                ? t('turn-password-saved', 'Saved; type a new one to replace it')
                : t('turn-password', 'TURN password')
            }
            onSave={(turnPassword) => turnPassword && change({ turnPassword })}
          />
          {config.hasTurnPassword && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('clear-turn-password', 'Clear TURN password')}
              onClick={() => change({ turnPassword: null })}
            >
              <IconX />
            </Button>
          )}
        </div>
      </PanelField>
    </PanelSection>
  );
};

/** The PBX queues frontline follows, by number. */
const QueuesSection = ({ pbx: { queues, change } }: { pbx: Pbx }) => {
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
const OperatorsSection = ({ pbx: { operators, softphones, change } }: { pbx: Pbx }) => {
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

/** A Grandstream PBX's settings, the queues frontline follows and the members who answer it. */
export const PbxSettings = ({ account, settings }: { account: Account; settings: Settings }) => {
  const pbx = usePbx(account, settings);
  const { config } = pbx;

  return (
    <>
      {config && <SystemSection pbx={{ ...pbx, config }} />}
      <QueuesSection pbx={pbx} />
      <OperatorsSection pbx={pbx} />
    </>
  );
};
