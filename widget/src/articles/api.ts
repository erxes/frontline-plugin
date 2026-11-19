import type { VisitorArticle, VisitorTopic } from '@frontline/api/helpcenter';
import type { ArticleReactions } from '@frontline/api/messenger';
import type { Jsonify } from 'type-fest';

/** A knowledge base topic as a visitor reads it: its categories and published articles. */
export type Topic = Jsonify<VisitorTopic>;

export type Category = Topic['categories'][number];

export type ArticleSummary = Topic['articles'][number];

/** Each reaction an article offers, how many picked it, and whether the visitor did. */
export type Reactions = Jsonify<ArticleReactions>;

/**
 * An article's reactions as the messenger reads them, and `react`, which sets the visitor's one
 * reaction, or takes it off with `null`, and answers with the new counts.
 */
export type Reactable = {
  reactions: Reactions;
  react: (choice: string | null) => Promise<Reactions>;
};

/**
 * One article, its body HTML as the API sanitized it. The messenger's is `reactable` when it offers
 * reactions; the help center's embed takes none.
 */
export type Article = Jsonify<VisitorArticle> & { reactable?: Reactable };

/** Reads one article, which counts a view. */
export type ReadArticle = (id: string) => Promise<Article>;

/** The topic's articles whose title, summary or text holds `term`. */
export type SearchArticles = (term: string) => Promise<ArticleSummary[]>;
