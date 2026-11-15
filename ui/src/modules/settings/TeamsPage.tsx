import { memberQueries } from '@erxes/core-contract/client';
import type { InferClientOutputs } from '@orpc/client';
import {
  IconBuildingStore,
  IconCalendarPlus,
  IconCode,
  IconDots,
  IconHierarchy,
  IconLetterCase,
  IconPlus,
  IconSitemap,
  IconUserStar,
  IconUsers,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { Button, Input, SelectMember, TextField, useListFilterParams } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FormSheet } from '~/shared/FormSheet.tsx';
import { textOf } from '~/shared/hooks.ts';
import { MembersField, PickerField } from '~/shared/Pickers.tsx';
import { useTeams } from '@/tickets/TicketLinks.tsx';
import { column, DateCell } from '~/shared/Table.tsx';
import {
  DeleteRowAction,
  SettingsList,
  SheetField,
  useCanManageSettings,
  useDeleteRow,
  useSettingsChange,
} from './Settings.tsx';

type Team = InferClientOutputs<Client>['teams']['get'];

type Kind = Team['kind'];

const useUpdateTeam = () => useMutation(orpc.teams.update.mutationOptions(useSettingsChange()));

/** A text column of the team, saved when it changes; an empty code clears it. */
const TextCell = ({ team, field }: { team: Team; field: 'name' | 'code' }) => {
  const update = useUpdateTeam();
  const value = team[field] ?? '';

  return (
    <TextField
      scope={`frontline-teams.${team.id}.${field}`}
      value={value}
      placeholder={field}
      onSave={(text) => {
        const next = text.trim();

        if (next === value) return;

        if (field === 'name') {
          if (next) update.mutate({ id: team.id, name: next });
        } else update.mutate({ id: team.id, code: next || null });
      }}
    />
  );
};

/** The team it sits under: another of its kind. */
const ParentCell = ({ team }: { team: Team }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTeam();
  const teams = useTeams(team.kind);

  return (
    <PickerField
      label={t('parent', 'Parent')}
      placeholder={t('none', 'None')}
      display={
        <span className="truncate">{teams.find((row) => row.id === team.parentId)?.name}</span>
      }
      options={teams
        .filter((row) => row.id !== team.id)
        .map((row) => ({ value: row.id, label: row.name }))}
      value={team.parentId ? [team.parentId] : []}
      onValueChange={([parentId]) => update.mutate({ id: team.id, parentId: parentId ?? null })}
      noneLabel={t('none', 'None')}
    />
  );
};

const SupervisorCell = ({ team }: { team: Team }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTeam();

  return (
    <SelectMember.InlineCell
      scope={`frontline-teams.${team.id}.supervisor`}
      value={team.supervisorId}
      onValueChange={(supervisorId) => update.mutate({ id: team.id, supervisorId })}
      members={memberQueries}
      noneLabel={t('nobody', 'Nobody')}
      placeholder={t('nobody', 'Nobody')}
    />
  );
};

const MembersCell = ({ team }: { team: Team }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTeam();

  return (
    <MembersField
      label={t('members', 'Members')}
      value={team.memberIds}
      onValueChange={(memberIds) => update.mutate({ id: team.id, memberIds })}
    />
  );
};

const MoreCell = ({ team }: { team: Team }) => {
  const { t } = useTranslation('frontline');
  const remove = useMutation(orpc.teams.remove.mutationOptions(useSettingsChange()));
  const deleteRow = useDeleteRow(remove.mutate);

  return (
    <DeleteRowAction
      label={t('team-actions', 'Actions for {{name}}', { name: team.name })}
      onDelete={() =>
        void deleteRow(team.id, t('delete-team-confirm', 'Delete {{name}}?', { name: team.name }))
      }
    />
  );
};

const useLabels = (kind: Kind) => {
  const { t } = useTranslation('frontline');

  return kind === 'department'
    ? {
        page: t('departments', 'Departments'),
        all: t('all-departments', 'All departments'),
        add: t('add-department', 'Add department'),
        empty: t('no-departments-yet', 'No departments yet'),
        hint: t(
          'departments-empty',
          'A department groups members; its supervisor sees its tickets.',
        ),
        icon: <IconSitemap />,
      }
    : {
        page: t('branches', 'Branches'),
        all: t('all-branches', 'All branches'),
        add: t('add-branch', 'Add branch'),
        empty: t('no-branches-yet', 'No branches yet'),
        hint: t(
          'branches-empty',
          'A branch is an office or store; pipelines can limit tickets to it.',
        ),
        icon: <IconBuildingStore />,
      };
};

const AddTeam = ({ kind }: { kind: Kind }) => {
  const { t } = useTranslation('frontline');
  const labels = useLabels(kind);
  const [open, setOpen] = useState(false);
  const { onSuccess, onError } = useSettingsChange();

  const create = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async () => {
        await onSuccess();
        setOpen(false);
      },
      onError,
    }),
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        {labels.add}
      </Button>
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={labels.add}
        submitting={create.isPending}
        error={create.error}
        onSubmit={(form) =>
          create.mutate({
            kind,
            name: textOf(form.get('name')).trim(),
            code: textOf(form.get('code')).trim() || null,
          })
        }
      >
        <SheetField label={t('name', 'Name')}>
          <Input name="name" required aria-label={t('name', 'Name')} />
        </SheetField>
        <SheetField label={t('code', 'Code')}>
          <Input name="code" aria-label={t('code', 'Code')} />
        </SheetField>
      </FormSheet>
    </>
  );
};

const useColumns = (canManage: boolean) => {
  const { t } = useTranslation('frontline');

  return [
    ...(canManage
      ? [column<Team>('more', '', IconDots, 33, (team) => <MoreCell team={team} />)]
      : []),
    column<Team>('name', t('name', 'Name'), IconLetterCase, 220, (team) => (
      <TextCell team={team} field="name" />
    )),
    column<Team>('code', t('code', 'Code'), IconCode, 120, (team) => (
      <TextCell team={team} field="code" />
    )),
    column<Team>('parent', t('parent', 'Parent'), IconHierarchy, 180, (team) => (
      <ParentCell team={team} />
    )),
    column<Team>('supervisor', t('supervisor', 'Supervisor'), IconUserStar, 180, (team) => (
      <SupervisorCell team={team} />
    )),
    column<Team>('members', t('members', 'Members'), IconUsers, 260, (team) => (
      <MembersCell team={team} />
    )),
    column<Team>('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 140, (team) => (
      <DateCell date={team.createdAt} />
    )),
  ];
};

/**
 * Settings › Departments or Branches: the teams pipelines limit tickets to, with their members
 * and supervisor, edited in place.
 */
export const TeamsPage = ({ kind }: { kind: Kind }) => {
  const { t } = useTranslation('frontline');
  const labels = useLabels(kind);
  const { filter, search } = useListFilterParams();
  const canManage = useCanManageSettings();
  const teams = useQuery(orpc.teams.list.queryOptions({ input: { kind, filter, search } }));
  const rows = teams.data ?? [];

  return (
    <SettingsList
      canManage={canManage}
      id={`frontline-${kind}`}
      label={labels.page}
      allLabel={labels.all}
      action={<AddTeam kind={kind} />}
      fields={[
        { path: 'subject.name', label: t('name', 'Name'), type: 'text', icon: IconLetterCase },
        { path: 'subject.code', label: t('code', 'Code'), type: 'text', icon: IconCode },
        {
          path: 'subject.supervisorId',
          label: t('supervisor', 'Supervisor'),
          type: 'member',
          icon: IconUserStar,
        },
        {
          path: 'subject.memberIds',
          label: t('members', 'Members'),
          type: 'member',
          icon: IconUsers,
        },
        {
          path: 'subject.createdAt',
          label: t('created-at', 'Created at'),
          type: 'date',
          icon: IconCalendarPlus,
        },
      ]}
      columns={useColumns(canManage)}
      rows={rows}
      isPending={teams.isPending}
      error={teams.error}
      empty={{ icon: labels.icon, title: labels.empty, description: labels.hint }}
    />
  );
};
