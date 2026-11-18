import { useEffect, useState } from 'preact/hooks';
import type { MessengerApi, Survey } from '../api.ts';
import { Files } from '../Thread.tsx';
import { messageOf } from '../../shared/uploads.tsx';
import styles from './survey.css?inline';

type Step = Survey['steps'][number];

/** Whether two picks hold the same options, in any order. */
const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** One question: one pick or several, as its options say. */
const Question = ({
  step,
  picked,
  disabled,
  onChange,
  urlOf,
}: {
  step: Step;
  picked: string[];
  disabled: boolean;
  onChange: (picked: string[]) => void;
  urlOf: (url: string) => string;
}) => {
  const own = step.options.map((option) => option.id);
  const others = picked.filter((id) => !own.includes(id));

  return (
    <fieldset class="fl-question" disabled={disabled}>
      <legend>
        {step.name && <small>{step.name}</small>}
        {step.question}
      </legend>
      {step.description && <p>{step.description}</p>}
      {step.attachments.length > 0 && <Files files={step.attachments} urlOf={urlOf} />}
      {step.options.map((option) => {
        const mine = picked.includes(option.id);

        return (
          <label key={option.id} class={mine ? 'fl-option fl-picked' : 'fl-option'}>
            <input
              type={step.allowMultiselect ? 'checkbox' : 'radio'}
              name={step.id}
              checked={mine}
              onChange={(event) => {
                const kept = step.allowMultiselect
                  ? picked.filter((id) => id !== option.id)
                  : others;

                onChange(event.currentTarget.checked ? [...kept, option.id] : kept);
              }}
            />
            {option.text}
          </label>
        );
      })}
    </fieldset>
  );
};

/** The survey in message `messageId` and the visitor's saved picks, read once. */
const useSurvey = (api: MessengerApi, token: string, messageId: string) => {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void api
      .as(token)
      .get(`surveys/${encodeURIComponent(messageId)}`)
      .json<Survey>()
      .then(
        (read) => live && setSurvey(read),
        (failure: unknown) => live && setError(messageOf(failure)),
      );

    return () => {
      live = false;
    };
  }, [api, token, messageId]);

  return { survey, error };
};

/** The questions with the visitor's picks, and voting them or changing the vote while it's open. */
const Ballot = ({
  api,
  token,
  survey,
  urlOf,
}: {
  api: MessengerApi;
  token: string;
  survey: Survey;
  urlOf: (url: string) => string;
}) => {
  const [picked, setPicked] = useState(survey.optionIds);
  const [saved, setSaved] = useState(survey.optionIds);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voted = saved.length > 0;

  const vote = async (event: SubmitEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);

    try {
      await api
        .as(token)
        .post({ optionIds: picked }, `surveys/${encodeURIComponent(survey.messageId)}/votes`)
        .res();
      setSaved(picked);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSending(false);
    }
  };

  return (
    <form class="fl-survey" aria-label={survey.title} onSubmit={(event) => void vote(event)}>
      <strong>{survey.title}</strong>
      {survey.steps.map((step) => (
        <Question
          key={step.id}
          step={step}
          picked={picked}
          disabled={!survey.open || sending}
          onChange={setPicked}
          urlOf={urlOf}
        />
      ))}
      {error && <p class="fl-error">{error}</p>}
      {!survey.open ? (
        <p class="fl-note">Voting has closed.</p>
      ) : voted && same(picked, saved) ? (
        <p class="fl-note" role="status">
          Thanks, your vote is in. Pick again to change it.
        </p>
      ) : (
        <button type="submit" class="fl-primary" disabled={sending || picked.length === 0}>
          {voted ? 'Change vote' : 'Vote'}
        </button>
      )}
    </form>
  );
};

/**
 * A survey the team sent into the conversation, in place of its message. Its own chunk, fetched
 * when a thread holds a survey, with its styles.
 */
export const SurveyCard = ({
  api,
  token,
  messageId,
  urlOf,
}: {
  api: MessengerApi;
  token: string;
  messageId: string;
  urlOf: (url: string) => string;
}) => {
  const { survey, error } = useSurvey(api, token, messageId);

  return (
    <>
      <style>{styles}</style>
      {survey ? (
        <Ballot api={api} token={token} survey={survey} urlOf={urlOf} />
      ) : error ? (
        <p class="fl-error">{error}</p>
      ) : (
        <div class="fl-survey" aria-busy="true" />
      )}
    </>
  );
};
