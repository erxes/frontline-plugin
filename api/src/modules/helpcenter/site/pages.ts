import { html, raw } from 'hono/html';
import type { VisitorArticle } from '../public.ts';
import { type Html, href, type Site } from './layout.ts';

type Category = Site['categories'][number];

type Summary = Site['articles'][number];

/** A page's title, description and `main`, or null for the 404 page. */
export type Drawn = { title: string; description?: string | null; main: Html } | null;

/** How many of a category's articles one page lists. */
const PAGE_SIZE = 30;

const dateOf = (site: Site, date: Date) =>
  new Intl.DateTimeFormat(site.language, { dateStyle: 'medium' }).format(date);

const SearchBox = (site: Site, term = '') =>
  html`<form class="hc-search" role="search" action="${href(site, '/search')}" method="get">
    <input
      type="search"
      name="q"
      value="${term}"
      aria-label="${site.copy.search}"
      placeholder="${site.helpCenter.header.searchPlaceholder || site.copy.searchPlaceholder}"
    />
    <button type="submit">${site.copy.search}</button>
  </form>`;

const Card = (link: string, title: string, text: string | null, footnote: string) =>
  html`<li>
    <article class="hc-card">
      <h3><a href="${link}">${title}</a></h3>
      ${text && html`<p>${text}</p>`}
      <small>${footnote}</small>
    </article>
  </li>`;

const CategoryCards = (site: Site, categories: Category[]) =>
  html`<ul class="hc-cards">
    ${categories.map((category) =>
      Card(
        href(site, `/categories/${category.id}`),
        category.title,
        category.description,
        site.copy.articles(category.articleCount),
      ),
    )}
  </ul>`;

const FormCards = (site: Site) =>
  html`<ul class="hc-cards">
    ${site.forms.map((form) =>
      Card(
        href(site, `/forms/${form.id}`),
        form.title || form.name,
        form.description,
        site.copy.fillIn,
      ),
    )}
  </ul>`;

const ArticleList = (site: Site, articles: Summary[]) =>
  html`<ul class="hc-list">
    ${articles.map(
      (article) =>
        html`<li>
          <a href="${href(site, `/articles/${article.id}`)}">
            ${article.title} ${article.summary && html`<small>${article.summary}</small>`}
          </a>
        </li>`,
    )}
  </ul>`;

const Empty = (text: string) => html`<p class="hc-empty">${text}</p>`;

/** The site's first page: a search, its top categories, popular and recent articles, its forms. */
export const home = (site: Site): Drawn => {
  const { helpCenter, copy } = site;
  const top = site.categories.filter((category) => category.parentId === null);
  const popular = site.articles.toSorted((a, b) => b.viewCount - a.viewCount).slice(0, 6);
  const image = helpCenter.backgroundImage;

  // A background image darkens under white text, which reads on any photo.
  const hero = image
    ? `color:#fff;background-image:linear-gradient(rgb(0 0 0 / .5),rgb(0 0 0 / .5)),url("${encodeURI(image)}")`
    : '';

  return {
    title: helpCenter.title,
    main: html`<section class="hc-hero" style="${hero}">
        <div class="hc-wrap">
          <h1>${helpCenter.title}</h1>
          ${helpCenter.description && html`<p>${helpCenter.description}</p>`} ${SearchBox(site)}
        </div>
      </section>
      <div class="hc-wrap">
        ${
          site.topic &&
          html`<section class="hc-section" id="categories" aria-labelledby="categories-title">
            <h2 id="categories-title">${helpCenter.kbLabel || copy.categories}</h2>
            ${top.length > 0 ? CategoryCards(site, top) : Empty(copy.empty)}
          </section>`
        }
        ${
          site.articles.length > 0 &&
          html`<div class="hc-columns hc-section">
            <section>
              <h2>${copy.popular}</h2>
              ${ArticleList(site, popular)}
            </section>
            <section>
              <h2>${copy.recent}</h2>
              ${ArticleList(site, site.articles.slice(0, 6))}
            </section>
          </div>`
        }
        ${
          site.forms.length > 0 &&
          html`<section class="hc-section">
            <h2>${helpCenter.header.formsLabel || copy.forms}</h2>
            ${FormCards(site)}
          </section>`
        }
      </div>`,
  };
};

/** The site's home, then the categories from the topic down to `category`, as links. */
const Crumbs = (site: Site, category: Category | undefined) => {
  const trail: Category[] = [];

  for (let at = category; at; at = site.categories.find((item) => item.id === at?.parentId))
    trail.unshift(at);

  return html`<nav aria-label="Breadcrumb">
    <ol class="hc-crumbs">
      <li>
        <a href="${href(site, '/')}">${site.helpCenter.header.homeLabel || site.copy.home}</a>
      </li>
      ${trail.map(
        (item) =>
          html`<li><a href="${href(site, `/categories/${item.id}`)}">${item.title}</a></li>`,
      )}
    </ol>
  </nav>`;
};

/** Links to the pages before and after `page` of a list `pages` long. */
const Pager = (site: Site, path: string, page: number, pages: number) =>
  pages > 1 &&
  html`<nav class="hc-pager" aria-label="${site.copy.pages}">
    ${page > 1 && html`<a href="${href(site, `${path}?page=${page - 1}`)}" rel="prev">${site.copy.previous}</a>`}
    ${page < pages && html`<a href="${href(site, `${path}?page=${page + 1}`)}" rel="next">${site.copy.next}</a>`}
  </nav>`;

/**
 * One category: its subcategories and one page of its own articles, newest first. Null for a
 * category not on the site, or a page past its last.
 */
export const categoryPage = (site: Site, id: string, page: number): Drawn => {
  const category = site.categories.find((item) => item.id === id);
  const own = site.articles.filter((article) => article.categoryId === id);
  const pages = Math.ceil(own.length / PAGE_SIZE);

  if (!category || (page > 1 && page > pages)) return null;

  const children = site.categories.filter((item) => item.parentId === id);
  const articles = own.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const parent = site.categories.find((item) => item.id === category.parentId);

  return {
    title: category.title,
    description: category.description,
    main: html`<div class="hc-wrap hc-section">
      ${Crumbs(site, parent)}
      <h1 class="hc-page-title">${category.title}</h1>
      ${category.description && html`<p class="hc-lede">${category.description}</p>`}
      ${children.length > 0 && CategoryCards(site, children)}
      ${articles.length > 0 && html`<div class="hc-section">${ArticleList(site, articles)}</div>`}
      ${Pager(site, `/categories/${id}`, page, pages)}
      ${children.length === 0 && articles.length === 0 && Empty(site.copy.empty)}
    </div>`,
  };
};

/** One article: its cover, body and attachments, and the others in its category beside it. */
export const articlePage = (site: Site, article: VisitorArticle): Drawn => {
  const { copy } = site;
  const category = site.categories.find((item) => item.id === article.categoryId);

  const related = site.articles
    .filter((item) => item.categoryId === article.categoryId && item.id !== article.id)
    .slice(0, 8);

  return {
    title: article.title,
    description: article.summary,
    main: html`<div class="hc-wrap hc-section">
      ${Crumbs(site, category)}
      <div class="hc-article-grid">
        <article class="hc-article">
          <h1 class="hc-page-title">${article.title}</h1>
          <p class="hc-meta">
            ${article.publishedAt && html`<span>${dateOf(site, article.publishedAt)}</span>`}
            <span>${copy.views(article.viewCount)}</span>
          </p>
          ${article.image && html`<img class="hc-cover" src="${article.image.url}" alt="" />`}
          <div class="hc-body">${raw(article.content)}</div>
          ${
            article.attachments.length > 0 &&
            html`<section class="hc-files">
              <h2>${copy.attachments}</h2>
              <ul>
                ${article.attachments.map(
                  (file) => html`<li><a href="${file.url}" download>${file.name}</a></li>`,
                )}
              </ul>
            </section>`
          }
        </article>
        ${
          category &&
          related.length > 0 &&
          html`<aside class="hc-aside">
            <h2>${copy.moreIn(category.title)}</h2>
            ${ArticleList(site, related)}
          </aside>`
        }
      </div>
    </div>`,
  };
};

/** Whether an article's title or summary holds every word of `term`. */
const matches = (article: Summary, term: string) => {
  const text = `${article.title} ${article.summary ?? ''}`.toLocaleLowerCase();

  return term
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
};

/** The articles a search finds by title and summary. */
export const searchPage = (site: Site, term: string): Drawn => {
  const found = term ? site.articles.filter((article) => matches(article, term)) : [];

  return {
    title: site.copy.search,
    main: html`<div class="hc-wrap hc-section">
      <h1 class="hc-page-title">${term ? site.copy.searchFor(term) : site.copy.search}</h1>
      <div class="hc-section">${SearchBox(site, term)}</div>
      ${found.length > 0 ? ArticleList(site, found) : term && Empty(site.copy.noResults)}
    </div>`,
  };
};

/** The forms the help center offers, or null when it offers none. */
export const formsPage = (site: Site): Drawn => {
  const title = site.helpCenter.header.formsLabel || site.copy.forms;

  return site.forms.length > 0
    ? {
        title,
        main: html`<div class="hc-wrap hc-section">
          <h1 class="hc-page-title">${title}</h1>
          ${FormCards(site)}
        </div>`,
      }
    : null;
};

/** One form, which the form embed draws in its slot. Null for a form the site doesn't offer. */
export const formPage = (site: Site, id: string): Drawn => {
  const form = site.forms.find((item) => item.id === id);

  if (!form) return null;

  return {
    title: form.title || form.name,
    description: form.description,
    main: html`<div class="hc-wrap hc-section">
      <h1 class="hc-page-title">${form.title || form.name}</h1>
      ${form.description && html`<p class="hc-lede">${form.description}</p>`}
      <div data-frontline-form="${form.code}"></div>
      <script type="module" src="${form.scriptUrl}"></script>
    </div>`,
  };
};

/** What a missing page shows. */
export const notFoundPage = (site: Site) =>
  html`<div class="hc-wrap hc-section">
    <h1 class="hc-page-title">${site.copy.notFound}</h1>
    <p><a href="${href(site, '/')}">${site.copy.backHome}</a></p>
  </div>`;
