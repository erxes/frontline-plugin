import { IconArchive, IconCheck, IconRestore, IconTrash, IconX } from '@tabler/icons-react';
import { Badge, Button, useOpenRecord } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SURVEY_TYPE } from '~/plugin.ts';
import type { RowAction } from '~/shared/Records.tsx';
import {
  MOVES,
  type Survey,
  type SurveyStatus,
  useDeleteSurveys,
  useSetSurveyStatus,
  useStatusNames,
} from './useSurveys.ts';

const badges = {
  pending: 'warning',
  active: 'success',
  rejected: 'destructive',
  archived: 'muted',
} as const satisfies Record<SurveyStatus, string>;

/** The status as a badge. */
export const StatusBadge = ({ status }: { status: SurveyStatus }) => (
  <Badge variant={badges[status]}>{useStatusNames()[status]}</Badge>
);

/** The title opens the survey in core's side panel. */
export const SurveyTitle = ({ survey }: { survey: Pick<Survey, 'id' | 'title'> }) => {
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: SURVEY_TYPE, contentId: survey.id })}
    >
      <span className="truncate">{survey.title}</span>
    </Button>
  );
};

/** What a move to each status is called and drawn with. */
const useMoveLabels = (): Record<SurveyStatus, { label: string; icon: ReactNode }> => {
  const { t } = useTranslation('frontline');

  return {
    pending: { label: t('survey-send-back', 'Send back for review'), icon: null },
    active: { label: t('activate', 'Activate'), icon: <IconRestore /> },
    rejected: { label: t('survey-reject', 'Reject'), icon: <IconX /> },
    archived: { label: t('archive', 'Archive'), icon: <IconArchive /> },
  };
};

/**
 * What a channel admin does with a survey: approve or reject a request, archive or reactivate it,
 * and delete it. Others get nothing.
 */
export const useSurveyActions = (
  survey: Pick<Survey, 'id' | 'status' | 'canManage'>,
): RowAction[] => {
  const { t } = useTranslation('frontline');
  const labels = useMoveLabels();
  const setStatus = useSetSurveyStatus();
  const { deleteSurveys } = useDeleteSurveys();

  if (!survey.canManage) return [];

  return [
    ...MOVES[survey.status].map((status) => ({
      value: status,
      icon:
        survey.status === 'pending' && status === 'active' ? <IconCheck /> : labels[status].icon,
      label:
        survey.status === 'pending' && status === 'active'
          ? t('survey-approve', 'Approve')
          : labels[status].label,
      onSelect: () => setStatus.mutate({ ids: [survey.id], status }),
    })),
    {
      value: 'delete',
      icon: <IconTrash />,
      label: t('delete', 'Delete'),
      onSelect: () => void deleteSurveys([survey.id]),
    },
  ];
};
