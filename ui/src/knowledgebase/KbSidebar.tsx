import {
  IconBook,
  IconChevronRight,
  IconDots,
  IconEdit,
  IconFolders,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { Button, cn, IconComponent, ScrollArea, Skeleton } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { KB_PATH } from '../paths.ts';
import { ActionsMenu, type RowAction } from '../shared/Records.tsx';
import { Indent } from './CategoryTree.tsx';
import { useDeleteCategories } from './useKbDeletes.ts';
import {
  type CategoryRow,
  type Topic,
  useArticleFilters,
  useCategories,
  useKbAccess,
  useKbPanels,
  useKbRoute,
  useTopics,
} from './useKnowledgeBase.ts';

const row = 'hover:bg-accent flex h-8 items-center gap-2 rounded-md px-2 text-sm';

const MoreButton = ({ label, actions }: { label: string; actions: RowAction[] }) =>
  actions.length > 0 && (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label={label}>
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );

/** A category in the tree: its articles on click, its count, and edit or delete for managers. */
const CategoryItem = ({ category }: { category: CategoryRow }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const panels = useKbPanels();
  const { categoryId } = useArticleFilters();
  const { deleteCategories } = useDeleteCategories();

  return (
    <li className={cn(row, categoryId === category.id && 'bg-accent')}>
      <Indent depth={category.depth + 1} />
      <Link
        to={`${KB_PATH}/${category.topicId}/articles?categoryId=${category.id}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {category.icon && <IconComponent name={category.icon} className="size-4 shrink-0" />}
        <span className="truncate">{category.title}</span>
        <span className="text-muted-foreground ml-auto text-xs">{category.articleCount}</span>
      </Link>
      <MoreButton
        label={t('kb-category-actions', 'Actions for {{title}}', { title: category.title })}
        actions={
          can.categories
            ? [
                {
                  value: 'edit',
                  icon: <IconEdit />,
                  label: t('kb-edit-category', 'Edit Category'),
                  onSelect: () => panels.category.open(category.id),
                },
                {
                  value: 'delete',
                  icon: <IconTrash />,
                  label: t('delete', 'Delete'),
                  onSelect: () => void deleteCategories([category]),
                },
              ]
            : []
        }
      />
    </li>
  );
};

const TopicCategories = ({ topicId }: { topicId: string }) => {
  const { data } = useCategories(topicId);

  if (!data) return <Skeleton className="mx-2 h-16" />;

  return (
    <ul>
      {data.map((category) => (
        <CategoryItem key={category.id} category={category} />
      ))}
    </ul>
  );
};

/** What a manager can do with a topic from the sidebar. */
const useTopicActions = (topic: Topic): RowAction[] => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const navigate = useNavigate();
  const { topic: panel } = useKbPanels();
  const at = `${KB_PATH}/${topic.id}`;

  return [
    ...(can.topics
      ? [
          {
            value: 'edit',
            icon: <IconEdit />,
            label: t('kb-edit-topic', 'Edit Topic'),
            onSelect: () => panel.open(topic.id),
          },
        ]
      : []),
    ...(can.categories
      ? [
          {
            value: 'new-category',
            icon: <IconPlus />,
            label: t('kb-new-category', 'New Category'),
            onSelect: () => void navigate(`${at}/categories?category=new`),
          },
        ]
      : []),
    {
      value: 'categories',
      icon: <IconFolders />,
      label: t('kb-manage-categories', 'Manage categories'),
      onSelect: () => void navigate(`${at}/categories`),
    },
    {
      value: 'settings',
      icon: <IconSettings />,
      label: t('settings', 'Settings'),
      onSelect: () => void navigate(`${at}/kbsettings`),
    },
  ];
};

/** A topic: its articles on click, and its categories when open. The open topic starts open. */
const TopicItem = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const { topicId } = useKbRoute();
  const [toggled, setToggled] = useState(false);
  const actions = useTopicActions(topic);
  const current = topic.id === topicId;
  const open = current !== toggled;

  return (
    <li>
      <div className={cn(row, current && 'bg-accent font-medium')}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-expanded={open}
          aria-label={t('kb-show-categories', 'Categories of {{title}}', { title: topic.title })}
          onClick={() => setToggled(!toggled)}
        >
          <IconChevronRight className={cn('transition-transform', open && 'rotate-90')} />
        </Button>
        <Link to={`${KB_PATH}/${topic.id}/articles`} className="min-w-0 flex-1 truncate">
          {topic.title}
        </Link>
        <MoreButton
          label={t('kb-topic-actions', 'Topic actions for {{title}}', { title: topic.title })}
          actions={actions}
        />
      </div>
      {open && <TopicCategories topicId={topic.id} />}
    </li>
  );
};

/** Every topic, each opening to its category tree, and a button for a new topic. */
export const KbSidebar = () => {
  const { t } = useTranslation('frontline');
  const { data, isPending } = useTopics();
  const { topic } = useKbPanels();

  return (
    <nav
      aria-label={t('knowledge-base', 'Knowledge Base')}
      className="flex h-full flex-col border-r"
    >
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <IconBook className="size-4" />
        <span className="flex-1 text-sm font-medium">{t('knowledge-base', 'Knowledge Base')}</span>
        {data?.can.topics && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('kb-new-topic', 'New Topic')}
            onClick={() => topic.open('new')}
          >
            <IconPlus />
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        {isPending && <Skeleton className="m-2 h-24" />}
        {data?.topics.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">
            {t('kb-no-topics-yet', 'There are no topics yet')}
          </p>
        )}
        <ul className="flex flex-col gap-0.5 p-2">
          {data?.topics.map((item) => (
            <TopicItem key={item.id} topic={item} />
          ))}
        </ul>
      </ScrollArea>
    </nav>
  );
};
