import {
  IconClock,
  IconKey,
  IconLock,
  IconPhone,
  IconPlug,
  IconServer,
  IconUser,
} from '@tabler/icons-react';
import { PanelFormRow, localTimeZone, zoneOffset } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickerField } from '~/shared/Pickers.tsx';
import { TextRow } from '~/shared/TextRow.tsx';

/** A Telegram bot: its token, and where BotFather gives one. */
export const TelegramFields = () => {
  const { t } = useTranslation('frontline');

  return (
    <TextRow
      label={t('bot-token', 'Bot token')}
      icon={IconKey}
      name="token"
      type="password"
      required
      hint={t(
        'telegram-token-hint',
        'In Telegram, message @BotFather, send /newbot and paste the token it replies with. To read a group, add the bot there and turn off its privacy mode.',
      )}
    />
  );
};

const DISCORD_PORTAL = 'https://discord.com/developers/applications';

/** A Discord bot: its token, and where Discord's developer portal shows one. */
export const DiscordFields = () => {
  const { t } = useTranslation('frontline');

  return (
    <TextRow
      label={t('bot-token', 'Bot token')}
      icon={IconKey}
      name="token"
      type="password"
      required
      hint={
        <>
          {t(
            'discord-token-hint',
            "In Discord's developer portal, open your app's Bot page, reset and copy the token, and turn on Message Content Intent.",
          )}{' '}
          <a href={DISCORD_PORTAL} target="_blank" rel="noreferrer" className="underline">
            {t('open-discord-portal', 'Open the portal')}
          </a>
        </>
      }
    />
  );
};

const ZONES = Intl.supportedValuesOf('timeZone').map((zone) => ({
  value: zone,
  label: `${zone} (${zoneOffset(zone)})`,
}));

/** The time zone the PBX writes call times in, the browser's to start with. */
const ZoneRow = () => {
  const { t } = useTranslation('frontline');
  const [zone, setZone] = useState(() => localTimeZone() ?? 'UTC');
  const label = t('time-zone', 'Time zone');

  return (
    <PanelFormRow label={label} icon={IconClock} required>
      <PickerField
        label={label}
        display={ZONES.find((option) => option.value === zone)?.label ?? zone}
        placeholder={label}
        options={ZONES}
        value={[zone]}
        onValueChange={([picked]) => picked && setZone(picked)}
      />
      <input type="hidden" name="timeZone" value={zone} />
    </PanelFormRow>
  );
};

/** A Grandstream PBX: its number, its HTTPS API login, its time zone and trunks. */
export const PbxFields = () => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <TextRow label={t('phone', 'Phone')} icon={IconPhone} name="phone" required />
      <TextRow
        label={t('pbx-host', 'PBX host')}
        icon={IconServer}
        name="host"
        placeholder="pbx.example.com:8089"
        required
        hint={t('pbx-host-hint', "The UCM's address and HTTPS port, as you open it in a browser.")}
      />
      <TextRow
        label={t('api-user', 'API user')}
        icon={IconUser}
        name="apiUser"
        required
        hint={t('pbx-api-user-hint', "A user from the UCM's API configuration page.")}
      />
      <TextRow
        label={t('api-password', 'API password')}
        icon={IconLock}
        name="apiPassword"
        type="password"
        required
      />
      <ZoneRow />
      <TextRow label={t('outbound-trunk', 'Outbound trunk')} icon={IconPlug} name="srcTrunk" />
      <TextRow label={t('inbound-trunk', 'Inbound trunk')} icon={IconPlug} name="dstTrunk" />
      <TextRow
        label={t('turn-server', 'TURN server')}
        icon={IconServer}
        name="turnUrl"
        placeholder="turn:turn.example.com:3478"
      />
      <TextRow label={t('turn-user', 'TURN user')} icon={IconUser} name="turnUsername" />
      <TextRow
        label={t('turn-password', 'TURN password')}
        icon={IconLock}
        name="turnPassword"
        type="password"
      />
    </>
  );
};

/** A CallPro line: its number. */
export const CallProFields = () => {
  const { t } = useTranslation('frontline');

  return (
    <TextRow
      label={t('phone', 'Phone')}
      icon={IconPhone}
      name="phone"
      required
      hint={t(
        'callpro-phone-hint',
        'Once connected, the account shows the webhook address to give CallPro.',
      )}
    />
  );
};
