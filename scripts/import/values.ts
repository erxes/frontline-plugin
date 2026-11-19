// How old Mongo values become column values: trimmed text with empty as null, dates that fall
// back to the ObjectId's time, ids as strings, and HTML as the plain text members and search read.
import { convert } from 'html-to-text';
import { type Document, ObjectId } from 'mongodb';
import { z } from 'zod';

/** Postgres text can't hold NUL, which old mail and chat bodies sometimes carry. */
const NUL = String.fromCodePoint(0);

/** Mongo values as JSON would have them: ObjectIds as hex, no NUL bytes in strings. */
export const plain = (value: unknown): unknown => {
  if (value instanceof ObjectId) return value.toHexString();

  if (typeof value === 'string') return value.replaceAll(NUL, '');

  if (Array.isArray(value)) return value.map(plain);

  if (value instanceof Date || value === null || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));
};

/** An id as text: ObjectIds as hex, other ids as they are; anything else is no id. */
export const idOf = (value: unknown) => {
  if (value instanceof ObjectId) return value.toHexString();

  if (typeof value === 'string' && value.trim() !== '') return value.trim();

  if (typeof value === 'number') return String(value);

  return null;
};

/** A document's `_id` as text: the id its row keeps. */
export const docId = ({ _id: id }: Document) => idOf(id);

/** The ids of an array field, without blanks or repeats. */
export const idsOf = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(idOf).filter((id): id is string => id !== null))]
    : [];

/** Trimmed text, with an empty string or a non-string as null. */
export const textOf = (value: unknown) => {
  if (typeof value === 'number') return String(value);

  if (typeof value !== 'string') return null;

  const trimmed = value.replaceAll(NUL, '').trim();

  return trimmed === '' ? null : trimmed;
};

export const dateOf = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;

  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'string' || typeof value === 'number' ? value : Number.NaN);

  // Years outside Postgres's comfortable range are typos in the old data (year 20225).
  return Number.isNaN(date.getTime()) || date.getFullYear() < 1970 || date.getFullYear() > 2100
    ? null
    : date;
};

/** The time an ObjectId was made; other ids carry none. */
const idTime = (value: unknown) => {
  if (value instanceof ObjectId) return value.getTimestamp();

  if (typeof value === 'string' && ObjectId.isValid(value) && value.length === 24)
    return ObjectId.createFromHexString(value).getTimestamp();

  return null;
};

/**
 * The first of `values` that reads as a date, else the time the document's ObjectId was made,
 * else the column's default.
 */
export const createdOf = ({ _id: id }: Document, ...values: unknown[]) => {
  for (const value of values) {
    const date = dateOf(value);

    if (date) return date;
  }

  return idTime(id) ?? undefined;
};

export const boolOf = (value: unknown) => (typeof value === 'boolean' ? value : null);

export const intOf = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;

  return typeof number === 'number' && Number.isFinite(number) ? Math.round(number) : null;
};

export const numberOf = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;

  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

/** Whether text looks like markup an editor or a mail client wrote. */
export const isHtml = (value: string) => /<\/?[a-z][\s\S]*?>/i.test(value);

/** Plain text of HTML, links without their address, as the inbox's own text is. */
export const textOfHtml = (value: unknown) => {
  const text = textOf(value);

  if (text === null || !isHtml(text)) return text;

  return textOf(
    convert(text, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    }),
  );
};

const File = z.looseObject({
  url: z.string().optional(),
  name: z.string().optional(),
  filename: z.string().optional(),
  type: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
});

/**
 * Old attachments as `{ url, name, type, size }`: the old file key or address stays as it was,
 * for the later step that copies files into core.
 */
export const filesOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((item) => {
    const parsed = File.safeParse(plain(item));

    if (!parsed.success || !parsed.data.url) return [];

    const { url, name, filename, type, mimeType, size } = parsed.data;

    return [
      {
        url: url.slice(0, 2000),
        name: (name ?? filename ?? url.split('/').at(-1) ?? 'file').slice(0, 500),
        ...(type || mimeType ? { type: (type ?? mimeType ?? '').slice(0, 200) } : {}),
        ...(size !== undefined && size >= 0 ? { size: Math.round(size) } : {}),
      },
    ];
  });

/** One file, such as an image field that held `{ url }` or the address alone. */
export const fileOf = (value: unknown) => {
  if (typeof value === 'string') return filesOf([{ url: value }])[0] ?? null;

  return filesOf([value])[0] ?? null;
};

/** An embedded document's fields, or none for anything else. */
export const entriesOf = (value: unknown) =>
  value instanceof Object && !Array.isArray(value)
    ? new Map<string, unknown>(Object.entries(value))
    : new Map<string, unknown>();
