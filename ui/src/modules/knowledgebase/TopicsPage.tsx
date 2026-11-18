import { memberQueries } from '@erxes/core-contract/client';
import {
  IconArticle,
  IconBook,
  IconCalendarPlus,
  IconCode,
  IconFileDescription,
  IconFolders,
  IconLanguage,
  IconLayoutGrid,
  IconLetterCase,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  DisplayMenu,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { Link } from 'react-router-dom';
import { KB_TOPIC_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty, ListError } from '~/shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { column, DateCell, Rows } from '~/shared/Table.tsx';
import { KbHeader } from './KbHeader.tsx';
import { OldLink } from './OldLink.tsx';
import { TopicCards } from './TopicCards.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import {
  LANGUAGE_CODES,
  type Topic,
  topicPath,
  useKbAccess,
  useLanguageName,
  useTopics,
} from './useKnowledgeBase.ts';

/** The title opens the topic in core's side panel, as a customer's name does. */
const TitleCell = ({ topic }: { topic: Topic }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: KB_TOPIC_TYPE, contentId: topic.id })}
      >
        {topic.title}
      </Button>
    </RecordTableInlineCell>
  );
};

/** A count that leads to the topic's page of those records. */
const CountCell = ({ to, count }: { to: string; count: number }) => (
  <RecordTableInlineCell>
    <Link to={to} className="hover:underline">
      {count}
    </Link>
  </RecordTableInlineCell>
);

const MoreCell = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const { deleteTopics } = useDeleteTopics();

  if (!can.topics) return null;

  return (
    <RowActions
      label={t('kb-topic-actions', 'Actions for {{title}}', { title: topic.title })}
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteTopics([topic.id]),
        },
      ]}
    />
  );
};

const useColumns = (): RecordTableColumnDef<Topic>[] => {
  const { t } = useTranslation('frontline');
  const language = useLanguageName();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell topic={row.original} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<Topic>(),
    column<Topic>('title', t('title', 'Title'), IconLetterCase, 240, (topic) => (
      <TitleCell topic={topic} />
    )),
    column<Topic>(
      'description',
      t('description', 'Description'),
      IconFileDescription,
      260,
      (topic) => <TextCell value={topic.description} />,
    ),
    column<Topic>('articleCount', t('articles', 'Articles'), IconArticle, 100, (topic) => (
      <CountCell to={topicPath(topic.id, 'articles')} count={topic.articleCount} />
    )),
    column<Topic>('categoryCount', t('kb-categories', 'Categories'), IconFolders, 110, (topic) => (
      <CountCell to={topicPath(topic.id, 'categories')} count={topic.categoryCount} />
    )),
    column<Topic>('code', t('kb-code', 'Code'), IconCode, 120, (topic) => (
      <TextCell value={topic.code} />
    )),
    column<Topic>('languageCode', t('language', 'Language'), IconLanguage, 120, (topic) => (
      <TextCell value={topic.languageCode && language(topic.languageCode)} />
    )),
    column<Topic>('createdBy', t('created-by', 'Created by'), IconUser, 180, (topic) => (
      <RecordTableInlineCell>
        <MemberLine id={topic.createdBy} />
      </RecordTableInlineCell>
    )),
    column<Topic>('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 130, (topic) => (
      <DateCell date={topic.createdAt} />
    )),
  ];
};

/** Deletes the selected topics, with their categories and articles. */
const TopicsCommandBar = () => {
  const { deleteTopics, isPending } = useDeleteTopics();

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton disabled={isPending} onClick={() => void deleteTopics(selected, clear)} />
      )}
    </SelectionBar>
  );
};

/** What the topics list's filter bar offers; the API applies it (`topics.ts`). */
const useFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const language = useLanguageName();

  return [
    { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.description',
      label: t('description', 'Description'),
      type: 'text',
      icon: IconFileDescription,
    },
    { path: 'subject.code', label: t('kb-code', 'Code'), type: 'text', icon: IconCode },
    {
      path: 'subject.languageCode',
      label: t('language', 'Language'),
      type: 'select',
      icon: IconLanguage,
      options: LANGUAGE_CODES.map((code) => ({ value: code, label: language(code) })),
    },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
  ];
};

const LIST = 'frontline-kb-topics';

/**
 * The knowledge base's topics under core's list bar, as cards that open their articles or as a
 * table (the Display menu). In the table a topic opens in core's side panel and its counts lead
 * to its articles and categories. New topic drafts one in the panel.
 */
export const TopicsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const { data, isPending, error } = useTopics();
  const topics = data?.topics ?? [];
  const columns = useColumns();

  const displays = [
    { key: 'cards', label: t('cards', 'Cards'), icon: IconLayoutGrid },
    'table',
  ] as const;

  const [display] = useListDisplay(LIST, displays);

  return (
    <PageContainer>
      <OldLink param="createTopic" contentType={KB_TOPIC_TYPE} id={() => 'new'} />
      <KbHeader>
        <CreateButton
          allowed={data?.can.topics ?? false}
          label={t('kb-new-topic', 'New topic')}
          onClick={() => openNew(KB_TOPIC_TYPE)}
        />
      </KbHeader>
      <ViewBar allLabel={t('kb-all-topics', 'All topics')}>
        <ListFilter
          id={LIST}
          fields={useFields()}
          members={memberQueries}
          totalCount={isPending ? undefined : topics.length}
        >
          <DisplayMenu list={LIST} displays={displays} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <ListError error={error} />
      ) : !isPending && topics.length === 0 ? (
        <ListEmpty
          icon={<IconBook />}
          title={t('kb-no-topics-yet', 'There are no topics yet')}
          description={t(
            'kb-no-topics-description',
            'Create your first topic and start your knowledge base.',
          )}
        />
      ) : display === 'cards' ? (
        <TopicCards topics={topics} isPending={isPending} />
      ) : (
        <RecordTable.Provider
          tableId="frontline_kb_topics"
          columns={columns}
          data={topics}
          stickyColumns={['more', 'checkbox', 'title']}
          className="m-3"
        >
          <Rows isPending={isPending} />
          {data?.can.topics && <TopicsCommandBar />}
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
