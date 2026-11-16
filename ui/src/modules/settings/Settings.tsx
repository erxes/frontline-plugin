import { IconSettings, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Label,
  ListFilter,
  PageContainer,
  PageHeader,
  RecordTable,
  type RecordTableColumnDef,
  Separator,
  type TListFilterField,
  ViewBar,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { memberQueries } from '@erxes/core-contract/client';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { ReadOnly } from '~/shared/Panel.tsx';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, useConfirmDelete } from '~/shared/Records.tsx';
import { Rows } from '~/shared/Table.tsx';

/** Whether the member manages tags and ticket properties; others read them. */
export const useCanManageSettings = () =>
  useQuery(orpc.settings.access.queryOptions()).data?.canManage ?? false;

/** A change to settings: refetches everything, since tickets show tags, teams and properties. */
export const useSettingsChange = () => useChange(orpc.key());

/** Asks for "delete" to be typed, then calls `remove` with the one id. */
export const useDeleteRow = (remove: (input: { ids: string[] }) => void) => {
  const confirm = useConfirmDelete();

  return async (id: string, message: string) => {
    await confirm(message);
    remove({ ids: [id] });
  };
};

/** A row's Delete in its actions menu. */
export const DeleteRowAction = ({ label, onDelete }: { label: string; onDelete: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <RowActions
      label={label}
      actions={[
        { value: 'delete', icon: <IconTrash />, label: t('delete', 'Delete'), onSelect: onDelete },
      ]}
    />
  );
};

/** One field of a settings sheet: its label above the control. */
export const SheetField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <Label>{label}</Label>
    {children}
  </div>
);

/** A settings page's header: Settings, then the page, and its one primary action. */
const SettingsHeader = ({ label, children }: { label: string; children?: ReactNode }) => {
  const { t } = useTranslation('frontline');

  return (
    <PageHeader>
      <PageHeader.Start>
        <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
          <IconSettings />
          {t('settings', 'Settings')}
        </span>
        <Separator.Inline />
        <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">{label}</span>
      </PageHeader.Start>
      {children && <PageHeader.End>{children}</PageHeader.End>}
    </PageHeader>
  );
};

/**
 * A settings list, as core's Settings › Tags draws one: the header with its add button, the list
 * bar with its filter, then the table of every row. A member who can't manage settings reads it,
 * its cells disabled unless `readOnly` is false, for rows that only open their record.
 */
export const SettingsList = <TRow extends object>({
  id,
  canManage,
  readOnly = !canManage,
  label,
  allLabel,
  action,
  fields,
  columns,
  rows,
  isPending,
  error,
  empty,
}: {
  id: string;
  canManage: boolean;
  readOnly?: boolean;
  label: string;
  allLabel: string;
  action: ReactNode;
  fields: TListFilterField[];
  columns: RecordTableColumnDef<TRow>[];
  rows: TRow[];
  isPending: boolean;
  error: Error | null;
  empty: { icon: ReactNode; title: string; description: string };
}) => (
  <PageContainer>
    <SettingsHeader label={label}>{canManage && action}</SettingsHeader>
    <ViewBar allLabel={allLabel}>
      <ListFilter id={id} fields={fields} members={memberQueries} totalCount={rows.length} />
    </ViewBar>
    {error ? (
      <p className="m-3 text-sm text-destructive-text">{error.message}</p>
    ) : !isPending && rows.length === 0 ? (
      <ListEmpty icon={empty.icon} title={empty.title} description={empty.description} />
    ) : (
      <ReadOnly when={readOnly}>
        <RecordTable.Provider
          key={String(canManage)}
          tableId={id.replaceAll('-', '_')}
          columns={columns}
          data={rows}
          className="m-3"
        >
          <Rows isPending={isPending} />
        </RecordTable.Provider>
      </ReadOnly>
    )}
  </PageContainer>
);
