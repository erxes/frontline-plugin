import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAddressBook,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconEye,
  IconForms,
  IconLetterCase,
  IconLayoutBottombar,
  IconProgressCheck,
  IconTag,
} from '@tabler/icons-react';
import {
  DisplayMenu,
  ListFilter,
  PageContainer,
  RecordList,
  type TListFilterField,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';
import { FORM_TYPE } from '~/plugin.ts';
import { useManagedChannels } from '~/shared/ChannelSelect.tsx';
import { ArchiveButtons } from '~/shared/ArchiveButtons.tsx';
import { AppHeader } from '~/shared/Header.tsx';
import { CreateButton, ListEmpty, ListError, LoadPage } from '~/shared/List.tsx';
import { DeleteButton, ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { useSetFormStatus } from './FormCells.tsx';
import { FormList, FormsTable } from './FormRows.tsx';
import {
  FORM_STATUSES,
  formTags,
  LOAD_TYPES,
  useDeleteForms,
  useForms,
  useLoadTypeNames,
  useStatusNames,
} from './useForms.ts';

const LIST = 'frontline-forms';

/** Grouped by status first; the table shows every column. */
const DISPLAYS = ['list', 'table'] as const;

/** Archives, reactivates or deletes the selected forms, each in one request. */
const BulkActions = ({ selected, clear }: { selected: string[]; clear: () => void }) => {
  const setStatus = useSetFormStatus();
  const { deleteForms, isPending } = useDeleteForms();

  return (
    <>
      <ArchiveButtons
        disabled={setStatus.isPending}
        set={(status) => setStatus.mutate({ ids: selected, status }, { onSuccess: clear })}
      />
      <DeleteButton disabled={isPending} onClick={() => void deleteForms(selected, clear)} />
    </>
  );
};

const bulk = (selected: string[], clear: () => void) => (
  <BulkActions selected={selected} clear={clear} />
);

/** What the forms list's filter bar offers; the API applies it (`forms.ts`). */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const loadTypes = useLoadTypeNames();
  const channels = useChannels().data?.channels ?? [];

  return [
    { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.title',
      label: t('form-title', 'Form title'),
      type: 'text',
      icon: IconLetterCase,
    },
    {
      path: 'subject.status',
      label: t('status', 'Status'),
      type: 'select',
      icon: IconProgressCheck,
      options: FORM_STATUSES.map((status) => ({ value: status, label: statuses[status] })),
    },
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
    {
      path: 'subject.loadType',
      label: t('form-load-type', 'Shows as'),
      type: 'select',
      icon: IconLayoutBottombar,
      options: LOAD_TYPES.map((type) => ({ value: type, label: loadTypes[type] })),
    },
    { path: 'subject.tagIds', label: t('tags', 'Tags'), type: 'tags', icon: IconTag },
    { path: 'subject.viewCount', label: t('form-views', 'Views'), type: 'number', icon: IconEye },
    {
      path: 'subject.contactsGathered',
      label: t('form-contacts', 'Contacts'),
      type: 'number',
      icon: IconAddressBook,
    },
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

/**
 * The forms of the member's channels under core's list bar, grouped by status or as a table (the
 * Display menu), newest first and a page at a time. A form opens in core's side panel, and New
 * form drafts one there.
 */
export const FormsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const [display] = useListDisplay(LIST, DISPLAYS);
  const canCreate = useManagedChannels().length > 0;

  const list = useForms();
  const { rows: forms, totalCount, isPending, error } = list;

  const manage = forms.some((form) => form.canManage);
  const create = () => openNew(FORM_TYPE, {});

  return (
    <PageContainer>
      <AppHeader icon={IconForms} app={{ label: t('forms', 'Forms') }}>
        <CreateButton allowed={canCreate} label={t('new-form', 'New form')} onClick={create} />
      </AppHeader>
      <ViewBar allLabel={t('all-forms', 'All forms')}>
        <ListFilter
          id={LIST}
          fields={useFields()}
          members={memberQueries}
          tags={formTags}
          totalCount={totalCount}
        >
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <ListError error={error} />
      ) : !isPending && forms.length === 0 ? (
        <ListEmpty
          icon={<IconForms />}
          title={t('no-forms-yet', 'No forms yet')}
          description={t(
            'no-forms-description',
            'Build a form to gather leads and feedback on your site.',
          )}
        />
      ) : display === 'table' ? (
        <FormsTable forms={forms} manage={manage} paging={list}>
          {manage && <SelectionBar>{bulk}</SelectionBar>}
        </FormsTable>
      ) : (
        <RecordList.Provider listId={LIST}>
          {isPending ? <RecordList.Skeleton /> : <FormList forms={forms} />}
          <LoadPage paging={list} />
          {manage && (
            <ListSelectionBar shown={forms.map((form) => form.id)}>{bulk}</ListSelectionBar>
          )}
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
