import { useEffect, useState } from 'preact/hooks';
import type {
  Article,
  ArticleSummary,
  ListArticles,
  ReadArticle,
  SearchArticles,
  Topic,
} from './api.ts';
import {
  ArticleRows,
  CategoryRows,
  CategoryView,
  type Open,
  type Turn,
  type View,
} from './Category.tsx';
import { useText } from '../shared/text.ts';

const loadReactions = async () => (await import('./reactions/Reactions.tsx')).Reactions;

/**
 * The articles whose title, summary or text holds `term`, asked for once the visitor pauses
 * typing; the last answer stays up while the next is on its way.
 */
const useSearch = (term: string, search: SearchArticles) => {
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [failure, setFailure] = useState('');
  const { messageOf } = useText();

  useEffect(() => {
    if (!term) return;

    let live = true;

    const ask = async () => {
      try {
        const found = await search(term);

        if (!live) return;

        setArticles(found);
        setFailure('');
      } catch (error) {
        if (live) setFailure(messageOf(error));
      }
    };

    const asked = setTimeout(() => void ask(), 250);

    return () => {
      live = false;
      clearTimeout(asked);
    };
  }, [term, search, messageOf]);

  return { articles, failure };
};

/** What the search found, that it found nothing, or why it failed. */
const Found = ({ articles, failure, open }: ReturnType<typeof useSearch> & { open: Open }) => {
  const { t } = useText();

  if (failure)
    return (
      <p class="fl-error" role="alert">
        {failure}
      </p>
    );

  if (!articles) return <p class="fl-muted">{t('Searching…')}</p>;

  return articles.length > 0 ? (
    <ArticleRows articles={articles} open={open} />
  ) : (
    <p class="fl-muted">{t('No articles match')}</p>
  );
};

/** One article, read when it opens; its body is HTML the API sanitized. */
const ArticleView = ({ id, read }: { id: string; read: ReadArticle }) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [Reactions, setReactions] = useState<Awaited<ReturnType<typeof loadReactions>>>();
  const [failure, setFailure] = useState('');
  const { t, messageOf } = useText();

  useEffect(() => {
    let live = true;

    const open = async () => {
      try {
        const found = await read(id);

        if (live) setArticle(found);

        // Only an article that offers reactions loads them, so the help center's embed never does.
        if (!found.reactable) return;
      } catch (error) {
        if (live) setFailure(messageOf(error));

        return;
      }

      // The article reads without its reactions when their chunk doesn't load.
      try {
        const reactions = await loadReactions();

        if (live) setReactions(() => reactions);
      } catch {
        // Nothing to show: the visitor still has the article.
      }
    };

    void open();

    return () => {
      live = false;
    };
  }, [id, read, messageOf]);

  if (failure)
    return (
      <p class="fl-error" role="alert">
        {failure}
      </p>
    );

  if (!article) return <p class="fl-muted">{t('Loading…')}</p>;

  return (
    <article class="fl-article">
      <h3>{article.title}</h3>
      <div class="fl-article-body" dangerouslySetInnerHTML={{ __html: article.content }} />
      {Reactions && article.reactable && <Reactions reactable={article.reactable} />}
    </article>
  );
};

/** What the visitor is on: the topic's top categories, one category, or one article. */
const Page = ({
  topic,
  view,
  open,
  turn,
  read,
  list,
}: {
  topic: Topic;
  view: View;
  open: Open;
  turn: Turn;
  read: ReadArticle;
  list: ListArticles;
}) => {
  const { t } = useText();

  if (view.name === 'article') return <ArticleView id={view.id} read={read} />;

  if (view.name === 'category')
    return (
      <CategoryView
        topic={topic}
        id={view.id}
        page={view.page}
        open={open}
        turn={turn}
        list={list}
      />
    );

  const top = topic.categories.filter((item) => item.parentId === null);

  return top.length > 0 ? (
    <CategoryRows categories={top} open={open} />
  ) : (
    <p class="fl-muted">{t('No articles yet')}</p>
  );
};

/**
 * Where the visitor is in a topic, which the embed's header steps back through: `back` is null
 * on the topic's first page. Turning a category's page replaces it, so back leaves the category.
 */
export const useArticleViews = () => {
  const [views, setViews] = useState<View[]>([{ name: 'home' }]);
  const view = views.at(-1) ?? { name: 'home' };

  return {
    view,
    open: (next: View) => setViews([...views, next]),
    turn: (page: number) => {
      if (view.name === 'category') setViews([...views.slice(0, -1), { ...view, page }]);
    },
    back: views.length > 1 ? () => setViews(views.slice(0, -1)) : null,
  };
};

type ArticleViews = ReturnType<typeof useArticleViews>;

/**
 * A knowledge base topic a visitor browses: a search over its articles' titles, summaries and
 * text, its categories and a page of their articles at a time, and one article at a time.
 */
export const Articles = ({
  topic,
  read,
  list,
  search,
  views: { view, open, turn },
}: {
  topic: Topic;
  read: ReadArticle;
  list: ListArticles;
  search: SearchArticles;
  views: ArticleViews;
}) => {
  const [term, setTerm] = useState('');
  // The search lives here, so stepping back from an article it found shows its results again.
  const found = useSearch(term.trim(), search);
  const searching = term.trim() !== '' && view.name !== 'article';
  const { t } = useText();

  return (
    <div class="fl-articles">
      {view.name !== 'article' && (
        <input
          type="search"
          aria-label={t('Search articles')}
          placeholder={t('Search articles')}
          maxLength={100}
          value={term}
          onInput={(event) => setTerm(event.currentTarget.value)}
        />
      )}
      {searching ? (
        <Found {...found} open={open} />
      ) : (
        <Page topic={topic} view={view} open={open} turn={turn} read={read} list={list} />
      )}
    </div>
  );
};
