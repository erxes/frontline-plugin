import { Badge, EntityPicker, Popover, RecordTableInlineCell, Tooltip } from 'erxes-ui';
import type { InferClientInputs } from '@orpc/client';
import { useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';

type Option = { value: string; label: string };

/** The organisation's tags of one type, as erxes-ui's tag lookups and `TagsField` take them. */
export const tagsOf = (type: NonNullable<InferClientInputs<Client>['tags']['list']['type']>) =>
  orpc.tags.list.queryOptions({ input: { type } });

/**
 * A side panel value picked in place from `options`: one, or several with `multiple`. Its
 * trigger shows `display`, or `placeholder` while nothing is picked.
 */
export const PickerField = ({
  label,
  display,
  placeholder,
  options,
  value,
  onValueChange,
  multiple,
  noneLabel,
  loading,
  error,
  onSearchChange,
}: {
  label: string;
  display: ReactNode;
  placeholder: string;
  options: Option[];
  value: string[];
  onValueChange: (ids: string[]) => void;
  multiple?: boolean;
  noneLabel?: string;
  loading?: boolean;
  error?: Error | null;
  onSearchChange?: (search: string) => void;
}) => (
  <Popover>
    <RecordTableInlineCell.Trigger variant="field" empty={value.length === 0}>
      {value.length === 0 ? (
        <span className="truncate text-muted-foreground">{placeholder}</span>
      ) : (
        display
      )}
    </RecordTableInlineCell.Trigger>
    <RecordTableInlineCell.Content>
      <EntityPicker
        items={options}
        itemKey={(option) => ({ id: option.value, label: option.label })}
        value={value}
        onValueChange={onValueChange}
        multiple={multiple}
        noneLabel={noneLabel}
        loading={loading}
        error={error}
        onSearchChange={onSearchChange}
        searchPlaceholder={label}
      />
    </RecordTableInlineCell.Content>
  </Popover>
);

/** Labels as badges; past `max`, one more badge counts the rest and names them on hover. */
export const Badges = ({ labels, max = labels.length }: { labels: string[]; max?: number }) => {
  const rest = labels.slice(max);

  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.slice(0, max).map((label) => (
        <Badge key={label} variant="secondary" className="max-w-full">
          <span className="truncate">{label}</span>
        </Badge>
      ))}
      {rest.length > 0 && (
        <Tooltip.Provider>
          <Tooltip>
            <Tooltip.Trigger
              render={
                <Badge variant="secondary" tabIndex={0} aria-label={rest.join(', ')}>
                  +{rest.length}
                </Badge>
              }
            />
            <Tooltip.Content>{rest.join(', ')}</Tooltip.Content>
          </Tooltip>
        </Tooltip.Provider>
      )}
    </span>
  );
};

/** A record's tags of the list `tags` gives, as badges; nothing when it has none. */
export const TagBadges = ({
  tags,
  tagIds,
  max,
}: {
  tags: ReturnType<typeof tagsOf>;
  tagIds: string[];
  max?: number;
}) => {
  const list = useQuery({ ...tags, enabled: tagIds.length > 0 });
  const name = new Map((list.data?.data ?? []).map((tag) => [tag.id, tag.name]));
  const labels = tagIds.flatMap((id) => name.get(id) ?? []);

  return labels.length > 0 ? <Badges labels={labels} max={max} /> : null;
};

/** A record's tags of the list `tags` gives, picked in place in a panel row or a table cell. */
export const TagsField = ({
  tags,
  value,
  onChange,
}: {
  tags: ReturnType<typeof tagsOf>;
  value: string[];
  onChange: (tagIds: string[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const list = useQuery(tags);
  const rows = list.data?.data ?? [];
  const name = new Map(rows.map((tag) => [tag.id, tag.name]));

  return (
    <PickerField
      label={t('tags', 'Tags')}
      placeholder={t('no-tags', 'No tags')}
      display={<Badges labels={value.map((id) => name.get(id) ?? '')} />}
      options={rows.map((tag) => ({ value: tag.id, label: tag.name }))}
      loading={list.isPending}
      error={list.error}
      value={value}
      onValueChange={onChange}
      multiple
    />
  );
};
