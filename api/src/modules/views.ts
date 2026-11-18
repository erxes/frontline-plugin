import { sql } from 'drizzle-orm';
import { withOrg } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import { kbArticles } from '#/db/schema.ts';
import { logger } from '#/logger.ts';

/** What signed-out visitors view: a published article, or a form an embed shows. */
const VIEWED = { article: kbArticles, form: forms } as const;

type Viewed = keyof typeof VIEWED;

/** Views not written yet, by organisation and what was viewed, then by row id. */
const pending = new Map<string, { orgId: string; viewed: Viewed; counts: Map<string, number> }>();

/** Counts one view of the row; `flushViews` writes it with the rest, so a view costs no write. */
export const countView = (orgId: string, viewed: Viewed, id: string) => {
  const key = `${orgId}\u0000${viewed}`;
  const batch = pending.get(key) ?? { orgId, viewed, counts: new Map<string, number>() };

  batch.counts.set(id, (batch.counts.get(id) ?? 0) + 1);
  pending.set(key, batch);
};

/**
 * Adds the views counted so far to their rows, one statement per organisation and table, and
 * starts counting again. The update leaves `updated_at` alone: a view changes nothing a member
 * wrote. A batch that fails is logged and its views are lost.
 */
export const flushViews = async () => {
  const batches = [...pending.values()];

  pending.clear();

  await Promise.all(
    batches.map(async ({ orgId, viewed, counts }) => {
      const table = VIEWED[viewed];

      const rows = sql.join(
        [...counts].map(([id, views]) => sql`(${id}, ${views}::int)`),
        sql`, `,
      );

      await withOrg(orgId, (tx) =>
        tx.execute(sql`
          update ${table} set view_count = ${table}.view_count + counted.views
          from (values ${rows}) as counted(id, views)
          where ${table}.id = counted.id
        `),
      ).catch((error: unknown) => {
        logger.error({ err: error, orgId, viewed, rows: counts.size }, 'view counts were lost');
      });
    }),
  );
};
