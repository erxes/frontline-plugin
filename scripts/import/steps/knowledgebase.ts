// The knowledge base (topics, categories, articles) and the help centers that publish it. A help
// center gets a new public key, as one an owner makes does; its old address and domain stay out.
import { randomBytes } from 'node:crypto';
import type { Db, Document } from 'mongodb';
import type { z } from 'zod';
import {
  HELP_CENTER_KEY,
  HelpCenterFooter,
  HelpCenterHeader,
  HelpCenterStyles,
} from '../../../api/src/db/helpcenter.ts';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  boolOf,
  createdOf,
  dateOf,
  entriesOf,
  fileOf,
  filesOf,
  idOf,
  idsOf,
  intOf,
  plain,
  textOf,
  docId,
} from '../values.ts';
import { byDepth } from './structure.ts';

const DATABASES = ['erxes', 'erxes_office'] as const;

type Database = (typeof DATABASES)[number];

const dbOf = (ctx: Context, database: Database): Db =>
  database === 'erxes' ? ctx.main : ctx.office;

/** Codes are unique per organisation; a repeated old code gets the record's id appended. */
const uniqueCode = (taken: Set<string>, code: string | null, id: string) => {
  if (!code) return null;

  const free = taken.has(code) ? `${code}-${id.slice(0, 6)}` : code;

  taken.add(free);

  return free;
};

const stampsOf = (ctx: Context, doc: Document) => ({
  created_by: ctx.user(idOf(doc.createdBy)) ?? ctx.owner,
  created_at: createdOf(doc, doc.createdDate, doc.createdAt),
  updated_at: createdOf(doc, doc.modifiedDate, doc.updatedAt, doc.createdDate),
});

const topicStep = (database: Database): Step => {
  const codes = new Set<string>();

  return {
    source: `${database}.knowledgebase_topics`,
    documents: async (ctx) => {
      for (const code of (await ctx.keyed('frontline_knowledgebase_topics', 'code')).keys())
        codes.add(code);

      return ctx.find(dbOf(ctx, database), 'knowledgebase_topics');
    },
    transform: (doc, ctx) => {
      const id = docId(doc);
      const title = textOf(doc.title);

      if (!id || !title) return skip('no title');

      if (ctx.known('kb.topic', id)) return skip('already in erxes by id');

      ctx.remember('kb.topic', id, id);

      return put([
        'frontline_knowledgebase_topics',
        {
          id,
          title,
          description: textOf(doc.description),
          code: uniqueCode(codes, textOf(doc.code), id),
          color: textOf(doc.color),
          background_image: textOf(doc.backgroundImage),
          language_code: textOf(doc.languageCode),
          ...stampsOf(ctx, doc),
        },
      ]);
    },
  };
};

const categoryStep = (database: Database): Step => {
  const codes = new Set<string>();

  return {
    source: `${database}.knowledgebase_categories`,
    documents: async (ctx) => {
      for (const code of (await ctx.keyed('frontline_knowledgebase_categories', 'code')).keys())
        codes.add(code);

      return byDepth(
        await ctx.find(dbOf(ctx, database), 'knowledgebase_categories').toArray(),
        'parentCategoryId',
      );
    },
    transform: (doc, ctx) => {
      const id = docId(doc);
      const title = textOf(doc.title);
      const topicId = ctx.known('kb.topic', idOf(doc.topicId));

      if (!id || !title) return skip('no title');

      if (ctx.known('kb.category', id)) return skip('already in erxes by id');

      if (!topicId) return skip('its topic is gone');

      ctx.remember('kb.category', id, id);

      return put([
        'frontline_knowledgebase_categories',
        {
          id,
          topic_id: topicId,
          parent_id: ctx.known('kb.category', idOf(doc.parentCategoryId)) ?? null,
          title,
          description: textOf(doc.description),
          code: uniqueCode(codes, textOf(doc.code), id),
          icon: textOf(doc.icon),
          ...stampsOf(ctx, doc),
        },
      ]);
    },
  };
};

const ARTICLE_STATUSES = new Set(['draft', 'publish', 'scheduled', 'archived']);

const articleStep = (database: Database): Step => ({
  source: `${database}.knowledgebase_articles`,
  documents: (ctx) => {
    ctx.report.note(
      `${database}.knowledgebase_articles`,
      "reaction counts, an article's own code and its linked forms have no column; readers' reactions name no customer",
    );

    return ctx.find(dbOf(ctx, database), 'knowledgebase_articles');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const title = textOf(doc.title);
    const categoryId = ctx.known('kb.category', idOf(doc.categoryId));
    const status = String(doc.status ?? 'draft');
    const pdf = fileOf(entriesOf(plain(doc.pdfAttachment)).get('pdf'));

    if (!id || !title) return skip('no title');

    if (ctx.known('kb.article', id)) return skip('already in erxes by id');

    if (!categoryId) return skip('its category is gone');

    if (!ARTICLE_STATUSES.has(status)) return skip(`unknown status ${status}`);

    ctx.remember('kb.article', id, id);

    return put([
      'frontline_knowledgebase_articles',
      {
        id,
        category_id: categoryId,
        title,
        summary: textOf(doc.summary),
        content: textOf(doc.content) ?? '',
        status,
        scheduled_at: dateOf(doc.scheduledDate),
        published_at:
          dateOf(doc.publishedAt) ?? (status === 'publish' ? dateOf(doc.modifiedDate) : null),
        is_private: boolOf(doc.isPrivate) ?? false,
        reaction_choices: idsOf(doc.reactionChoices),
        view_count: Math.max(intOf(doc.viewCount) ?? 0, 0),
        image: fileOf(doc.image),
        attachments: filesOf(doc.attachments),
        pdf_attachment: pdf ? { pdf } : null,
        ...stampsOf(ctx, doc),
      },
    ]);
  },
});

/** A nested settings object as the new schema reads it, dropping the keys it doesn't take. */
const settingsOf = <T extends z.ZodType>(schema: T, value: unknown) => {
  const entries = [...entriesOf(plain(value))].filter(
    ([, inner]) => inner !== '' && inner !== null,
  );

  const kept = entries.filter(([key, inner]) => schema.safeParse({ [key]: inner }).success);
  const parsed = schema.safeParse(Object.fromEntries(kept));

  return parsed.success ? parsed.data : {};
};

/**
 * Old help centers, kept with their knowledge base, forms, look and labels. Each gets a new
 * random public key, as an owner's new help center does; the old site address, its client portal
 * token and its ticket settings stay out.
 */
const helpCenterStep: Step = {
  source: 'erxes.frontline_help_center_configs',
  documents: (ctx) => {
    ctx.report.note(
      'erxes.frontline_help_center_configs',
      'new public keys; the old url, client portal and CMS tokens and ticket form settings stay out',
    );

    return ctx.find(ctx.main, 'frontline_help_center_configs');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const title = textOf(doc.title);
    const publicKey = randomBytes(10).toString('hex');

    if (!id || !title) return skip('no title');

    return put(
      [
        'frontline_help_centers',
        {
          id,
          title,
          description: textOf(doc.description),
          language_code: textOf(doc.languageCode),
          public_key: publicKey,
          kb_topic_id:
            doc.kbToggle === false ? null : (ctx.known('kb.topic', idOf(doc.kbTopicId)) ?? null),
          kb_label: textOf(doc.kbLabel),
          form_ids: ctx.knownAll('form', idsOf(doc.formIds)),
          color: textOf(doc.color),
          background_image: textOf(doc.backgroundImage),
          styles: settingsOf(HelpCenterStyles, doc.styles),
          header: settingsOf(HelpCenterHeader, doc.header),
          footer: settingsOf(HelpCenterFooter, doc.footer),
          created_by: ctx.user(idOf(doc.createdBy)) ?? ctx.owner,
          created_at: createdOf(doc, doc.createdAt),
          updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
        },
      ],
      [
        'frontline_public_keys',
        { key: publicKey, org_of: ctx.orgId, kind: HELP_CENTER_KEY, target_id: id },
      ],
    );
  },
};

export const KNOWLEDGE_BASE_STEPS: Step[] = [
  ...DATABASES.map(topicStep),
  ...DATABASES.map(categoryStep),
  ...DATABASES.map(articleStep),
  helpCenterStep,
];
