import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconClock,
  IconKey,
  IconListNumbers,
  IconPhone,
  IconServer,
  IconTag,
} from '@tabler/icons-react';
import { PanelFormRow, localTimeZone, zoneOffset } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickerField } from '~/shared/Pickers.tsx';
import { ChannelRow, useNewRecordChannel } from '~/shared/ChannelSelect.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { type Operator, OperatorList } from './PbxLines.tsx';

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
            "In Discord's developer portal, open your app's Bot page, reset and copy the token, then add the bot to your server. The inbox gets direct messages to the bot and server messages that mention it.",
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

/** An IANA time zone picked by name, each shown with its offset. */
export const ZonePicker = ({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (zone: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const label = t('time-zone', 'Time zone');

  return (
    <PickerField
      label={label}
      display={ZONES.find((option) => option.value === value)?.label ?? value}
      placeholder={label}
      options={ZONES}
      value={[value]}
      onValueChange={([picked]) => picked && onValueChange(picked)}
    />
  );
};

/** The time zone the PBX writes call times in, the browser's to start with. */
const ZoneRow = () => {
  const { t } = useTranslation('frontline');
  const [zone, setZone] = useState(() => localTimeZone() ?? 'UTC');

  return (
    <PanelFormRow label={t('time-zone', 'Time zone')} icon={IconClock} required>
      <ZonePicker value={zone} onValueChange={setZone} />
      <input type="hidden" name="timeZone" value={zone} />
    </PanelFormRow>
  );
};

/**
 * A Grandstream PBX, in the old form's order: its name, phone number, WebSocket server (the UCM's
 * HTTPS address, which the softphones' `wss://<host>/ws` and the API share), channel, the queues
 * frontline follows in one field, its trunks and time zone, then the members who answer it. The API login and the softphones' TURN key are the install's
 * (`CALL_API_USER` and `CF_TURN_KEY_ID` with theirs). The operators go with the form as JSON; the channel is the one it was opened from,
 * else the member's first, as a new messenger's is.
 */
export const PbxFields = ({ channelId = '' }: { channelId?: string }) => {
  const { t } = useTranslation('frontline');
  const [channel, setChannel] = useState(channelId);
  const [operators, setOperators] = useState<Operator[]>([]);
  const picked = useNewRecordChannel(channel);

  return (
    <>
      <TextRow label={t('name', 'Name')} icon={IconTag} name="name" />
      <TextRow label={t('phone-number', 'Phone number')} icon={IconPhone} name="phone" required />
      <TextRow
        label={t('websocket-server', 'WebSocket server')}
        icon={IconServer}
        name="host"
        placeholder="pbx.example.com:8089"
        required
        hint={t('pbx-host-hint', "The UCM's address and HTTPS port, as you open it in a browser.")}
      />
      <ChannelRow
        value={picked}
        onChange={setChannel}
        missing={t('pbx-channel-none', 'You are no channel’s admin, so the PBX joins none yet.')}
      />
      <input type="hidden" name="channelId" value={picked} />
      <TextRow
        label={t('queues', 'Queues')}
        icon={IconListNumbers}
        name="queues"
        placeholder="6500, 6501"
      />
      <TextRow label={t('source-trunk', 'Source trunk')} icon={IconArrowDownLeft} name="srcTrunk" />
      <TextRow
        label={t('destination-trunk', 'Destination trunk')}
        icon={IconArrowUpRight}
        name="dstTrunk"
      />
      <ZoneRow />
      <OperatorList operators={operators} onChange={setOperators} />
      <input type="hidden" name="operators" value={JSON.stringify(operators)} />
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
