import { useCallback, useEffect, useState } from 'preact/hooks';
import { Articles, useArticleViews } from '../../articles/Articles.tsx';
import type { Topic } from '../../articles/api.ts';
import styles from '../../articles/articles.css?inline';
import { useText } from '../../shared/text.ts';
import type { MessengerApi } from '../api.ts';
import { Bar, Loading } from '../Thread.tsx';
import type { MessengerState } from '../useMessenger.ts';

/** The topic the messenger offers, loaded when the tab opens. */
const useTopic = (api: MessengerApi, token: string | undefined) => {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { messageOf } = useText();

  useEffect(() => {
    if (!token) return;

    let live = true;

    api.knowledgeBase(token).then(
      (found) => live && setTopic(found),
      (failure: unknown) => live && setError(messageOf(failure)),
    );

    return () => {
      live = false;
    };
  }, [api, token, messageOf]);

  return { topic, error };
};

/**
 * The help articles tab: the knowledge base topic the messenger offers, searched and read in
 * place. The bar's back steps out of an article or category before it leaves the tab.
 */
export const ArticlesTab = ({
  api,
  messenger,
  onBack,
}: {
  api: MessengerApi;
  messenger: MessengerState;
  onBack: () => void;
}) => {
  const { settings, session } = messenger;
  const token = session?.token;
  const { topic, error } = useTopic(api, token);
  const views = useArticleViews();
  const read = useCallback((id: string) => api.article(token ?? '', id), [api, token]);

  const search = useCallback((term: string) => api.searchArticles(token ?? '', term), [api, token]);

  if (!settings || !token) return null;

  return (
    <div class="fl-thread">
      {/* The tab's own styles come with its chunk, so the messenger's script stays small. */}
      <style>{styles}</style>
      <Bar settings={settings} onBack={views.back ?? onBack} />
      <div class="fl-scroll">
        {error && (
          <p class="fl-error" role="alert">
            {error}
          </p>
        )}
        {topic ? (
          <Articles topic={topic} read={read} search={search} views={views} />
        ) : (
          !error && <Loading />
        )}
      </div>
    </div>
  );
};
