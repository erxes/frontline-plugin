import {
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconClockHour4,
  IconDots,
  IconLetterCase,
  IconMessageX,
  IconProgressCheck,
  IconSend,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import {
  Button,
  NumberField,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChannelSelect } from '~/shared/ChannelSelect.tsx';
import { InfoRow, PageLink, PanelSkeleton, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { StatusBadge, useSurveyActions } from './SurveyCells.tsx';
import { type Survey, surveyBuilderPath, useEditSurvey, useSurvey } from './useSurveys.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the survey's title. */
export const SurveyTitleSlot = ({ contentId }: TRecordSlotProps) => {
  const survey = useSurvey(contentId);

  if (survey.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{survey.data?.title ?? survey.error?.message}</span>;
};

const SurveyMenu = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const actions = useSurveyActions(survey);

  if (actions.length === 0) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('survey-menu', 'Survey actions')}>
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** The header's menu, for its channel's admins: move it between statuses, or delete it. */
export const SurveyActions = ({ contentId }: TRecordSlotProps) => {
  const survey = useSurvey(contentId).data;

  return survey ? <SurveyMenu survey={survey} /> : null;
};

/** What the team calls it, where it lives, and how long voting stays open once sent. */
const General = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditSurvey(survey.id);

  return (
    <PanelSection title={t('survey', 'Survey')}>
      <PanelField icon={IconLetterCase} label={t('title', 'Title')}>
        <TextField
          scope={`frontline-survey.${survey.id}.title`}
          value={survey.title}
          placeholder={t('title', 'Title')}
          onSave={(title) => {
            const next = title.trim();

            if (next && next !== survey.title) edit({ title: next });
          }}
        />
      </PanelField>
      <PanelField icon={IconCircles} label={t('channel', 'Channel')}>
        <ChannelSelect value={survey.channelId} onChange={(channelId) => edit({ channelId })} />
      </PanelField>
      <PanelField icon={IconClockHour4} label={t('survey-duration', 'Open for')}>
        <NumberField
          scope={`frontline-survey.${survey.id}.duration`}
          value={survey.durationHours ?? 0}
          formatValue={(hours) =>
            hours ? t('n-hours', '{{count}} h', { count: hours }) : t('survey-no-limit', 'No limit')
          }
          onSave={(hours) => edit({ durationHours: hours > 0 ? Math.min(hours, 768) : null })}
        />
      </PanelField>
    </PanelSection>
  );
};

/** Where it stands, how it was received, and its history. */
const Overview = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (
    <PanelSection title={t('survey-overview', 'Overview')}>
      <PageLink
        to={surveyBuilderPath(survey.id)}
        label={t('survey-questions', 'Questions')}
        count={survey.steps.length}
      />
      <InfoRow icon={IconProgressCheck} label={t('status', 'Status')}>
        <StatusBadge status={survey.status} />
      </InfoRow>
      {survey.rejectionReason && (
        <InfoRow icon={IconMessageX} label={t('survey-rejection-reason', 'Why rejected')}>
          {survey.rejectionReason}
        </InfoRow>
      )}
      <InfoRow icon={IconUsers} label={t('survey-votes', 'Votes')}>
        {survey.voteCount}
      </InfoRow>
      <InfoRow icon={IconSend} label={t('survey-sent', 'Sent')}>
        {survey.sentCount}
      </InfoRow>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={survey.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(survey.createdAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarUp} label={t('updated-at', 'Updated at')}>
        {format.dateTime(survey.updatedAt)}
      </InfoRow>
    </PanelSection>
  );
};

/** Reads the survey, then draws `render` with it, a spinner or the refusal. */
export const WithSurvey = ({
  contentId,
  render,
}: {
  contentId: string;
  render: (survey: Survey) => ReactNode;
}) => {
  const survey = useSurvey(contentId);

  if (survey.isPending) return <PanelSkeleton />;

  if (survey.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {survey.error.message}
      </p>
    );

  return render(survey.data);
};

/** The Detail tab: the survey's settings, each saved as soon as it changes, then its overview. */
export const SurveyDetail = ({ contentId }: TRecordSlotProps) => (
  <WithSurvey
    contentId={contentId}
    render={(survey) => (
      <>
        <ReadOnly when={!survey.canManage}>
          <General survey={survey} />
        </ReadOnly>
        <Overview survey={survey} />
      </>
    )}
  />
);
