import { and, eq, or, type SQL, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '#/config.ts';
import { withOrg } from '#/db/client.ts';
import { helpCenters } from '#/db/helpcenter.ts';
import { integrations } from '#/db/inbox.ts';
import { kbArticles } from '#/db/schema.ts';
import { fail } from './fail.ts';
import { carries, downloadPath, endsWith, fileIdOf, readFile, sendFile } from './files.ts';
import { keyOfOrganization, organizationOfKey } from './public.ts';

/**
 * Where a signed-out page loads the core file at `url`, by the organisation's key, since core
 * serves its files to members only. Core gives its files a path on its own address; any other
 * address, such as a link to another site, stays as it is.
 */
export const shownUrl = (key: string, url: string) => {
  const id = url.startsWith('/') && !url.startsWith('//') ? fileIdOf(url) : null;

  return id ? `${config.publicUrl}/api/public/files/${key}/${id}` : url;
};

/** The organisation's key that `shownUrl` takes, made the first time it is asked for. */
export const shownKeyOf = (orgId: string) => withOrg(orgId, (tx) => keyOfOrganization(tx, orgId));

const found = async (query: Promise<unknown[]>) => (await query).length > 0;

/** The articles anyone may read: published and public. */
export const published = and(eq(kbArticles.status, 'publish'), eq(kbArticles.isPrivate, false));

/**
 * Whether the organisation shows core file `id` to anyone: a help center's logo, favicon or
 * background, a messenger's logos, or a published public article's image, attachment or body.
 * The cheap checks go first; the body's goes last, through the search index, and counts only an
 * attribute holding core's own path, as `shownUrl` rewrites it, not a link to another site.
 */
const isShown = (orgId: string, id: string) =>
  withOrg(orgId, async (tx) => {
    const ending = downloadPath(id);
    const field = (column: SQL) => endsWith(column, ending);

    return (
      (await found(
        tx
          .select({ id: helpCenters.id })
          .from(helpCenters)
          .where(
            or(
              field(sql`${helpCenters.styles}->>'mainLogo'`),
              field(sql`${helpCenters.styles}->>'favicon'`),
              field(sql`${helpCenters.footer}->>'logo'`),
              field(sql`${helpCenters.backgroundImage}`),
            ),
          )
          .limit(1),
      )) ||
      (await found(
        tx
          .select({ id: integrations.id })
          .from(integrations)
          .where(
            and(
              eq(integrations.kind, 'messenger'),
              or(
                field(sql`${integrations.config}->>'logo'`),
                field(sql`${integrations.config}->>'launcherLogo'`),
              ),
            ),
          )
          .limit(1),
      )) ||
      (await found(
        tx
          .select({ id: kbArticles.id })
          .from(kbArticles)
          .where(
            and(
              published,
              or(field(sql`${kbArticles.image}->>'url'`), carries(kbArticles.attachments, id)),
            ),
          )
          .limit(1),
      )) ||
      found(
        tx
          .select({ id: kbArticles.id })
          .from(kbArticles)
          .where(and(published, sql`${kbArticles.content} ~ ${`="/[^/"][^"]*${ending}"`}`))
          .limit(1),
      )
    );
  });

// Core's ids are letters and digits; nothing else reaches the regular expression above.
const Params = z.object({ key: z.string().max(100), id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });

/** A file the organisation shows signed-out visitors, streamed from core: `GET /files/:key/:id`. */
export const shownFile = async (req: Request, res: Response) => {
  try {
    const params = Params.safeParse(req.params);
    const orgId = params.success ? await organizationOfKey(params.data.key) : undefined;

    const file =
      params.success && orgId && (await isShown(orgId, params.data.id))
        ? await readFile(orgId, params.data.id)
        : null;

    if (!file) {
      res.status(404).json({ message: 'No such file' });

      return;
    }

    sendFile(res, file, 'public, max-age=300');
  } catch (error) {
    fail(res, error, 'shown file');
  }
};
