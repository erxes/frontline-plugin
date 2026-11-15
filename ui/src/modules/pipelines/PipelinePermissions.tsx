import {
  IconBuildingStore,
  IconEye,
  IconLock,
  IconPencil,
  IconArrowsMove,
  IconSitemap,
  IconUser,
  IconUserShield,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelField, PanelSection, Spinner, Switch, type TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { ReadOnly } from '~/shared/Panel.tsx';
import { MembersField } from '~/shared/Pickers.tsx';
import { WithPipeline } from './PipelinePanel.tsx';
import {
  type Pipeline,
  type Status,
  useEditPipeline,
  usePipelineChange,
  useStatuses,
} from './queries.ts';

type Check = 'isCheckUser' | 'isCheckDepartment' | 'isCheckBranch';

/** Who sees the pipeline's tickets beyond its channel: their own, their team's. */
const VisibilityFields = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditPipeline(pipeline.id);

  const checks: { field: Check; icon: typeof IconUser; label: string }[] = [
    {
      field: 'isCheckUser',
      icon: IconUser,
      label: t('check-user', 'Members see only tickets they created, hold or follow'),
    },
    {
      field: 'isCheckDepartment',
      icon: IconSitemap,
      label: t('check-department', "Members see only their departments' tickets"),
    },
    {
      field: 'isCheckBranch',
      icon: IconBuildingStore,
      label: t('check-branch', "Members see only their branches' tickets"),
    },
  ];

  return (
    <PanelSection title={t('ticket-visibility', 'Ticket visibility')}>
      {checks.map((check) => (
        <PanelField key={check.field} icon={check.icon} label={check.label}>
          <Switch
            aria-label={check.label}
            checked={pipeline[check.field]}
            onCheckedChange={(on) => edit({ [check.field]: on })}
            className="mx-2"
          />
        </PanelField>
      ))}
      <PanelField
        icon={IconUserShield}
        label={t('sees-every-ticket', 'Sees every ticket')}
        cell={false}
      >
        <MembersField
          label={t('sees-every-ticket', 'Sees every ticket')}
          value={pipeline.excludeCheckUserIds}
          onValueChange={(excludeCheckUserIds) => edit({ excludeCheckUserIds })}
        />
      </PanelField>
    </PanelSection>
  );
};

/** One status's privacy, and who may edit and move its tickets; an empty list leaves it open. */
const StatusRights = ({ status }: { status: Status }) => {
  const { t } = useTranslation('frontline');
  const update = useMutation(orpc.pipelines.statuses.update.mutationOptions(usePipelineChange()));

  const save = (fields: Omit<Parameters<typeof update.mutate>[0], 'id'>) =>
    update.mutate({ id: status.id, ...fields });

  const isPrivate = status.visibilityType === 'private';

  return (
    <PanelSection title={status.name}>
      <PanelField icon={IconLock} label={t('status-private', 'Private to its members')}>
        <Switch
          aria-label={t('status-private-of', '{{name}} is private', { name: status.name })}
          checked={isPrivate}
          onCheckedChange={(on) => save({ visibilityType: on ? 'private' : 'public' })}
          className="mx-2"
        />
      </PanelField>
      {isPrivate && (
        <PanelField icon={IconEye} label={t('status-members', 'Who sees it')} cell={false}>
          <MembersField
            label={t('status-members-of', 'Who sees {{name}}', { name: status.name })}
            value={status.memberIds}
            onValueChange={(memberIds) => save({ memberIds })}
          />
        </PanelField>
      )}
      <PanelField
        icon={IconPencil}
        label={t('status-editors', 'Who edits its tickets')}
        cell={false}
      >
        <MembersField
          label={t('status-editors-of', 'Who edits tickets in {{name}}', { name: status.name })}
          value={status.canEditMemberIds}
          onValueChange={(canEditMemberIds) => save({ canEditMemberIds })}
        />
      </PanelField>
      <PanelField
        icon={IconArrowsMove}
        label={t('status-movers', 'Who moves its tickets')}
        cell={false}
      >
        <MembersField
          label={t('status-movers-of', 'Who moves tickets in {{name}}', { name: status.name })}
          value={status.canMoveMemberIds}
          onValueChange={(canMoveMemberIds) => save({ canMoveMemberIds })}
        />
      </PanelField>
    </PanelSection>
  );
};

const StatusesRights = ({ pipelineId }: { pipelineId: string }) => {
  const statuses = useStatuses(pipelineId);

  if (statuses.isPending) return <Spinner area="lg" />;

  return (statuses.data ?? []).map((status) => <StatusRights key={status.id} status={status} />);
};

/**
 * The pipeline's Permissions tab: which tickets its channel's members see, and per status who sees
 * it, who edits its tickets and who moves them. Nobody listed means every member of the channel.
 * Only the channel's admins change it.
 */
export const PipelinePermissions = ({ contentId }: TRecordSlotProps) => (
  <WithPipeline id={contentId}>
    {(pipeline) => (
      <ReadOnly when={!pipeline.canManage}>
        <VisibilityFields pipeline={pipeline} />
        <StatusesRights pipelineId={pipeline.id} />
      </ReadOnly>
    )}
  </WithPipeline>
);
