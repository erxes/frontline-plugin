import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { channels } from './schema.ts';
import { type StoredFile, id, stamps, table } from './table.ts';

export const FORM_STATUSES = ['active', 'archived'] as const;

/** Retired with `forms.appearance`: the old plugin stored it, and nothing read it. */
export const FORM_APPEARANCES = ['iframe', 'messenger'] as const;

/** How the embed opens the form on the visitor's page. */
export const FORM_LOAD_TYPES = [
  'embedded',
  'popup',
  'shoutbox',
  'dropdown',
  'slideInLeft',
  'slideInRight',
] as const;

/** A step's name and line, by position: fields on step 1 have `pageNumber` 1. */
export const FormStep = z.object({
  name: z.string().trim().max(100),
  description: z.string().trim().max(500).default(''),
});

/** Codes are unique per organisation; a write that breaks one fails with 23505. */
export const FORM_CODE_INDEX = 'frontline_forms_org_code_key';

/**
 * A lead form of a channel: what visitors see before, in and after it, and how the embed shows
 * it. Embeds find it by `code`. Deleting the channel deletes its forms.
 */
export const forms = table(
  'forms',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    /** What members call it. */
    name: text().notNull(),
    /** What visitors read above the fields. */
    title: text(),
    description: text(),
    buttonText: text(),
    code: text().notNull(),
    status: text({ enum: FORM_STATUSES }).notNull().default('active'),
    appearance: text({ enum: FORM_APPEARANCES }).notNull().default('iframe'),
    loadType: text({ enum: FORM_LOAD_TYPES }).notNull().default('embedded'),
    /** A hex colour, from erxes-ui's ColorPicker. */
    primaryColor: text(),
    /** A visitor who gives an email or phone becomes a customer, not a lead. */
    saveAsCustomer: boolean().notNull().default(false),
    /** The callout shown before the form, unless skipped. */
    calloutTitle: text(),
    calloutBody: text(),
    calloutButtonText: text(),
    calloutImage: jsonb().$type<StoredFile>(),
    calloutSkip: boolean().notNull().default(false),
    /** What a visitor reads once they submit. */
    thankTitle: text(),
    thankContent: text(),
    thankImage: jsonb().$type<StoredFile>(),
    steps: jsonb().$type<z.infer<typeof FormStep>[]>().notNull().default([]),
    viewCount: integer().notNull().default(0),
    /** Customers and leads the form created. */
    contactsGathered: integer().notNull().default(0),
    /** `frontline_tags` of type `form`; deleting a tag takes it off every form. */
    tagIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_forms_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_forms_org_id_key').on(t.orgId, t.id),
    uniqueIndex(FORM_CODE_INDEX).on(t.orgId, t.code),
    index('frontline_forms_org_created_idx').on(t.orgId, t.createdAt.desc(), t.id.desc()),
    index('frontline_forms_tag_ids_idx').using('gin', t.tagIds),
    check('frontline_forms_status_check', sql`${t.status} in ('active', 'archived')`),
  ],
);

/** What a visitor may type into a field, beyond its type: a preset or a pattern of its own. */
export const FieldValidator = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('preset'),
    preset: z.enum([
      'email',
      'phone',
      'number',
      'date',
      'dateTime',
      'postalCode',
      'alphanumeric',
      'mnVehicleRegistration',
    ]),
    message: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal('custom'),
    pattern: z.string().min(1).max(500),
    message: z.string().trim().max(200).optional(),
  }),
]);

export const LOGIC_OPERATORS = [
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'isUnknown',
  'hasAnyValue',
] as const;

/** A condition on another field's answer that shows or hides this field. */
export const FieldLogic = z.object({
  fieldId: z.string(),
  operator: z.enum(LOGIC_OPERATORS),
  value: z.string().max(500).optional(),
});

export const LOGIC_ACTIONS = ['show', 'hide'] as const;

/** The kinds of input a field can be, then the customer fields a submission writes to its customer. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'select',
  'select:countries',
  'radio',
  'check',
  'file',
  'core:customer:firstName',
  'core:customer:middleName',
  'core:customer:lastName',
  'core:customer:email',
  'core:customer:phone',
  'core:customer:description',
  'core:customer:sex',
  'core:customer:birthDate',
  'core:customer:avatar',
] as const;

/**
 * A field of a form, placed by `pageNumber` (its step) and `order`. `type` is a kind of input
 * (`text`, `select`, …) or a customer's own field (`core:customer:email`), which the submission
 * writes to the customer. Deleting the form deletes its fields.
 */
export const formFields = table(
  'form_fields',
  {
    id: id(),
    orgId: text().notNull(),
    formId: text().notNull(),
    type: text().notNull(),
    label: text().notNull().default(''),
    description: text(),
    placeholder: text(),
    options: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    isRequired: boolean().notNull().default(false),
    /** Whether a long option list has a search box. */
    allowSearch: boolean().notNull().default(false),
    pageNumber: integer().notNull().default(1),
    order: integer().notNull().default(0),
    /** How many fields share its row: 1 takes the full width, 2 half. */
    column: integer().notNull().default(1),
    validator: jsonb().$type<z.infer<typeof FieldValidator>>(),
    logicAction: text({ enum: LOGIC_ACTIONS }),
    /** All must hold for `logicAction` to apply. */
    logics: jsonb().$type<z.infer<typeof FieldLogic>[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: 'frontline_form_fields_form_fkey',
      columns: [t.orgId, t.formId],
      foreignColumns: [forms.orgId, forms.id],
    }).onDelete('cascade'),
    index('frontline_form_fields_org_form_idx').on(t.orgId, t.formId, t.pageNumber, t.order),
    check('frontline_form_fields_column_check', sql`${t.column} between 1 and 2`),
    check('frontline_form_fields_page_check', sql`${t.pageNumber} >= 1`),
  ],
);

/** A link admits one answer; a second with the same link fails with 23505. */
export const FORM_SUBMISSION_LINK_INDEX = 'frontline_form_submissions_org_link_key';

/**
 * One visitor's answers to a form, sent at `createdAt`. `customerId` is the core customer it
 * found or made; `referenceType` and `referenceId` name the record a signed link asked about,
 * such as a rated ticket. Deleting the form deletes its submissions.
 */
export const formSubmissions = table(
  'form_submissions',
  {
    id: id(),
    orgId: text().notNull(),
    formId: text().notNull(),
    customerId: text(),
    conversationId: text(),
    referenceType: text(),
    referenceId: text(),
    linkId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_form_submissions_form_fkey',
      columns: [t.orgId, t.formId],
      foreignColumns: [forms.orgId, forms.id],
    }).onDelete('cascade'),
    unique('frontline_form_submissions_org_id_key').on(t.orgId, t.id),
    uniqueIndex(FORM_SUBMISSION_LINK_INDEX).on(t.orgId, t.linkId),
    index('frontline_form_submissions_org_form_created_idx').on(
      t.orgId,
      t.formId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('frontline_form_submissions_org_customer_idx').on(t.orgId, t.customerId),
  ],
);

/**
 * A submission's answer to one field, as the visitor gave it. An answer outlives its field, so a
 * removed field's answers still show.
 */
export const formAnswers = table(
  'form_answers',
  {
    id: id(),
    orgId: text().notNull(),
    submissionId: text().notNull(),
    fieldId: text().notNull(),
    value: jsonb().$type<unknown>().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_form_answers_submission_fkey',
      columns: [t.orgId, t.submissionId],
      foreignColumns: [formSubmissions.orgId, formSubmissions.id],
    }).onDelete('cascade'),
    uniqueIndex('frontline_form_answers_org_submission_field_key').on(
      t.orgId,
      t.submissionId,
      t.fieldId,
    ),
    index('frontline_form_answers_org_field_idx').on(t.orgId, t.fieldId),
    // The submissions' search matches an answer anywhere in it, as text.
    index('frontline_form_answers_value_trgm_idx').using(
      'gin',
      sql`(${t.value}::text) gin_trgm_ops`,
    ),
  ],
);
