import { Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { type CategoryRow, subtreeOf, useAllTopics, useCategories } from './useKnowledgeBase.ts';

/** Space before a category's title, one step per level it sits below the top. */
export const Indent = ({ depth }: { depth: number }) =>
  Array.from({ length: depth }, (_, level) => (
    <span key={level} aria-hidden className="inline-block w-4 shrink-0" />
  ));

/** A select's options for the categories, in tree order and indented; `depth` adds to each. */
const CategoryOptions = ({ rows, depth = 0 }: { rows: CategoryRow[]; depth?: number }) =>
  rows.map((row) => (
    <Select.Item key={row.id} value={row.id}>
      <Indent depth={row.depth + depth} />
      {row.title}
    </Select.Item>
  ));

/** One of the topic's categories, in tree order; `flush` draws it bare, inside a table cell. */
export const CategorySelect = ({
  topicId,
  value,
  onChange,
  label,
  flush = false,
}: {
  topicId: string;
  value: string;
  onChange: (id: string) => void;
  label: string;
  flush?: boolean;
}) => {
  const rows = useCategories(topicId).data ?? [];

  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger aria-label={label} variant={flush ? 'flush' : 'default'}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <CategoryOptions rows={rows} />
      </Select.Content>
    </Select>
  );
};

const NO_PARENT = 'none';

/**
 * The category a category sits under in `topicId`, or none for the top level. `categoryId`'s own
 * subtree is left out, since a category can't go under itself.
 */
export const ParentSelect = ({
  topicId,
  categoryId,
  value,
  onChange,
}: {
  topicId: string;
  categoryId?: string;
  value: string | null;
  onChange: (parentId: string | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const rows = useCategories(topicId).data ?? [];
  const below = categoryId ? subtreeOf(rows, categoryId) : [];

  return (
    <Select
      value={value ?? NO_PARENT}
      onValueChange={(parentId) => onChange(parentId === NO_PARENT ? null : parentId)}
    >
      <Select.Trigger aria-label={t('kb-parent-category', 'Parent category')}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={NO_PARENT}>
          {t('kb-no-parent-category', 'No parent category')}
        </Select.Item>
        <CategoryOptions rows={rows.filter((row) => !below.includes(row.id))} depth={1} />
      </Select.Content>
    </Select>
  );
};

/** The topic a category is in. */
export const TopicSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (topicId: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const topics = useAllTopics();

  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger aria-label={t('kb-topic', 'Topic')}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {topics.map((topic) => (
          <Select.Item key={topic.id} value={topic.id}>
            {topic.title}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};
