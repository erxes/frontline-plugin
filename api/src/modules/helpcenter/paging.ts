import type { Request } from 'express';
import { z } from 'zod';

/** How many of a category's articles one page lists, on the help center site and in the widgets. */
const PAGE_SIZE = 30;

const Page = z.coerce.number().int().min(1);

/** The page of a list `?page=` asks for, from 1; the first when it names none. */
export const pageOf = (req: Request) => Page.safeParse(req.query.page).data ?? 1;

/**
 * Page `page` of the category's own articles, in the order given, and how many pages they fill:
 * one at least, so an empty category still has its first. Null for a page past the last.
 */
export const articlesOnPage = <Article extends { categoryId: string }>(
  articles: Article[],
  categoryId: string,
  page: number,
) => {
  const own = articles.filter((article) => article.categoryId === categoryId);
  const pages = Math.max(1, Math.ceil(own.length / PAGE_SIZE));

  if (page > pages) return null;

  return { articles: own.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages };
};
