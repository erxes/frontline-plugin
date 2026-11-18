import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconChecklist, IconPlus } from '@tabler/icons-react';
import { Button, PageContainer, ScrollArea, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useListDrag } from '~/shared/drag.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { ListError } from '~/shared/List.tsx';
import { QuestionCard } from './QuestionCard.tsx';
import { SurveyPreview } from './SurveyPreview.tsx';
import { type Survey, useSaveSteps, useSurvey } from './useSurveys.ts';

const SURVEYS_PATH = '/frontline/surveys';

/** The questions in order, dragged by their handles or moved with the keyboard, and adding one. */
const Questions = ({ survey }: { survey: Survey }) => {
  const { t } = useTranslation('frontline');
  const save = useSaveSteps(survey.id);
  const { steps } = survey;

  const drag = useListDrag((id) => steps.find((step) => step.id === id)?.question ?? '');

  const dragEnd = ({ active, over }: DragEndEvent) => {
    const from = steps.findIndex((step) => step.id === active.id);
    const to = steps.findIndex((step) => step.id === over?.id);

    if (from >= 0 && to >= 0 && from !== to) save(arrayMove(steps, from, to));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <DndContext {...drag} onDragEnd={dragEnd}>
        <SortableContext
          items={steps.map((step) => step.id)}
          strategy={verticalListSortingStrategy}
        >
          {steps.map((step, index) => (
            <QuestionCard
              key={step.id}
              step={step}
              number={index + 1}
              channelId={survey.channelId}
              canManage={survey.canManage}
              canRemove={steps.length > 1}
              onChange={(next) => save(steps.with(index, next))}
              onRemove={() => save(steps.toSpliced(index, 1))}
            />
          ))}
        </SortableContext>
      </DndContext>
      {survey.canManage && steps.length < 10 && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() =>
            save([
              ...steps,
              {
                id: crypto.randomUUID(),
                name: '',
                description: '',
                question: t('survey-new-question', 'New question'),
                attachments: [],
                allowMultiselect: false,
                options: [
                  { id: crypto.randomUUID(), text: t('yes', 'Yes'), ticket: null },
                  { id: crypto.randomUUID(), text: t('no', 'No'), ticket: null },
                ],
              },
            ])
          }
        >
          <IconPlus />
          {t('survey-add-question', 'Add question')}
        </Button>
      )}
    </div>
  );
};

/**
 * A survey's questions beside the survey as a voter reads it. Like the form builder, each change
 * saves as it is made, and the preview shows it at once.
 */
export const SurveyBuilderPage = () => {
  const { t } = useTranslation('frontline');
  const id = useParams().id ?? '';
  const survey = useSurvey(id);

  return (
    <PageContainer>
      <AppHeader
        icon={IconChecklist}
        app={{ label: t('surveys', 'Surveys'), to: SURVEYS_PATH }}
        levels={[
          {
            label: survey.data?.title ?? '…',
            to: `${SURVEYS_PATH}/${encodeURIComponent(id)}`,
          },
          { label: t('survey-questions', 'Questions') },
        ]}
      />
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6 lg:flex-row lg:items-start">
          {survey.error ? (
            <ListError error={survey.error} />
          ) : survey.data ? (
            <>
              <Questions survey={survey.data} />
              <div className="min-w-0 flex-1 lg:sticky lg:top-0">
                <SurveyPreview survey={survey.data} />
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-80 flex-1" />
              <Skeleton className="h-80 flex-1" />
            </>
          )}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
