import { IconTrash } from '@tabler/icons-react';
import {
  Button,
  Combobox,
  Command,
  CommandBar,
  Popover,
  RecordTable,
  RecordTableInlineCell,
  Separator,
  useConfirm,
} from 'erxes-ui';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type RowAction = { value: string; icon: ReactNode; label: string; onSelect: () => void };

/** A menu of actions that `trigger`, a button, opens; picking one closes it. */
export const ActionsMenu = ({
  trigger,
  actions,
}: {
  trigger: ComponentProps<typeof Popover.Trigger>['render'];
  actions: RowAction[];
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Combobox.Content>
        <Command shouldFilter={false}>
          <Command.List>
            {actions.map((action) => (
              <Command.Item
                key={action.value}
                value={action.value}
                onSelect={() => {
                  setOpen(false);
                  action.onSelect();
                }}
              >
                {action.icon} {action.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </Combobox.Content>
    </Popover>
  );
};

/** A row's actions behind the table's "more" button; `label` names the row for screen readers. */
export const RowActions = ({ label, actions }: { label: string; actions: RowAction[] }) => (
  <ActionsMenu
    trigger={<RecordTable.MoreButton className="size-full" aria-label={label} />}
    actions={actions}
  />
);

/** Secondary text, such as a description, cut to the cell's width. */
export const TextCell = ({ value }: { value: string | null }) => (
  <RecordTableInlineCell>
    <span className="text-muted-foreground truncate">{value}</span>
  </RecordTableInlineCell>
);

export type BulkActions = (selected: string[], clear: () => void) => ReactNode;

/**
 * The bar under a table while rows are selected: how many, and what `children`
 * do with their ids. `clear` unselects them.
 */
export const SelectionBar = ({ children }: { children: BulkActions }) => {
  const { table } = RecordTable.useRecordTable();

  const selected = RecordTable.useRecordTableState((_, current) =>
    current.getFilteredSelectedRowModel().rows.map((row) => row.id),
  );

  return (
    <BulkBar selected={selected} clear={() => table.resetRowSelection()}>
      {children}
    </BulkBar>
  );
};

/** The selection bar itself: how many `selected`, and what `children` do with them. */
export const BulkBar = ({
  selected,
  clear,
  children,
}: {
  selected: string[];
  clear: () => void;
  children: BulkActions;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <CommandBar open={selected.length > 0}>
      <CommandBar.Bar>
        <CommandBar.Value onClose={clear}>
          {t('n-selected', { defaultValue: '{{count}} selected', count: selected.length })}
        </CommandBar.Value>
        <Separator.Inline />
        {children(selected, clear)}
      </CommandBar.Bar>
    </CommandBar>
  );
};

/** The bar's delete button, or `label` for a softer removal. */
export const DeleteButton = ({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <Button variant="secondary" tone="destructive" disabled={disabled} onClick={onClick}>
      <IconTrash />
      {label ?? t('delete', 'Delete')}
    </Button>
  );
};

/** Asks for "delete" to be typed under `message`; resolves when the member confirms. */
export const useConfirmDelete = () => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  return (message: string) =>
    confirm({
      message,
      options: {
        confirmationValue: 'delete',
        okLabel: t('delete', 'Delete'),
        description: t('action-permanent', 'This action is permanent and cannot be undone.'),
      },
    });
};
