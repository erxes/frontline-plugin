import { ORPCError } from '@orpc/server';
import { convert } from 'html-to-text';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

/** A message's plain text, as a member or a provider writes it. */
export const Content = z.string().trim().max(10_000);

/** A member's rich text, as erxes-ui's editor writes it: HTML. */
export const Html = z.string().max(100_000);

/** BlockNote marks a mention as a span with the member's id. */
const MENTION = 'mention';

/**
 * A member's text as the inbox stores it. Rich text keeps only the editor's formatting, links and
 * mentions, and `content` becomes its plain text; the members it mentions are found in it.
 * Without `html` the text stays plain.
 */
export const writtenText = ({ content, html }: { content: string; html?: string }) => {
  if (html === undefined) return { content, html: null, mentionedUserIds: [] };

  const mentioned = new Set<string>();

  const clean = sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'code',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'a',
      'span',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['data-inline-content-type', 'data-_id', 'data-full-name'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noreferrer' }),
      span: (tagName, attribs) => {
        const id = attribs['data-_id'];

        if (attribs['data-inline-content-type'] === MENTION && id) mentioned.add(id);

        return { tagName, attribs };
      },
    },
  });

  const text = convert(clean, {
    wordwrap: false,
    selectors: [{ selector: 'a', options: { ignoreHref: true } }],
  }).trim();

  if (!Content.safeParse(text).success)
    throw new ORPCError('BAD_REQUEST', { message: 'Write a message under 10,000 characters' });

  return { content: text, html: text ? clean : null, mentionedUserIds: [...mentioned] };
};
