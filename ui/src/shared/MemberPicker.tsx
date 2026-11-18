import { memberQueries } from '@erxes/core-contract/client';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  cn,
  Combobox,
  EntityPicker,
  type Member,
  memberName,
  Popover,
  PopoverScoped,
  RecordTableInlineCell,
  useMembersById,
} from 'erxes-ui';
import { type ComponentProps, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberChip, MemberLine, PersonLine } from './Person.tsx';

// erxes-ui's `SelectMember` draws its members with grey one-letter avatars; these pickers draw
// them as the rest of frontline does (`Person.tsx`).

/**
 * The active team to pick from, each with their avatar, and the picked members outside it
 * (disabled ones) so they can be taken off. One pick replaces the value unless `multiple`.
 */
const MemberOptions = ({
  value,
  onValueChange,
  multiple,
  noneLabel,
  searchPlaceholder,
}: {
  value: string[];
  onValueChange: (ids: string[]) => void;
  multiple?: boolean;
  noneLabel?: string;
  searchPlaceholder?: string;
}) => {
  const team = useQuery(memberQueries.team);
  const active = team.data?.data ?? [];
  const picked = useMembersById(value, memberQueries);

  const others = [...picked.values()].filter(
    (member) => !active.some((teammate) => teammate.id === member.id),
  );

  return (
    <EntityPicker<Member>
      items={[...active, ...others]}
      itemKey={(member) => ({
        id: member.id,
        label: `${memberName(member)} ${member.email ?? ''}`,
      })}
      renderItem={(member) => <PersonLine name={memberName(member)} src={member.avatarUrl} />}
      value={value}
      onValueChange={onValueChange}
      multiple={multiple}
      noneLabel={noneLabel}
      searchPlaceholder={searchPlaceholder}
      loading={team.isPending}
      error={team.error}
    />
  );
};

type OneMember = {
  value: string | null | undefined;
  onValueChange: (id: string | null) => void;
  placeholder?: string;
  /** A first row that picks no member, e.g. "Unassigned". */
  noneLabel?: string;
};

/** The member as a record table cell, or a side panel row with `variant="field"`; click to pick another. */
export const MemberCell = ({
  value,
  onValueChange,
  placeholder,
  noneLabel,
  scope,
  ...trigger
}: OneMember & { scope?: string } & Omit<
    ComponentProps<typeof RecordTableInlineCell.Trigger>,
    'value' | 'children' | 'placeholder'
  >) => {
  const [open, setOpen] = useState(false);

  return (
    <PopoverScoped scope={scope} open={open} onOpenChange={setOpen}>
      <RecordTableInlineCell.Trigger {...trigger}>
        <MemberLine id={value} placeholder={placeholder} />
      </RecordTableInlineCell.Trigger>
      <RecordTableInlineCell.Content>
        <MemberOptions
          value={value ? [value] : []}
          noneLabel={noneLabel}
          onValueChange={([id]) => {
            onValueChange(id ?? null);
            setOpen(false);
          }}
        />
      </RecordTableInlineCell.Content>
    </PopoverScoped>
  );
};

/** A member picker button for a form; its other props (an id, aria wiring) go to the button. */
export const MemberSelect = ({
  value,
  onValueChange,
  placeholder,
  noneLabel,
  className,
  ...trigger
}: OneMember &
  Omit<ComponentProps<typeof Combobox.Trigger>, 'value' | 'children' | 'placeholder'>) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Combobox.Trigger {...trigger} className={cn('w-full', className)}>
        <MemberLine id={value} placeholder={placeholder} />
      </Combobox.Trigger>
      <Combobox.Content>
        <MemberOptions
          value={value ? [value] : []}
          noneLabel={noneLabel}
          onValueChange={([id]) => {
            onValueChange(id ?? null);
            setOpen(false);
          }}
        />
      </Combobox.Content>
    </Popover>
  );
};

/**
 * Team members in a panel row, drawn as core's owner field is: each a chip that opens them in
 * core's side panel, then a muted button that shows on hover to change them; with none, "+ Add".
 * `single` keeps one member and closes on the pick.
 */
export const MembersField = ({
  label,
  value,
  onValueChange,
  single,
  noneLabel,
}: {
  label: string;
  value: string[];
  onValueChange: (ids: string[]) => void;
  single?: boolean;
  noneLabel?: string;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const add = t('add', 'Add');

  return (
    <div className="group/relations flex min-h-7 min-w-0 flex-wrap items-center gap-1 px-1">
      {value.map((id) => (
        <div key={id} className="flex min-w-0 overflow-hidden">
          <MemberChip id={id} />
        </div>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
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
          <MemberOptions
            value={value}
            multiple={!single}
            noneLabel={noneLabel}
            searchPlaceholder={label}
            onValueChange={(ids) => {
              onValueChange(ids);

              if (single) setOpen(false);
            }}
          />
        </RecordTableInlineCell.Content>
      </Popover>
    </div>
  );
};
