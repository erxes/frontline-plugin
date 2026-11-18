import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconPaperclip, IconTrash } from '@tabler/icons-react';
import { Button, cn, DragHandle, Label, Switch, Textarea } from 'erxes-ui';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FileList, FilePicker } from '~/shared/Files.tsx';
import { Options, SavedText, saveText } from './QuestionOptions.tsx';
import type { SurveyStep } from './useSurveys.ts';

/** The question's own files, shown with it when it is answered. */
const Attachments = ({
  step,
  onChange,
}: {
  step: SurveyStep;
  onChange: (attachments: SurveyStep['attachments']) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      {step.attachments.length < 5 && (
        <FilePicker
          label={t('survey-attach', 'Attach a file')}
          icon={<IconPaperclip />}
          onUploaded={(file) => onChange([...step.attachments, file])}
        />
      )}
      {step.attachments.length > 0 && (
        <div className="basis-full">
          <FileList
            files={step.attachments}
            onRemove={(file) => onChange(step.attachments.filter((each) => each !== file))}
          />
        </div>
      )}
    </>
  );
};

/** A question's header: its drag handle, its optional name and removing it. */
const QuestionHeader = ({
  step,
  number,
  handle,
  canRemove,
  onChange,
  onRemove,
}: {
  step: SurveyStep;
  number: number;
  handle: ReactNode;
  canRemove: boolean;
  onChange: (step: SurveyStep) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const numbered = t('survey-question-n', 'Question {{n}}', { n: number });

  return (
    <header className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-1">
      {handle}
      <SavedText
        value={step.name}
        optional
        variant="flush"
        text="sm"
        placeholder={numbered}
        aria-label={t('survey-question-name', 'Name of {{question}}', { question: numbered })}
        maxLength={100}
        className="flex-1"
        onSave={(name) => onChange({ ...step, name })}
      />
      {handle && (
        <Button
          variant="ghost"
          size="icon"
          disabled={!canRemove}
          aria-label={t('survey-remove-question', 'Remove {{question}}', {
            question: step.question,
          })}
          onClick={onRemove}
        >
          <IconTrash />
        </Button>
      )}
    </header>
  );
};

/** What a question asks, the line under it, its options, several picks or one, and its files. */
const QuestionBody = ({
  step,
  channelId,
  onChange,
}: {
  step: SurveyStep;
  channelId: string;
  onChange: (step: SurveyStep) => void;
}) => {
  const { t } = useTranslation('frontline');
  const multiselectId = useId();

  const saveDescription = saveText(
    step.description,
    (description) => onChange({ ...step, description }),
    true,
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <SavedText
        value={step.question}
        aria-label={t('survey-question', 'Question')}
        placeholder={t('survey-question-placeholder', 'What do you ask?')}
        maxLength={300}
        onSave={(question) => onChange({ ...step, question })}
      />
      <Textarea
        key={step.description}
        defaultValue={step.description}
        rows={2}
        aria-label={t('description', 'Description')}
        placeholder={t('survey-description-placeholder', 'A line under the question')}
        onBlur={(event) => saveDescription(event.currentTarget)}
      />
      <Options
        step={step}
        channelId={channelId}
        onChange={(options) => onChange({ ...step, options })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          id={multiselectId}
          checked={step.allowMultiselect}
          onCheckedChange={(allowMultiselect) => onChange({ ...step, allowMultiselect })}
        />
        <Label htmlFor={multiselectId} className="mr-auto">
          {t('survey-multiselect', 'Several picks')}
        </Label>
        <Attachments step={step} onChange={(attachments) => onChange({ ...step, attachments })} />
      </div>
    </div>
  );
};

/**
 * One question of the builder, dragged by its handle: an optional name, what it asks, a line under
 * it, its options with their ticket rules, several picks or one, and its files. Every change
 * saves the questions at once.
 */
export const QuestionCard = ({
  step,
  number,
  channelId,
  canManage,
  canRemove,
  onChange,
  onRemove,
}: {
  step: SurveyStep;
  number: number;
  channelId: string;
  canManage: boolean;
  canRemove: boolean;
  onChange: (step: SurveyStep) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: step.id,
    disabled: !canManage,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={step.question}
      style={{
        '--sortable-transform': CSS.Translate.toString(transform),
        '--sortable-transition': transition,
      }}
      className={cn(
        'sortable flex flex-col rounded-lg border bg-background',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <fieldset disabled={!canManage} className="contents">
        <QuestionHeader
          step={step}
          number={number}
          handle={
            canManage && (
              <DragHandle
                aria-label={t('survey-move-question', 'Move {{question}}', {
                  question: step.question,
                })}
                {...attributes}
                {...listeners}
              />
            )
          }
          canRemove={canRemove}
          onChange={onChange}
          onRemove={onRemove}
        />
        <QuestionBody step={step} channelId={channelId} onChange={onChange} />
      </fieldset>
    </section>
  );
};
