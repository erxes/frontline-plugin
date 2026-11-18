import { IconSettings, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Label,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  type TListFilterField,
  ViewBar,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { memberQueries } from '@erxes/core-contract/client';
import { orpc } from '~/orpc.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { useChange } from '~/shared/hooks.ts';
import { ReadOnly } from '~/shared/Panel.tsx';
import { ListEmpty } from '~/shared/List.tsx';
import { RowActions, useConfirmDelete } from '~/shared/Records.tsx';
import { Rows } from '~/shared/Table.tsx';

/** Whether the member manages the settings every channel shares; others read them. */
export const useCanManageSettings = () =>
  useQuery(orpc.settings.access.queryOptions()).data?.canManage ?? false;

/** A change to tags: refetches every tag list, which the pickers and badges read names from. */
export const useTagChange = () => useChange(orpc.tags.key());

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
    <AppHeader icon={IconSettings} app={{ label: t('settings', 'Settings') }} levels={[{ label }]}>
      {children}
    </AppHeader>
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
