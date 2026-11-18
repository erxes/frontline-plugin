import { asc, gt, sql } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import type { Tx } from '#/db/client.ts';
import { kbArticles } from '#/db/schema.ts';

/**
 * An article's HTML as a visitor's page may show it: sanitize-html's default formatting tags,
 * plus images, with links opening in a new tab.
 */
const visitorHtml = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noreferrer' }),
    },
  });

/**
 * What an article's new `content` writes: the member's HTML as they wrote it, so the editor keeps
 * its formatting, and the clean copy visitors see. Nothing without new content.
 */
export const contentColumns = (content: string | undefined) =>
  content === undefined ? {} : { content, publicContent: visitorHtml(content) };

/** Fills `public_content` for the 200 articles after id `after`, then for the rest. */
const fillPagesAfter = async (tx: Tx, after: string): Promise<void> => {
  const page = await tx
    .select({ id: kbArticles.id, content: kbArticles.content })
    .from(kbArticles)
    .where(gt(kbArticles.id, after))
    .orderBy(asc(kbArticles.id))
    .limit(200);

  const last = page.at(-1);

  if (!last) return;

  await tx.execute(sql`
    update ${kbArticles} set public_content = filled.html
    from unnest(
      ${sql.param(page.map((article) => article.id))}::text[],
      ${sql.param(page.map((article) => visitorHtml(article.content)))}::text[]
    ) as filled(id, html)
    where ${kbArticles.id} = filled.id`);

  return fillPagesAfter(tx, last.id);
};

/**
 * Fills `public_content` for every organisation's articles, in the transaction of the migration
 * that added it (`db/migrate.ts`). The plugin owns the table, so without FORCE row-level security
 * its role sees every row until FORCE is back, in this transaction.
 */
export const fillPublicContent = async (tx: Tx) => {
  await tx.execute(sql`alter table ${kbArticles} no force row level security`);
  await fillPagesAfter(tx, '');
  await tx.execute(sql`alter table ${kbArticles} force row level security`);
};
