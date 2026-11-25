import { z } from 'zod';
import { logger } from '#/logger.ts';
import { graph } from './metaGraph.ts';

/** What frontline reads of a page: its token, and its linked Instagram account. */
const PAGE_FIELDS = 'id,name,access_token,instagram_business_account{id,username}';

export const Page = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  instagram_business_account: z
    .object({ id: z.string(), username: z.string().optional() })
    .optional(),
});

export type Page = z.infer<typeof Page>;

/** A page the connection could not connect, and Meta's reason. */
export interface RefusedPage {
  pageId: string;
  name: string | null;
  reason: string;
}

const Listed = z.object({ data: z.array(Page) });

const Debugged = z.object({
  data: z.object({
    granular_scopes: z
      .array(z.object({ scope: z.string(), target_ids: z.array(z.string()).optional() }))
      .optional(),
  }),
});

export const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Meta did not answer';

/** The connection's app as core gives it; without both, Meta can't be asked about the login. */
interface App {
  appId: string | null;
  appSecret: string | null;
}

/**
 * The pages the login granted, by id: Meta names each page the person ticked in its "choose
 * pages" step under `pages_show_list`. Asked with the connection's own app.
 */
const grantedIds = async (accessToken: string, app: App) => {
  if (!app.appId || !app.appSecret) return [];

  const debugged = Debugged.parse(
    await graph('debug_token', `${app.appId}|${app.appSecret}`, {
      query: { input_token: accessToken },
    }),
  );

  return (debugged.data.granular_scopes ?? [])
    .filter((granted) => granted.scope === 'pages_show_list')
    .flatMap((granted) => granted.target_ids ?? []);
};

/**
 * The pages a Facebook connection may connect: those `me/accounts` lists, and those the login
 * granted that it leaves out. Meta lists only pages the person runs as a classic admin, so a
 * page they reach through a Business portfolio or the new Pages experience comes by its id.
 * A granted page Meta won't give comes back refused, with its reason.
 */
export const pagesOf = async (
  accessToken: string,
  app: App,
): Promise<{ pages: Page[]; refused: RefusedPage[] }> => {
  const listed = Listed.parse(
    await graph('me/accounts', accessToken, { query: { fields: PAGE_FIELDS, limit: '100' } }),
  ).data;

  const granted = await grantedIds(accessToken, app).catch((error: unknown) => {
    logger.warn({ err: error }, 'Meta did not say which pages the login granted');

    return [];
  });

  const known = new Set(listed.map((page) => page.id));
  const unlisted = [...new Set(granted)].filter((id) => !known.has(id));

  const fetched = await Promise.all(
    unlisted.map((pageId) =>
      graph(pageId, accessToken, { query: { fields: PAGE_FIELDS } }).then(
        (body) => ({ page: Page.parse(body) }),
        (error: unknown) => ({ refused: { pageId, name: null, reason: reasonOf(error) } }),
      ),
    ),
  );

  return {
    pages: [...listed, ...fetched.flatMap((each) => ('page' in each ? [each.page] : []))],
    refused: fetched.flatMap((each) => ('refused' in each ? [each.refused] : [])),
  };
};
