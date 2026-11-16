import { IconChecklist } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, DropdownMenu, IconTip, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { SURVEY_TYPE } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { useSurvey } from './useSurveys.ts';

/**
 * The composer's survey button: posts one of the channel's active surveys into the conversation
 * for its customer to vote on. Hidden where the member can't send one or the customer can't vote.
 */
export const SendSurvey = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');
  const surveys = useQuery(orpc.surveys.sendable.queryOptions({ input: { conversationId } })).data;
  const send = useMutation(orpc.surveys.send.mutationOptions(useChange(orpc.conversations.key())));
  const label = t('send-survey', 'Send survey');

  if (!surveys?.length) return null;

  return (
    <DropdownMenu>
      <IconTip label={label}>
        <DropdownMenu.Trigger
          render={
            <Button type="button" variant="ghost" size="icon" aria-label={label}>
              <IconChecklist />
            </Button>
          }
        />
      </IconTip>
      <DropdownMenu.Content align="start">
        {surveys.map((survey) => (
          <DropdownMenu.Item
            key={survey.id}
            disabled={send.isPending}
            onClick={() => send.mutate({ id: survey.id, conversationId })}
          >
            {survey.title}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** Under a sent survey's message: its title and votes so far, opening the survey. */
export const SentSurvey = ({ surveyId }: { surveyId: string }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const survey = useSurvey(surveyId).data;

  if (!survey) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => open({ contentType: SURVEY_TYPE, contentId: survey.id })}
    >
      <IconChecklist />
      {survey.title}{' '}
      <span className="text-muted-foreground">
        {t('survey-vote-count', { defaultValue: '{{count}} votes', count: survey.voteCount })}
      </span>
    </Button>
  );
};
