import { IconPhone, IconPhoneCall, IconRepeat, IconUserCircle } from '@tabler/icons-react';
import {
  Button,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ListEmpty, ListError } from '~/shared/List.tsx';
import { TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { CALL_ICONS, queueLabel } from './CallFields.tsx';
import { CallName } from './CallHistoryPage.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { type Callback, PHONE_PATH, useCallbacks } from './queries.ts';
import { dialOn, useLivePhone } from './softphone/live.ts';

const column = columnOf<Callback>;

/**
 * Calls the caller back on the line they rang, then opens the Phone page with the call. Only a
 * member with a softphone on that line can.
 */
const CallBack = ({ callback }: { callback: Callback }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const live = useLivePhone();
  const onLine = live?.lines.some((line) => line.accountId === callback.accountId) ?? false;

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!onLine || Boolean(live?.phone.call)}
      aria-label={t('call-back-number', 'Call back {{number}}', {
        number: callback.customerPhone,
      })}
      onClick={() => {
        dialOn({ accountId: callback.accountId, number: callback.customerPhone });
        void navigate(PHONE_PATH);
      }}
    >
      <IconPhoneCall />
      {t('call-back', 'Call back')}
    </Button>
  );
};

/** Who rang, how often since anyone talked to them, when last, on which line, and Call back. */
const useColumns = (): RecordTableColumnDef<Callback>[] => {
  const { t } = useTranslation('frontline');

  return [
    column('customerPhone', t('customer', 'Customer'), IconUserCircle, 280, (callback) => (
      <RecordTableInlineCell>
        <CallName call={callback} />
      </RecordTableInlineCell>
    )),
    column('missedCount', t('missed-times', 'Missed'), IconRepeat, 90, (callback) => (
      <TextCell value={String(callback.missedCount)} />
    )),
    column('startedAt', t('last-rang', 'Last rang'), CALL_ICONS.startedAt, 140, (callback) => (
      <DateCell date={callback.startedAt} />
    )),
    column('number', t('line', 'Line'), CALL_ICONS.number, 120, (callback) => (
      <TextCell value={callback.number} />
    )),
    column('queue', t('queue', 'Queue'), CALL_ICONS.queue, 160, (callback) => (
      <TextCell value={queueLabel(callback)} />
    )),
    column('callBack', '', IconPhone, 130, (callback) => (
      <RecordTableInlineCell>
        <CallBack callback={callback} />
      </RecordTableInlineCell>
    )),
  ];
};

/**
 * The callers the member's channels missed and nobody has talked to since, newest first, one row
 * a caller. Calling back and talking takes them off; ringing unanswered again moves them up.
 */
export const CallbacksPage = () => {
  const { t } = useTranslation('frontline');
  const list = useCallbacks();
  const { rows, isPending, error } = list;
  const columns = useColumns();

  return (
    <PageContainer>
      <CallsHeader levels={[{ label: t('callbacks', 'Callbacks') }]} />
      {error ? (
        <ListError error={error} />
      ) : !isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconPhoneCall />}
          title={t('no-callbacks', 'Nobody to call back')}
          description={t(
            'no-callbacks-description',
            'Callers your channels missed show here until someone talks to them.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_callbacks"
          columns={columns}
          data={rows}
          stickyColumns={['customerPhone']}
          className="m-3"
        >
          <PagedRows paging={list} count={rows.length} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
