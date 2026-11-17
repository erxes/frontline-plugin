import type { VisitorSite } from '@frontline/api/helpcenter';
import type { Jsonify } from 'type-fest';
import type { Article } from '../articles/api.ts';
import { publicApi } from '../shared/http.ts';

/** A help center as its embed reads it: its look, and its topic's categories and articles. */
export type Site = Jsonify<VisitorSite>;

/** One help center's signed-out API at `base`, `/api/public/help-centers/<key>`. */
export const knowledgeBaseApi = (base: URL) => {
  const http = publicApi(base);

  return {
    site: () => http.get().json<Site>(),
    read: (id: string) => http.get(`/articles/${encodeURIComponent(id)}`).json<Article>(),
  };
};
