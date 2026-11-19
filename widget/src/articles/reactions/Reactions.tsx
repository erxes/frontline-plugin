import { useState } from 'preact/hooks';
import { useText } from '../../shared/text.ts';
import type { Reactable } from '../api.ts';
import styles from './reactions.css?inline';

/**
 * The reactions the knowledge base offers, by their icon's file name, as the article panel names
 * them. The icons sit in the old erxes bucket, which is gone, so the widget draws each as its emoji.
 */
const KNOWN = {
  sad: ['Sad', '😞'],
  neutral: ['Neutral', '😐'],
  grinning: ['Happy', '😀'],
  like: ['Like', '👍'],
  dislike: ['Dislike', '👎'],
} as const;

/** A reaction's name and emoji, or for one the panel doesn't offer, its image. */
const faceOf = (choice: string) =>
  Object.entries(KNOWN).find(([icon]) => choice.endsWith(`/${icon}.svg`))?.[1] ?? ['Reaction'];

/**
 * The article's reactions, each with how many readers picked it; the visitor keeps one, picks
 * another to change it, and presses theirs again to take it off.
 */
export const Reactions = ({ reactable }: { reactable: Reactable }) => {
  const [reactions, setReactions] = useState(reactable.reactions);
  const [failure, setFailure] = useState('');
  // One pick at a time, so a second tap toggles what the first one set and answers land in order.
  const [pending, setPending] = useState(false);
  const { t, messageOf } = useText();

  const pick = async (choice: string, mine: boolean) => {
    setPending(true);

    try {
      setReactions(await reactable.react(mine ? null : choice));
      setFailure('');
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section class="fl-reactions" aria-label={t('How did this article help?')}>
      {/* Its styles come with its chunk, so an embed that offers no reactions doesn't carry them. */}
      <style>{styles}</style>
      <p class="fl-muted">{t('How did this article help?')}</p>
      <div>
        {reactions.map(({ choice, count, mine }) => {
          const [name, emoji] = faceOf(choice);

          return (
            <button
              key={choice}
              type="button"
              aria-pressed={mine}
              disabled={pending}
              aria-label={`${t(name)} ${count}`}
              onClick={() => void pick(choice, mine)}
            >
              {emoji ? (
                <span class="fl-reaction-face">{emoji}</span>
              ) : (
                <img src={choice} alt="" width={22} height={22} />
              )}
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
      </div>
      {failure && (
        <p class="fl-error" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
};
