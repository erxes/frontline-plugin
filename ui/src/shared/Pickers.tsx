import {
  Badge,
  Combobox,
  cn,
  EntityPicker,
  Popover,
  RecordTableInlineCell,
  Tooltip,
} from 'erxes-ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { tagsOf } from '~/shared/reference.ts';

type Option = { value: string; label: string };

/** How long typing in a picker's search pauses before the search goes to the API. */
export const SEARCH_PAUSE_MS = 250;

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

type RowOption<V extends string> = { value: V; label: string; icon: ReactNode };

/**
 * One value of a list row, picked in place as on a task row of Operation: a quiet button that
 * shows the value's icon (`iconOnly`) or icon and name, and opens a searchable list. Its name
 * is `label`, then the value, for screen readers.
 */
export const RowPicker = <V extends string>({
  label,
  options,
  value,
  onChange,
  iconOnly,
  display,
  disabled,
  className,
}: {
  label: string;
  options: RowOption<V>[];
  value: V;
  onChange: (value: V) => void;
  iconOnly?: boolean;
  /** What the closed button shows instead of the value's icon and name. */
  display?: ReactNode;
  disabled?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Combobox.Trigger
        variant="ghost"
        hideChevron
        size={iconOnly ? 'icon' : undefined}
        disabled={disabled}
        className={cn(iconOnly ? 'w-7 shrink-0' : 'min-w-0', className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="sr-only">
            {label}
            {current && `: ${current.label}`}
          </span>
          {display ?? (
            <>
              <span aria-hidden className="inline-flex shrink-0">
                {current?.icon}
              </span>
              {!iconOnly && (
                <span aria-hidden className="truncate">
                  {current?.label}
                </span>
              )}
            </>
          )}
        </span>
      </Combobox.Trigger>
      <Combobox.Content className="w-56">
        <EntityPicker<RowOption<V>, V>
          items={options}
          itemKey={(option) => ({ id: option.value, label: option.label })}
          renderItem={(option) => (
            <span className="flex min-w-0 items-center gap-2">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          )}
          value={[value]}
          keepOrder
          searchPlaceholder={label}
          onValueChange={([next]) => {
            if (next !== undefined && next !== value) onChange(next);

            setOpen(false);
          }}
        />
      </Combobox.Content>
    </Popover>
  );
};

/**
 * A value of a settings page's form picked from `options`: one, closing on the pick, or several
 * with `multiple`. The bordered button shows `display`, or `placeholder` while nothing is picked.
 */
export const PickerSelect = ({
  id,
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
  disabled,
}: {
  id?: string;
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
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Combobox.Trigger id={id} variant="bordered" disabled={disabled} aria-label={label}>
        {value.length === 0 ? (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1">{display}</span>
        )}
      </Combobox.Trigger>
      <Combobox.Content align="start">
        <EntityPicker
          items={options}
          itemKey={(option) => ({ id: option.value, label: option.label })}
          value={value}
          onValueChange={(ids) => {
            onValueChange(ids);

            if (!multiple) setOpen(false);
          }}
          multiple={multiple}
          noneLabel={noneLabel}
          loading={loading}
          error={error}
          onSearchChange={onSearchChange}
          searchPlaceholder={label}
        />
      </Combobox.Content>
    </Popover>
  );
};

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
