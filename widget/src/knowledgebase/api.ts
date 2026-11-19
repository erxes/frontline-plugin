import type { VisitorSite } from '@frontline/api/helpcenter';
import type { Jsonify } from 'type-fest';
import type { Article, ArticleSummary, Page } from '../articles/api.ts';
import { publicApi } from '../shared/http.ts';

/** A help center as its embed opens it: its look, and its topic's categories with their counts. */
export type Site = Jsonify<VisitorSite>;

/** One help center's signed-out API at `base`, `/api/public/help-centers/<key>`. */
export const knowledgeBaseApi = (base: URL) => {
  const http = publicApi(base);

  return {
    site: () => http.get().json<Site>(),
    list: (id: string, page: number) =>
      http.get(`/categories/${encodeURIComponent(id)}/articles?page=${page}`).json<Page>(),
    read: (id: string) => http.get(`/articles/${encodeURIComponent(id)}`).json<Article>(),
    search: (term: string) =>
      http.get(`/search?q=${encodeURIComponent(term)}`).json<ArticleSummary[]>(),
  };
};
