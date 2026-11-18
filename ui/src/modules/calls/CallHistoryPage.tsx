import { contactQueries, memberQueries } from '@erxes/core-contract/client';
import { IconPhone, IconUserCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  customerTitle,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  Skeleton,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberChip, PersonAvatar } from '~/shared/Person.tsx';
import { CALL_TYPE } from '~/plugin.ts';
import { ListEmpty, ListError } from '~/shared/List.tsx';
import { TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { CALL_ICONS, CallStatus, DirectionIcon, queueLabel, useCallFields } from './CallFields.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { type Call, durationText, useCalls } from './queries.ts';

const LIST = 'frontline-calls';

const column = columnOf<Call>;

/**
 * Who called or was called, opening the call in core's side panel: the customer's name with
 * their phone after it, or the phone alone while core knows them by nothing more.
 */
const CallName = ({ call }: { call: Call }) => {
  const { open } = useOpenRecord();
  const customer = useQuery(contactQueries.customer(call.customerId));
  const title = customer.data ? customerTitle(customer.data) : '';
  const named = /\p{L}/u.test(title);
  const name = named ? title : call.customerPhone;

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: CALL_TYPE, contentId: call.id })}
    >
      <DirectionIcon direction={call.direction} />
      {customer.isPending ? (
        <Skeleton className="h-4 w-24" />
      ) : (
        <>
          <PersonAvatar name={name} src={customer.data?.avatarUrl} size="lg" />
          <span className="truncate">{name}</span>
        </>
      )}
      {named && <span className="text-muted-foreground">{call.customerPhone}</span>}
    </Button>
  );
};

/** Who called or was called, where it went, who answered and for how long. */
const useColumns = (): RecordTableColumnDef<Call>[] => {
  const { t } = useTranslation('frontline');

  return [
    column('customerPhone', t('customer', 'Customer'), IconUserCircle, 280, (call) => (
      <RecordTableInlineCell>
        <CallName call={call} />
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), CALL_ICONS.status, 120, (call) => (
      <RecordTableInlineCell>
        <CallStatus status={call.status} />
      </RecordTableInlineCell>
    )),
    column('number', t('line', 'Line'), CALL_ICONS.number, 120, (call) => (
      <TextCell value={call.number} />
    )),
    column('queue', t('queue', 'Queue'), CALL_ICONS.queue, 180, (call) => (
      <TextCell value={queueLabel(call)} />
    )),
    column('answeredBy', t('answered-by', 'Answered by'), CALL_ICONS.answeredBy, 180, (call) => (
      <RecordTableInlineCell>
        {call.answeredBy && <MemberChip id={call.answeredBy} />}
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
  const list = useCalls();
  const { rows: calls, totalCount, isPending, error } = list;
  const fields = useCallFields();
  const columns = useColumns();

  return (
    <PageContainer>
      <CallsHeader levels={[{ label: t('call-history', 'Call history') }]} />
      <ViewBar allLabel={t('all-calls', 'All calls')}>
        <ListFilter id={LIST} fields={fields} members={memberQueries} totalCount={totalCount} />
      </ViewBar>
      {error ? (
        <ListError error={error} />
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
          <PagedRows paging={list} count={calls.length} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
