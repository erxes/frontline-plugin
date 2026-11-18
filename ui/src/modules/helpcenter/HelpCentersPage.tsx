import { memberQueries } from '@erxes/core-contract/client';
import {
  IconBook,
  IconBrush,
  IconCalendarPlus,
  IconCalendarUp,
  IconForms,
  IconHelpCircle,
  IconLetterCase,
  IconTrash,
  IconUser,
  IconWorldWww,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HELP_CENTER_TYPE } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CreateButton, ListEmpty, ListError } from '~/shared/List.tsx';
import { MemberLine } from '~/shared/Person.tsx';
import { PickerField } from '~/shared/Pickers.tsx';
import { DeleteButton, type RowAction, RowActions, SelectionBar } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import {
  type HelpCenter,
  helpCenterPath,
  useCanManageHelpCenters,
  useDeleteHelpCenters,
  useEditHelpCenter,
  useHelpCenters,
  useTopicOptions,
} from './queries.ts';

const LIST = 'frontline-help-centers';

const column = columnOf<HelpCenter>;

/** The title opens the help center in core's side panel. */
const TitleCell = ({ center }: { center: HelpCenter }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: HELP_CENTER_TYPE, contentId: center.id })}
      >
        <span className="truncate">{center.title}</span>
      </Button>
    </RecordTableInlineCell>
  );
};

/** The topic the help center shows, picked in place by a manager. */
const TopicCell = ({ center, manage }: { center: HelpCenter; manage: boolean }) => {
  const { t } = useTranslation('frontline');
  const topics = useTopicOptions();
  const edit = useEditHelpCenter(center.id);
  const name = topics.find((topic) => topic.value === center.kbTopicId)?.label;

  if (!manage)
    return (
      <RecordTableInlineCell>
        <span className="truncate">{name}</span>
      </RecordTableInlineCell>
    );

  return (
    <PickerField
      label={t('kb-topic', 'Knowledge base topic')}
      placeholder={t('none', 'None')}
      display={<span className="truncate">{name}</span>}
      options={topics}
      value={center.kbTopicId ? [center.kbTopicId] : []}
      onValueChange={([kbTopicId]) => edit({ kbTopicId: kbTopicId ?? null })}
      noneLabel={t('none', 'None')}
    />
  );
};

const DomainCell = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  if (!center.hostname) return <RecordTableInlineCell />;

  const active = center.domainStatus === 'active' && center.sslStatus === 'active';

  return (
    <RecordTableInlineCell>
      <span className="truncate">{center.hostname}</span>
      <Badge variant={active ? 'success' : 'secondary'}>
        {active ? t('active', 'Active') : t('pending', 'Pending')}
      </Badge>
    </RecordTableInlineCell>
  );
};

/** The row's menu: its appearance page, and for managers, delete. */
const MoreCell = ({ center, manage }: { center: HelpCenter; manage: boolean }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { deleteCenters } = useDeleteHelpCenters();

  const actions: RowAction[] = [
    {
      value: 'appearance',
      icon: <IconBrush />,
      label: t('appearance', 'Appearance'),
      onSelect: () => void navigate(helpCenterPath(center.id, true)),
    },
    ...(manage
      ? [
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void deleteCenters([center.id]),
          },
        ]
      : []),
  ];

  return (
    <RowActions
      label={t('help-center-actions', 'Actions for {{title}}', { title: center.title })}
      actions={actions}
    />
  );
};

const useColumns = (manage: boolean): RecordTableColumnDef<HelpCenter>[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell center={row.original} manage={manage} />,
      size: 33,
    },
    ...(manage ? [RecordTable.checkboxColumnOf<HelpCenter>()] : []),
    column('title', t('title', 'Title'), IconLetterCase, 240, (center) => (
      <TitleCell center={center} />
    )),
    column('topic', t('kb-topic', 'Knowledge base topic'), IconBook, 200, (center) => (
      <TopicCell center={center} manage={manage} />
    )),
    column('forms', t('forms', 'Forms'), IconForms, 100, (center) => (
      <RecordTableInlineCell>{center.formIds.length}</RecordTableInlineCell>
    )),
    column('domain', t('domain', 'Domain'), IconWorldWww, 240, (center) => (
      <DomainCell center={center} />
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 200, (center) => (
      <RecordTableInlineCell>
        <MemberLine id={center.createdBy} />
      </RecordTableInlineCell>
    )),
    column('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 140, (center) => (
      <DateCell date={center.createdAt} />
    )),
  ];
};

/** What the list's filter bar offers; the API applies it (`helpCenters.ts`). */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.kbTopicId',
      label: t('kb-topic', 'Knowledge base topic'),
      type: 'select',
      icon: IconBook,
      options: useTopicOptions(),
    },
    { path: 'subject.hostname', label: t('domain', 'Domain'), type: 'text', icon: IconWorldWww },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
    {
      path: 'subject.updatedAt',
      label: t('updated-at', 'Updated at'),
      type: 'date',
      icon: IconCalendarUp,
    },
  ];
};

/** Deletes the selected help centers in one request. */
const BulkDelete = ({ selected, clear }: { selected: string[]; clear: () => void }) => {
  const { deleteCenters, isPending } = useDeleteHelpCenters();

  return <DeleteButton disabled={isPending} onClick={() => void deleteCenters(selected, clear)} />;
};

/**
 * Help centers, as core draws Contacts › Customers: the header with its New button, the filter
 * bar, then the table newest first and a page at a time. A help center opens in core's side
 * panel, and managers pick rows to delete them together.
 */
export const HelpCentersPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const manage = useCanManageHelpCenters();
  const list = useHelpCenters();
  const { rows: centers, totalCount, isPending, error } = list;
  const columns = useColumns(manage);

  return (
    <PageContainer>
      <AppHeader icon={IconHelpCircle} app={{ label: t('help-centers', 'Help centers') }}>
        <CreateButton
          allowed={manage}
          label={t('add-help-center', 'Add help center')}
          onClick={() => openNew(HELP_CENTER_TYPE)}
        />
      </AppHeader>
      <ViewBar allLabel={t('all-help-centers', 'All help centers')}>
        <ListFilter
          id={LIST}
          fields={useFields()}
          members={memberQueries}
          totalCount={totalCount}
        />
      </ViewBar>
      {error ? (
        <ListError error={error} />
      ) : !isPending && centers.length === 0 ? (
        <ListEmpty
          icon={<IconHelpCircle />}
          title={t('no-help-centers-yet', 'No help centers yet')}
          description={t(
            'help-centers-empty',
            "A help center publishes a knowledge base topic's articles for your customers.",
          )}
          action={
            manage && (
              // The header's button holds the C shortcut; this one only clicks.
              <Button onClick={() => openNew(HELP_CENTER_TYPE)}>
                {t('add-help-center', 'Add help center')}
              </Button>
            )
          }
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_help_centers"
          columns={columns}
          data={centers}
          stickyColumns={['more', 'checkbox', 'title']}
          className="m-3"
        >
          <PagedRows paging={list} count={centers.length} />
          {manage && (
            <SelectionBar>
              {(selected, clear) => <BulkDelete selected={selected} clear={clear} />}
            </SelectionBar>
          )}
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
