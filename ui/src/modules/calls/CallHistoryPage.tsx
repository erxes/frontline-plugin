import { contactQueries, memberQueries } from '@erxes/core-contract/client';
import { IconPhone, IconUserCircle } from '@tabler/icons-react';
import {
  Button,
  ContactLink,
  ListFilter,
  MemberLink,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { CALL_TYPE } from '~/plugin.ts';
import { ListEmpty } from '~/shared/List.tsx';
import { TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { CALL_ICONS, CallStatus, DirectionIcon, useCallFields } from './CallFields.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { type Call, durationText, useCalls } from './queries.ts';

const LIST = 'frontline-calls';

const column = columnOf<Call>;

/** The customer's phone, opening the call in core's side panel. */
const CallName = ({ call }: { call: Call }) => {
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: CALL_TYPE, contentId: call.id })}
    >
      <DirectionIcon direction={call.direction} />
      <span className="truncate">{call.customerPhone}</span>
    </Button>
  );
};

/** Who called or was called, where it went, who answered and for how long. */
const useColumns = (): RecordTableColumnDef<Call>[] => {
  const { t } = useTranslation('frontline');

  return [
    column(
      'customerPhone',
      t('customer-phone', 'Customer phone'),
      CALL_ICONS.customerPhone,
      200,
      (call) => (
        <RecordTableInlineCell>
          <CallName call={call} />
        </RecordTableInlineCell>
      ),
    ),
    column('status', t('status', 'Status'), CALL_ICONS.status, 130, (call) => (
      <RecordTableInlineCell>
        <CallStatus status={call.status} />
      </RecordTableInlineCell>
    )),
    column('customer', t('customer', 'Customer'), IconUserCircle, 200, (call) => (
      <RecordTableInlineCell>
        <ContactLink
          contentType="core:customer"
          contentId={call.customerId}
          contacts={contactQueries}
          placeholder={call.customerPhone}
        />
      </RecordTableInlineCell>
    )),
    column('number', t('line', 'Line'), CALL_ICONS.number, 160, (call) => (
      <TextCell value={call.number} />
    )),
    column('queue', t('queue', 'Queue'), CALL_ICONS.queue, 100, (call) => (
      <TextCell value={call.queue} />
    )),
    column('answeredBy', t('answered-by', 'Answered by'), CALL_ICONS.answeredBy, 180, (call) => (
      <RecordTableInlineCell>
        {call.answeredBy && <MemberLink memberId={call.answeredBy} members={memberQueries} />}
      </RecordTableInlineCell>
    )),
    column('durationSec', t('duration', 'Duration'), CALL_ICONS.durationSec, 100, (call) => (
      <TextCell value={durationText(call.durationSec)} />
    )),
    column('startedAt', t('started-at', 'Started at'), CALL_ICONS.startedAt, 140, (call) => (
      <DateCell date={call.startedAt} />
    )),
  ];
};

/**
 * Every call of the member's channels, newest first, under core's list bar: the filter (`F`) on
 * each field the old call history showed. A call opens in core's side panel, beside its inbox
 * conversation; a PBX or CallPro event refreshes the list as it happens.
 */
export const CallHistoryPage = () => {
  const { t } = useTranslation('frontline');
  const { calls, totalCount, isPending, error, hasNextPage, fetchNextPage } = useCalls();
  const fields = useCallFields();
  const columns = useColumns();

  return (
    <PageContainer>
      <CallsHeader levels={[{ label: t('call-history', 'Call history') }]} />
      <ViewBar allLabel={t('all-calls', 'All calls')}>
        <ListFilter id={LIST} fields={fields} members={memberQueries} totalCount={totalCount} />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && calls.length === 0 ? (
        <ListEmpty
          icon={<IconPhone />}
          title={t('no-calls-yet', 'No calls yet')}
          description={t(
            'no-calls-description',
            'Calls to and from your PBX or CallPro line show here as they happen.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_calls"
          columns={columns}
          data={calls}
          stickyColumns={['customerPhone']}
          className="m-3"
        >
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={calls.length}
            fetchNextPage={() => void fetchNextPage()}
          />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
