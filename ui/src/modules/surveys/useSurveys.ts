import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { useChange, useOptimistic } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

type Outputs = InferClientOutputs<Client>['surveys'];

export type Survey = Outputs['get'];

export type SurveyStatus = Survey['status'];

export type SurveyStep = Survey['steps'][number];

/** The statuses in the order the list groups them: what waits for review first. */
export const SURVEY_STATUSES = [
  'pending',
  'active',
  'rejected',
  'archived',
] as const satisfies readonly SurveyStatus[];

/** Where a survey may go from each status, as the API allows (`api/src/modules/surveys/status.ts`). */
export const MOVES: Record<SurveyStatus, SurveyStatus[]> = {
  pending: ['active', 'rejected'],
  rejected: ['active'],
  active: ['archived'],
  archived: ['active'],
};

/** A status as members read it. */
export const useStatusNames = (): Record<SurveyStatus, string> => {
  const { t } = useTranslation('frontline');

  return {
    pending: t('survey-pending', 'Waiting for review'),
    active: t('active', 'Active'),
    rejected: t('survey-rejected', 'Rejected'),
    archived: t('archived', 'Archived'),
  };
};

/** The surveys of the member's channels, newest first, a page at a time, narrowed by the filter bar. */
export const useSurveys = () => {
  const filter = useListFilterParams();

  return usePaged(
    useInfiniteQuery(
      orpc.surveys.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ ...filter, cursor }),
        ...pageOptions,
      }),
    ),
    (page) => page.surveys,
  );
};

export const useSurvey = (id: string) => useQuery(orpc.surveys.get.queryOptions({ input: { id } }));

/** Refetches every survey query after a change, and shows a refusal. */
export const useSurveyChange = () => useChange(orpc.surveys.key());

/** Saves one change to a survey at a time, refetching the lists after it. */
export const useEditSurvey = (id: string) => {
  const update = useMutation(orpc.surveys.update.mutationOptions(useSurveyChange()));

  return (fields: Omit<Parameters<typeof update.mutate>[0], 'id'>) =>
    update.mutate({ id, ...fields });
};

/**
 * Saves the survey's questions as a whole, shown at once so a drag or a typed option doesn't wait
 * for the API. A new question or option carries an id made here, which the API keeps.
 */
export const useSaveSteps = (id: string) => {
  const queryKey = orpc.surveys.get.queryKey({ input: { id } });

  const update = useMutation({
    mutationFn: (steps: SurveyStep[]) => orpc.surveys.update.call({ id, steps }),
    ...useOptimistic([orpc.surveys.key()], (queryClient, steps: SurveyStep[]) =>
      queryClient.setQueryData(queryKey, (survey) => survey && { ...survey, steps }),
    ),
  });

  return update.mutate;
};

/** Where a survey's questions are built, beside their preview. */
export const surveyBuilderPath = (id: string) =>
  `/${PLUGIN}/surveys/${encodeURIComponent(id)}/builder`;

/** Moves surveys to a status, all of them or none. */
export const useSetSurveyStatus = () =>
  useMutation(orpc.surveys.setStatus.mutationOptions(useSurveyChange()));

/** Asks for "delete" to be typed, then deletes the surveys with their votes. */
export const useDeleteSurveys = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.surveys.remove.mutationOptions(useSurveyChange()));

  const deleteSurveys = async (ids: string[], done?: () => void) => {
    await confirm(
      t('confirm-delete-surveys', {
        defaultValue_one: 'Delete this survey and its votes?',
        defaultValue_other: 'Delete {{count}} surveys and their votes?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteSurveys, isPending: remove.isPending };
};
