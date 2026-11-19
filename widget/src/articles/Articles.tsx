import { useEffect, useState } from 'preact/hooks';
import type {
  Article,
  ArticleSummary,
  Category,
  ReadArticle,
  SearchArticles,
  Topic,
} from './api.ts';
import { useText } from '../shared/text.ts';

const loadReactions = async () => (await import('./reactions/Reactions.tsx')).Reactions;

type View = { name: 'home' } | { name: 'category'; id: string } | { name: 'article'; id: string };

type Open = (view: View) => void;

const ArticleRows = ({ articles, open }: { articles: ArticleSummary[]; open: Open }) => (
  <ul class="fl-rows">
    {articles.map((article) => (
      <li key={article.id}>
        <button
          type="button"
          class="fl-row"
          onClick={() => open({ name: 'article', id: article.id })}
        >
          <span>{article.title}</span>
          {article.summary && <small>{article.summary}</small>}
        </button>
      </li>
    ))}
  </ul>
);

const CategoryRows = ({
  categories,
  topic,
  open,
}: {
  categories: Category[];
  topic: Topic;
  open: Open;
}) => {
  const { t } = useText();

  return (
    <ul class="fl-rows">
      {categories.map((category) => {
        const count = topic.articles.filter((article) => article.categoryId === category.id).length;

        return (
          <li key={category.id}>
            <button
              type="button"
              class="fl-row"
              onClick={() => open({ name: 'category', id: category.id })}
            >
              <span>{category.title}</span>
              <small>{t(count === 1 ? '1 article' : '{count} articles', { count })}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

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
  read,
}: {
  topic: Topic;
  view: View;
  open: Open;
  read: ReadArticle;
}) => {
  const { t } = useText();

  if (view.name === 'article') return <ArticleView id={view.id} read={read} />;

  const parentId = view.name === 'category' ? view.id : null;
  const category = topic.categories.find((item) => item.id === parentId);
  const children = topic.categories.filter((item) => item.parentId === parentId);
  const articles = topic.articles.filter((article) => article.categoryId === parentId);

  return (
    <>
      {category && <h3>{category.title}</h3>}
      {category?.description && <p class="fl-muted">{category.description}</p>}
      <CategoryRows categories={children} topic={topic} open={open} />
      <ArticleRows articles={articles} open={open} />
      {children.length === 0 && articles.length === 0 && (
        <p class="fl-muted">{t('No articles yet')}</p>
      )}
    </>
  );
};

/**
 * Where the visitor is in a topic, which the embed's header steps back through: `back` is null
 * on the topic's first page.
 */
export const useArticleViews = () => {
  const [views, setViews] = useState<View[]>([{ name: 'home' }]);

  return {
    view: views.at(-1) ?? { name: 'home' },
    open: (next: View) => setViews([...views, next]),
    back: views.length > 1 ? () => setViews(views.slice(0, -1)) : null,
  };
};

type ArticleViews = ReturnType<typeof useArticleViews>;

/**
 * A knowledge base topic a visitor browses: a search over its articles' titles, summaries and
 * text, its categories and their articles, and one article at a time.
 */
export const Articles = ({
  topic,
  read,
  search,
  views: { view, open },
}: {
  topic: Topic;
  read: ReadArticle;
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
        <Page topic={topic} view={view} open={open} read={read} />
      )}
    </div>
  );
};
