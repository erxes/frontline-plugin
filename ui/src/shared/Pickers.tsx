import { memberQueries } from '@erxes/core-contract/client';
import { IconPlus } from '@tabler/icons-react';
import {
  Badge,
  Button,
  cn,
  EntityPicker,
  MemberLink,
  Popover,
  RecordTableInlineCell,
  useMemberOptions,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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

/**
 * Several team members in a panel row, drawn as core's owner field is: each a chip that opens
 * them in core's side panel, then a muted button that shows on hover to change them; with none,
 * "+ Add".
 */
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
  const add = t('add', 'Add');

  return (
    <div className="group/relations flex min-h-7 min-w-0 flex-wrap items-center gap-1 px-1">
      {value.map((id) => (
        <div key={id} className="flex min-w-0 overflow-hidden">
          <MemberLink memberId={id} members={memberQueries} />
        </div>
      ))}
      <Popover>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="xs"
              tone="muted"
              data-panel-inline=""
              aria-label={value.length ? t('change-label', 'Change {{label}}', { label }) : add}
              className={cn(
                'shrink-0 [&>svg]:size-3.5',
                value.length > 0 &&
                  'opacity-0 group-hover/relations:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100',
              )}
            />
          }
        >
          <IconPlus aria-hidden="true" />
          {!value.length && <span className="font-normal">{add}</span>}
        </Popover.Trigger>
        <RecordTableInlineCell.Content>
          <EntityPicker
            items={members.options}
            itemKey={(option) => ({ id: option.value, label: option.label })}
            value={value}
            onValueChange={onValueChange}
            multiple
            loading={members.loading}
            error={members.error}
            searchPlaceholder={label}
          />
        </RecordTableInlineCell.Content>
      </Popover>
    </div>
  );
};
