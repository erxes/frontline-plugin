import { isShown, showsCallout, unanswered } from '@frontline/api/logic';
import { useCallback, useState } from 'preact/hooks';
import { useText } from '../shared/text.ts';
import type { Answer, Field, FormApi, VisitorForm } from './api.ts';
import { FieldRow, searches } from './Field.tsx';

/** What the visitor reads before the form, unless the form skips it. */
const Callout = ({ form, onStart }: { form: VisitorForm['form']; onStart: () => void }) => (
  <div class="fl-callout">
    {form.calloutImage && <img src={form.calloutImage.url} alt="" />}
    {form.calloutTitle && <h2>{form.calloutTitle}</h2>}
    {form.calloutBody && <p>{form.calloutBody}</p>}
    <button type="button" class="fl-primary" onClick={onStart}>
      {form.calloutButtonText || 'Start'}
    </button>
  </div>
);

/** What the visitor reads once they sent the form. */
const Thanks = ({ form }: { form: VisitorForm['form'] }) => (
  <div class="fl-callout" role="status">
    {form.thankImage && <img src={form.thankImage.url} alt="" />}
    <h2>{form.thankTitle || 'Thank you'}</h2>
    {form.thankContent && <p>{form.thankContent}</p>}
  </div>
);

/**
 * The visitor's answers, the step they are on, and sending: each step checks its required
 * fields, the last sends, and the API's refusals show under their fields.
 */
const useAnswers = (api: FormApi, fields: Field[], onSent: (submissionId: string) => void) => {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { messageOf } = useText();
  const steps = Math.max(1, ...fields.map((field) => field.pageNumber));
  const shown = fields.filter((field) => field.pageNumber === step && isShown(field, answers));

  const setAnswer = useCallback((fieldId: string, value: Answer) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors(({ [fieldId]: _fixed, ...rest }) => rest);
  }, []);

  const send = async () => {
    setSending(true);
    setFailure(null);

    try {
      const sent = await api.submit(answers);

      if (sent.submissionId) {
        onSent(sent.submissionId);

        return;
      }

      setErrors(Object.fromEntries(sent.errors.map((error) => [error.fieldId, error.message])));

      const first = fields.find((field) => sent.errors.some((error) => error.fieldId === field.id));

      if (first) setStep(first.pageNumber);
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setSending(false);
    }
  };

  /**
   * Checks the step's required fields and the text typed into searchable lists, then moves on,
   * or sends on the last step.
   */
  const next = async () => {
    const refused = shown.flatMap((field): [string, string][] => {
      const answer = answers[field.id];

      if (unanswered(answer)) return field.isRequired ? [[field.id, 'This field is required']] : [];

      return searches(field) && typeof answer === 'string' && !field.options.includes(answer)
        ? [[field.id, 'Pick one of the options']]
        : [];
    });

    if (refused.length > 0) {
      setErrors(Object.fromEntries(refused));

      return;
    }

    if (step < steps) setStep(step + 1);
    else await send();
  };

  return { answers, errors, step, steps, shown, sending, failure, setAnswer, setStep, next };
};

/** A form: its callout, its fields step by step, and its thanks once sent. */
export const FormView = ({
  api,
  visitorForm: { form, fields },
  onSent,
}: {
  api: FormApi;
  visitorForm: VisitorForm;
  onSent: (submissionId: string) => void;
}) => {
  const callout = showsCallout(form);
  const [stage, setStage] = useState<'callout' | 'form' | 'thanks'>(callout ? 'callout' : 'form');

  const state = useAnswers(api, fields, (submissionId) => {
    setStage('thanks');
    onSent(submissionId);
  });

  if (stage === 'callout') return <Callout form={form} onStart={() => setStage('form')} />;

  if (stage === 'thanks') return <Thanks form={form} />;

  const about = form.steps[state.step - 1];

  return (
    <form
      class="fl-form"
      aria-label={form.title || form.name}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void state.next();
      }}
    >
      {form.title && <h2>{form.title}</h2>}
      {form.description && <p>{form.description}</p>}
      {state.steps > 1 && (
        <p class="fl-step">
          {about?.name || `Step ${state.step} of ${state.steps}`}
          {about?.description && <small>{about.description}</small>}
        </p>
      )}
      <div class="fl-fields">
        {state.shown.map((field) => (
          <FieldRow
            key={field.id}
            api={api}
            field={field}
            value={state.answers[field.id]}
            error={state.errors[field.id]}
            setAnswer={state.setAnswer}
          />
        ))}
      </div>
      {state.failure && (
        <p class="fl-error" role="alert">
          {state.failure}
        </p>
      )}
      <div class="fl-actions">
        {state.step > 1 && (
          <button type="button" class="fl-secondary" onClick={() => state.setStep(state.step - 1)}>
            Back
          </button>
        )}
        <button type="submit" class="fl-primary" disabled={state.sending}>
          {state.step < state.steps ? 'Next' : form.buttonText || 'Send'}
        </button>
      </div>
    </form>
  );
};
