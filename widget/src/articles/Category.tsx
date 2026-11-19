import { useEffect, useState } from 'preact/hooks';
import type { ArticleSummary, Category, ListArticles, Page as ArticlePage, Topic } from './api.ts';
import { useText } from '../shared/text.ts';

export type View =
  | { name: 'home' }
  | { name: 'category'; id: string; page: number }
  | { name: 'article'; id: string };

export type Open = (view: View) => void;

/** Shows another page of the category in view, in its place. */
export type Turn = (page: number) => void;

export const ArticleRows = ({ articles, open }: { articles: ArticleSummary[]; open: Open }) => (
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

export const CategoryRows = ({ categories, open }: { categories: Category[]; open: Open }) => {
  const { t } = useText();

  return (
    <ul class="fl-rows">
      {categories.map(({ id, title, articleCount: count }) => (
        <li key={id}>
          <button
            type="button"
            class="fl-row"
            onClick={() => open({ name: 'category', id, page: 1 })}
          >
            <span>{title}</span>
            <small>{t(count === 1 ? '1 article' : '{count} articles', { count })}</small>
          </button>
        </li>
      ))}
    </ul>
  );
};

/**
 * Page `page` of a category's articles, listed when the category or its page opens. The page on
 * screen stays up while the next of the same category loads, so the pager keeps the focus.
 */
const useArticlePage = (list: ListArticles, id: string, page: number) => {
  const [loaded, setLoaded] = useState<{ id: string; shown: ArticlePage } | null>(null);
  const [failure, setFailure] = useState('');
  const { messageOf } = useText();

  useEffect(() => {
    let live = true;

    setFailure('');
    list(id, page).then(
      (shown) => live && setLoaded({ id, shown }),
      (error: unknown) => live && setFailure(messageOf(error)),
    );

    return () => {
      live = false;
    };
  }, [list, id, page, messageOf]);

  return { shown: loaded?.id === id ? loaded.shown : null, failure };
};

/** Buttons to the pages before and after `page`, when the list fills more than one. */
const Pager = ({ page, pages, turn }: { page: number; pages: number; turn: Turn }) => {
  const { t } = useText();

  if (pages < 2) return null;

  // The next page starts at the top of the list, not at the pager the visitor scrolled down to.
  const go = (event: { currentTarget: HTMLElement }, to: number) => {
    event.currentTarget.closest('.fl-articles')?.scrollIntoView({ block: 'start' });
    turn(to);
  };

  return (
    <nav class="fl-pager" aria-label={t('Pages')}>
      <button type="button" disabled={page === 1} onClick={(event) => go(event, page - 1)}>
        {t('Previous')}
      </button>
      <span class="fl-muted" aria-live="polite">
        {t('Page {page} of {pages}', { page, pages })}
      </span>
      <button type="button" disabled={page === pages} onClick={(event) => go(event, page + 1)}>
        {t('Next')}
      </button>
    </nav>
  );
};

/** One category: its subcategories, then a page of its own articles and the pager. */
export const CategoryView = ({
  topic,
  id,
  page,
  open,
  turn,
  list,
}: {
  topic: Topic;
  id: string;
  page: number;
  open: Open;
  turn: Turn;
  list: ListArticles;
}) => {
  const { shown, failure } = useArticlePage(list, id, page);
  const { t } = useText();
  const category = topic.categories.find((item) => item.id === id);
  const children = topic.categories.filter((item) => item.parentId === id);

  return (
    <>
      {category && <h3>{category.title}</h3>}
      {category?.description && <p class="fl-muted">{category.description}</p>}
      <CategoryRows categories={children} open={open} />
      {failure && (
        <p class="fl-error" role="alert">
          {failure}
        </p>
      )}
      {!shown && !failure && <p class="fl-muted">{t('Loading…')}</p>}
      {shown && (
        <>
          <ArticleRows articles={shown.articles} open={open} />
          <Pager page={shown.page} pages={shown.pages} turn={turn} />
          {children.length === 0 && shown.articles.length === 0 && (
            <p class="fl-muted">{t('No articles yet')}</p>
          )}
        </>
      )}
    </>
  );
};
