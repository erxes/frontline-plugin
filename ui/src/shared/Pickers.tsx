import { memberQueries } from '@erxes/core-contract/client';
import { Badge, EntityPicker, Popover, RecordTableInlineCell, useMemberOptions } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberLine } from './MemberLine.tsx';

type Option = { value: string; label: string };

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

/** Labels picked in place, as badges. */
export const Badges = ({ labels }: { labels: string[] }) => (
  <span className="flex min-w-0 flex-wrap gap-1">
    {labels.map((label) => (
      <Badge key={label} variant="secondary">
        {label}
      </Badge>
    ))}
  </span>
);

/** Several team members picked in place, shown as their avatars and names. */
export const MembersField = ({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: string[];
  onValueChange: (ids: string[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const members = useMemberOptions(memberQueries, true, value);

  return (
    <PickerField
      label={label}
      placeholder={t('nobody', 'Nobody')}
      display={
        <span className="flex min-w-0 flex-wrap gap-2">
          {value.map((id) => (
            <MemberLine key={id} id={id} />
          ))}
        </span>
      }
      options={members.options}
      loading={members.loading}
      error={members.error}
      value={value}
      onValueChange={onValueChange}
      multiple
    />
  );
};
