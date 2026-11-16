import type { VisitorArticle, VisitorTopic } from '@frontline/api/helpcenter';
import type { Jsonify } from 'type-fest';

/** A knowledge base topic as a visitor reads it: its categories and published articles. */
export type Topic = Jsonify<VisitorTopic>;

export type Category = Topic['categories'][number];

export type ArticleSummary = Topic['articles'][number];

/** One article, its body HTML as the API sanitized it. */
export type Article = Jsonify<VisitorArticle>;

/** Reads one article, which counts a view. */
export type ReadArticle = (id: string) => Promise<Article>;
