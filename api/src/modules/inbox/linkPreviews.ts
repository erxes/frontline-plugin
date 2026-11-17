import { lookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { Parser } from 'htmlparser2';
import ipaddr from 'ipaddr.js';
import { find } from 'linkifyjs';
import { LRUCache } from 'lru-cache';
import { Agent, fetch } from 'undici';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { reads } from '#/orpc.ts';
import { conversationById } from './shared.ts';

/** Links a message previews, the bytes read of each page, and how long it may take. */
const MAX_LINKS = 3;
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

const isPublic = (address: string) => ipaddr.process(address).range() === 'unicast';

/**
 * Resolves a name only to public unicast addresses. The agent checks the address it dials, so
 * neither a redirect nor a name that rebinds reaches the server's own network.
 */
const publicLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);

    const [first] = addresses;

    if (!first || !addresses.every(({ address }) => isPublic(address)))
      callback(new Error(`${hostname} is not a public address`), []);
    else if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });

const publicOnly = new Agent({ connect: { lookup: publicLookup } });

/**
 * A web address on the default port, with no login in it, or null. A socket dials an address
 * without the lookup, so one that is not public is refused here.
 */
const webUrl = (value: string, base?: URL) => {
  const url = URL.parse(value, base);
  const host = url?.hostname.replace(/^\[|\]$/g, '') ?? '';

  return url &&
    ['http:', 'https:'].includes(url.protocol) &&
    !url.port &&
    !url.username &&
    (!ipaddr.isValid(host) || isPublic(host))
    ? url
    : null;
};

/** Up to `MAX_BYTES` of the stream, as text. */
const readCapped = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[] = [],
  size = 0,
): Promise<string> => {
  const { done, value } = await reader.read();
  const read = done ? chunks : [...chunks, value];
  const total = size + (value?.length ?? 0);

  if (!done && total < MAX_BYTES) return readCapped(reader, read, total);

  await reader.cancel();

  return Buffer.concat(read).toString('utf8');
};

/** The HTML page at `url`, following a few redirects, or null when it is something else. */
const pageAt = async (
  url: URL,
  signal: AbortSignal,
  hops = 0,
): Promise<{ url: URL; html: string } | null> => {
  const response = await fetch(url, {
    dispatcher: publicOnly,
    redirect: 'manual',
    signal,
    headers: { accept: 'text/html', 'user-agent': 'erxes-frontline link preview' },
  });

  const next =
    response.status >= 300 && response.status < 400
      ? webUrl(response.headers.get('location') ?? '', url)
      : null;

  if (next && hops < MAX_REDIRECTS) {
    await response.body?.cancel();

    return pageAt(next, signal, hops + 1);
  }

  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('html')) {
    await response.body?.cancel();

    return null;
  }

  return { url, html: await readCapped(response.body.getReader()) };
};

/** The page's `<meta>` tags by property or name, lowercased, and its `<title>`. */
const tagsOf = (html: string) => {
  const meta = new Map<string, string>();
  const title: string[] = [];
  const open = { title: false };

  const parser = new Parser({
    onopentag: (name, attributes) => {
      const key = (attributes.property ?? attributes.name)?.toLowerCase();

      if (name === 'title') open.title = true;

      if (name === 'meta' && key && attributes.content && !meta.has(key))
        meta.set(key, attributes.content);
    },
    ontext: (text) => {
      if (open.title) title.push(text);
    },
    onclosetag: (name) => {
      if (name === 'title') open.title = false;
    },
  });

  parser.end(html);

  return { meta, title: title.join('') };
};

const plain = (value: string | undefined, max: number) =>
  value?.replaceAll(/\s+/g, ' ').trim().slice(0, max) || null;

export const LinkPreview = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  siteName: z.string(),
  image: z.string().nullable(),
});

const previewOf = async (link: URL) => {
  const page = await pageAt(link, AbortSignal.timeout(TIMEOUT_MS));

  if (!page) return null;

  const { meta, title } = tagsOf(page.html);
  const tag = (...names: string[]) => names.map((name) => meta.get(name)).find(Boolean);
  const imageTag = tag('og:image', 'twitter:image');
  // The member's browser loads the image, so it takes https and the same public address check.
  const image = imageTag ? webUrl(imageTag, page.url) : null;

  return {
    url: link.href,
    title: plain(tag('og:title', 'twitter:title') ?? title, 200) ?? page.url.hostname,
    description: plain(tag('og:description', 'twitter:description', 'description'), 300),
    siteName: plain(tag('og:site_name'), 100) ?? page.url.hostname,
    image: image?.protocol === 'https:' ? image.href : null,
  };
};

/**
 * Each page's preview for an hour, a failed one too, so a thread the inbox refetches on every
 * change asks no site twice. A page is public, so its preview is the same for every organisation.
 */
const cached = new LRUCache<string, { preview: Awaited<ReturnType<typeof previewOf>> }>({
  max: 1000,
  ttl: 60 * 60_000,
  fetchMethod: async (href) => ({
    preview: await previewOf(new URL(href)).catch((error: unknown) => {
      logger.info({ err: error, url: href }, 'no link preview');

      return null;
    }),
  }),
});

/** The first few distinct web links in a message's text. */
const linksOf = (content: string) =>
  [...new Set(find(content, 'url').map((link) => link.href))]
    .map((href) => webUrl(href))
    .filter((url) => url !== null)
    .slice(0, MAX_LINKS);

/**
 * A card for each link in the message: the page's title, description, site and image, as its
 * Open Graph tags give them. A page that can't be read gets none.
 */
const list = reads(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ previews: z.array(LinkPreview) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const [message] = await tx
      .select({ conversationId: messages.conversationId, content: messages.content })
      .from(messages)
      .where(eq(messages.id, input.id));

    if (!message) throw new ORPCError('NOT_FOUND', { message: 'No such message' });

    await conversationById(tx, member, message.conversationId);

    const previews = await Promise.all(
      linksOf(message.content).map(async (link) => (await cached.fetch(link.href))?.preview),
    );

    return { previews: previews.filter((preview) => preview != null) };
  });

export const linkPreviewProcedures = { linkPreviews: list };
