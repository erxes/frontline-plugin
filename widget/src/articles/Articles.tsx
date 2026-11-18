import { useEffect, useState } from 'preact/hooks';
import type {
  Article,
  ArticleSummary,
  Category,
  ReadArticle,
  SearchArticles,
  Topic,
} from './api.ts';

type View = { name: 'home' } | { name: 'category'; id: string } | { name: 'article'; id: string };

type Open = (view: View) => void;

const countOf = (count: number) => (count === 1 ? '1 article' : `${count} articles`);

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
}) => (
  <ul class="fl-rows">
    {categories.map((category) => (
      <li key={category.id}>
        <button
          type="button"
          class="fl-row"
          onClick={() => open({ name: 'category', id: category.id })}
        >
          <span>{category.title}</span>
          <small>
            {countOf(topic.articles.filter((article) => article.categoryId === category.id).length)}
          </small>
        </button>
      </li>
    ))}
  </ul>
);

/**
 * The articles whose title, summary or text holds `term`, asked for once the visitor pauses
 * typing; the last answer stays up while the next is on its way.
 */
const Found = ({ term, search, open }: { term: string; search: SearchArticles; open: Open }) => {
  const [articles, setArticles] = useState<ArticleSummary[] | null>(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let live = true;

    const ask = async () => {
      try {
        const found = await search(term);

        if (!live) return;

        setArticles(found);
        setFailure('');
      } catch (error) {
        if (live) setFailure(error instanceof Error ? error.message : 'Try again');
      }
    };

    const asked = setTimeout(() => void ask(), 250);

    return () => {
      live = false;
      clearTimeout(asked);
    };
  }, [term, search]);

  if (failure)
    return (
      <p class="fl-error" role="alert">
        {failure}
      </p>
    );

  if (!articles) return <p class="fl-muted">Searching…</p>;

  return articles.length > 0 ? (
    <ArticleRows articles={articles} open={open} />
  ) : (
    <p class="fl-muted">No articles match</p>
  );
};

/** One article, read when it opens; its body is HTML the API sanitized. */
const ArticleView = ({ id, read }: { id: string; read: ReadArticle }) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let live = true;

    read(id).then(
      (found) => live && setArticle(found),
      (error: unknown) => live && setFailure(error instanceof Error ? error.message : 'Try again'),
    );

    return () => {
      live = false;
    };
  }, [id, read]);

  if (failure)
    return (
      <p class="fl-error" role="alert">
        {failure}
      </p>
    );

  if (!article) return <p class="fl-muted">Loading…</p>;

  return (
    <article class="fl-article">
      <h3>{article.title}</h3>
      <div class="fl-article-body" dangerouslySetInnerHTML={{ __html: article.content }} />
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
      {children.length === 0 && articles.length === 0 && <p class="fl-muted">No articles yet</p>}
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
  const searching = term.trim() !== '' && view.name !== 'article';

  return (
    <div class="fl-articles">
      {view.name !== 'article' && (
        <input
          type="search"
          aria-label="Search articles"
          placeholder="Search articles"
          value={term}
          onInput={(event) => setTerm(event.currentTarget.value)}
        />
      )}
      {searching ? (
        <Found term={term.trim()} search={search} open={open} />
      ) : (
        <Page topic={topic} view={view} open={open} read={read} />
      )}
    </div>
  );
};
