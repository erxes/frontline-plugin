// Lead and booking forms, their fields, and the visitors' answers. Frontline kept forms twice: its
// own `frontline_forms` and core's older `forms` with the lead integration's `leadData`; a form in
// both imports from `frontline_forms`. Old answers were one document per field, joined by
// `groupId` (newer) or the lead conversation (older); each group becomes one submission.
import type { Db, Document } from 'mongodb';
import { FieldLogic, FieldValidator, FormStep } from '../../../api/src/db/forms.ts';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  boolOf,
  createdOf,
  dateOf,
  entriesOf,
  fileOf,
  idOf,
  idsOf,
  intOf,
  plain,
  textOf,
  docId,
} from '../values.ts';
import { brandChannel } from './customers.ts';
import { FALLBACK_CHANNEL } from './structure.ts';

const DATABASES = ['erxes', 'erxes_office'] as const;

type Database = (typeof DATABASES)[number];

const dbOf = (ctx: Context, database: Database): Db =>
  database === 'erxes' ? ctx.main : ctx.office;

const exists = async (db: Db, name: string) =>
  (await db.listCollections({ name }).toArray()).length > 0;

const LOAD_TYPES = new Set([
  'embedded',
  'popup',
  'shoutbox',
  'dropdown',
  'slideInLeft',
  'slideInRight',
]);

/** Old form kinds Frontline owns; `growthHack` forms were the growth hacking plugin's. */
const FORM_TYPES = new Set(['lead', 'booking']);

/** The lead integrations' `leadData`, for `forms` that kept theirs there. */
const leadIntegrations = new Map<string, Document>();

const loadLeadIntegrations = async (ctx: Context) => {
  for (const database of DATABASES)
    for await (const doc of dbOf(ctx, database)
      .collection('integrations')
      .find({ kind: { $in: ['lead', 'booking'] } }))
      if (!leadIntegrations.has(String(docId(doc)))) leadIntegrations.set(String(docId(doc)), doc);
};

/** Old steps were `{ key: { name, description, order } }`; a form with more pages than steps gets the rest named. */
const stepsOf = (value: unknown, pages: number) => {
  const steps = [...entriesOf(value).values()]
    .map((step) => entriesOf(step))
    .toSorted((a, b) => (intOf(a.get('order')) ?? 0) - (intOf(b.get('order')) ?? 0))
    .flatMap((step) => {
      const parsed = FormStep.safeParse({
        name: (textOf(step.get('name')) ?? '').slice(0, 100),
        description: (textOf(step.get('description')) ?? '').slice(0, 500),
      });

      return parsed.success ? [parsed.data] : [];
    });

  for (let page = steps.length + 1; page <= pages; page += 1)
    steps.push({ name: `Step ${page}`, description: '' });

  return steps;
};

/** Codes are unique per organisation; a second old form with a taken code gets its id appended. */
const codes = new Set<string>();

const codeOf = (doc: Document, id: string) => {
  const code = textOf(doc.code) ?? id;
  const free = codes.has(code) ? `${code}-${id.slice(0, 6)}` : code;

  codes.add(free);

  return free;
};

const formRow = async (ctx: Context, doc: Document, id: string) => {
  const integration = leadIntegrations.get(String(idOf(doc.integrationId)));
  const lead = entriesOf(plain(doc.leadData ?? integration?.leadData));
  const callout = entriesOf(lead.get('callout'));
  const loadType = String(lead.get('loadType'));

  const channelId =
    ctx.known('channel', idOf(doc.channelId)) ??
    ctx.known('lead', idOf(doc.integrationId)) ??
    (await brandChannel(ctx, idOf(doc.brandId) ?? idOf(integration?.brandId))) ??
    FALLBACK_CHANNEL;

  return {
    id,
    channel_id: channelId,
    name: (
      textOf(doc.name) ??
      textOf(integration?.name) ??
      textOf(doc.title) ??
      'Untitled form'
    ).slice(0, 200),
    title: textOf(doc.title),
    description: textOf(doc.description),
    button_text: textOf(doc.buttonText),
    code: codeOf(doc, id),
    status: doc.status === 'archived' || integration?.isActive === false ? 'archived' : 'active',
    appearance: lead.get('appearance') === 'messenger' ? 'messenger' : 'iframe',
    load_type: LOAD_TYPES.has(loadType) ? loadType : 'embedded',
    primary_color: textOf(lead.get('primaryColor')) ?? textOf(lead.get('themeColor')),
    language_code: textOf(doc.languageCode) ?? textOf(integration?.languageCode),
    save_as_customer: boolOf(lead.get('saveAsCustomer')) ?? false,
    callout_title: textOf(callout.get('title')),
    callout_body: textOf(callout.get('body')),
    callout_button_text: textOf(callout.get('buttonText')),
    callout_image: fileOf(callout.get('featuredImage')),
    callout_skip: boolOf(callout.get('skip')) ?? false,
    thank_title: textOf(lead.get('thankTitle')),
    thank_content: textOf(lead.get('thankContent')),
    thank_image: fileOf(lead.get('successImage')),
    steps: stepsOf(lead.get('steps'), intOf(doc.numberOfPages) ?? 1),
    view_count: Math.max(intOf(lead.get('viewCount')) ?? 0, 0),
    contacts_gathered: Math.max(intOf(lead.get('contactsGathered')) ?? 0, 0),
    tag_ids: ctx.knownAll('tag', [...idsOf(doc.tagIds), ...idsOf(integration?.tagIds)]),
    created_by: ctx.user(idOf(doc.createdUserId) ?? idOf(integration?.createdUserId)) ?? ctx.owner,
    created_at: createdOf(doc, doc.createdDate, doc.createdAt),
  };
};

const formStep = (database: Database, collection: 'frontline_forms' | 'forms'): Step => ({
  source: `${database}.${collection}`,
  documents: async (ctx) => {
    if (leadIntegrations.size === 0) await loadLeadIntegrations(ctx);

    if (codes.size === 0)
      for (const code of (await ctx.keyed('frontline_forms', 'code')).keys()) codes.add(code);

    const db = dbOf(ctx, database);

    return (await exists(db, collection)) ? ctx.find(db, collection) : [];
  },
  transform: async (doc, ctx) => {
    const id = docId(doc);

    if (!id) return skip('no id');

    if (!FORM_TYPES.has(String(doc.type ?? 'lead')))
      return skip(`a ${String(doc.type)} form: the growth hacking plugin's, not Frontline's`);

    if (ctx.known('form', id)) return skip('already imported from frontline_forms or erxes');

    ctx.remember('form', id, id);

    return put(['frontline_forms', await formRow(ctx, doc, id)]);
  },
});

/** Old field types the new form shows as one of its own inputs or customer fields. */
const FIELD_TYPES: Record<string, string> = {
  text: 'text',
  input: 'text',
  textarea: 'textarea',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  select: 'select',
  radio: 'radio',
  check: 'check',
  multiSelect: 'check',
  file: 'file',
  firstName: 'core:customer:firstName',
  middleName: 'core:customer:middleName',
  lastName: 'core:customer:lastName',
  email: 'core:customer:email',
  phone: 'core:customer:phone',
  internationalPhone: 'core:customer:phone',
  description: 'core:customer:description',
  pronoun: 'core:customer:sex',
  birthDate: 'core:customer:birthDate',
  avatar: 'core:customer:avatar',
};

/**
 * Company and other fields core's customer has no column for (`company_primaryName`, `industry`,
 * `position`, …): the new form asks them as text, or as a choice when they had options, so their
 * answers stay readable.
 */
const UNMAPPED_TYPES = new Set([
  'company_primaryName',
  'company_primaryEmail',
  'company_primaryPhone',
  'companyName',
  'companyEmail',
  'companyPhone',
  'companyAvatar',
  'companyLinks_website',
  'customerLinks_gitHub',
  'industry',
  'size',
  'position',
  'department',
  'code',
  'location',
  'map',
  'objectList',
  'productCategory',
]);

/** `validation` on a text input: a preset of the new validator, or the field's type. */
const VALIDATIONS: Record<string, { type?: string; preset?: string }> = {
  date: { type: 'date' },
  datetime: { preset: 'dateTime' },
  number: { type: 'number' },
  email: { preset: 'email' },
  phone: { preset: 'phone' },
};

const fieldTypeOf = (doc: Document, options: string[]) => {
  const oldType = String(doc.type);
  const validation = VALIDATIONS[String(doc.validation)];

  if (oldType.startsWith('core:customer:')) return oldType;

  if ((oldType === 'input' || oldType === 'text') && validation?.type) return validation.type;

  if (FIELD_TYPES[oldType]) return FIELD_TYPES[oldType];

  if (UNMAPPED_TYPES.has(oldType)) return options.length > 0 ? 'select' : 'text';

  return null;
};

const validatorOf = (doc: Document) => {
  const preset = VALIDATIONS[String(doc.validation)]?.preset;
  const pattern = textOf(doc.regexValue);

  const candidate =
    doc.validation === 'regex' && pattern
      ? { type: 'custom', pattern }
      : preset
        ? { type: 'preset', preset }
        : null;

  const parsed = candidate ? FieldValidator.safeParse(candidate) : null;

  return parsed?.success ? parsed.data : null;
};

const logicsOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((item: unknown) => {
    const logic = entriesOf(item);

    const parsed = FieldLogic.safeParse({
      fieldId: idOf(logic.get('fieldId')),
      operator: logic.get('logicOperator'),
      value: textOf(logic.get('logicValue'))?.slice(0, 500),
    });

    return parsed.success ? [parsed.data] : [];
  });

const fieldStep = (
  database: Database,
  collection: 'frontline_form_fields' | 'form_fields',
): Step => ({
  source: `${database}.${collection}`,
  documents: async (ctx) => {
    const db = dbOf(ctx, database);

    if (collection === 'form_fields')
      ctx.report.note(
        `${database}.form_fields`,
        'the fields of forms (contentType form); core imports the custom fields',
      );

    if (!(await exists(db, collection))) return [];

    return collection === 'form_fields'
      ? ctx.find(db, collection, { contentType: 'form' })
      : ctx.find(db, collection);
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const formId = ctx.known('form', idOf(doc.contentTypeId));
    const options = idsOf(doc.options).map((option) => option.slice(0, 500));
    const type = fieldTypeOf(doc, options);
    const logics = logicsOf(doc.logics);

    const action = textOf(doc.logicAction);
    const logicAction = action === 'show' || action === 'hide' ? action : null;

    const column = intOf(doc.column);

    if (!id) return skip('no id');

    if (!formId) return skip('its form is not imported');

    if (ctx.known('form.field', id))
      return skip('already imported from frontline_form_fields or erxes');

    if (doc.type === 'html')
      return skip('an HTML block: the new form has no static text between fields');

    if (!type) return skip(`unknown field type ${String(doc.type)}`);

    ctx.remember('form.field', id, id);

    return put([
      'frontline_form_fields',
      {
        id,
        form_id: formId,
        type,
        label: textOf(doc.text) ?? '',
        description: textOf(doc.description),
        placeholder: textOf(doc.placeholder),
        options,
        is_required: boolOf(doc.isRequired) ?? false,
        allow_search: boolOf(doc.searchable) ?? false,
        page_number: Math.max(intOf(doc.pageNumber) ?? 1, 1),
        order: intOf(doc.order) ?? 0,
        column: column === 1 ? 1 : 2,
        validator: validatorOf(doc),
        logic_action: logics.length > 0 ? logicAction : null,
        logics: logicAction ? logics : [],
      },
    ]);
  },
});

/** One old submission: the answers of one group, with the form, customer and time they share. */
type Group = {
  _id: string;
  formId: unknown;
  contentType: unknown;
  customerId: unknown;
  conversationId: unknown;
  submittedAt: unknown;
  answers: { _id: unknown; formFieldId: unknown; value: unknown }[];
};

const groupsOf = (ctx: Context, db: Db, collection: string) =>
  db.collection(collection).aggregate<Group>(
    [
      ...(ctx.limit ? [{ $limit: ctx.limit }] : []),
      {
        $addFields: {
          group: {
            $cond: [
              { $gt: ['$groupId', ''] },
              '$groupId',
              { $cond: [{ $gt: ['$contentTypeId', ''] }, '$contentTypeId', { $toString: '$_id' }] },
            ],
          },
        },
      },
      { $sort: { submittedAt: 1 } },
      {
        $group: {
          _id: '$group',
          formId: { $first: '$formId' },
          contentType: { $first: '$contentType' },
          customerId: { $max: '$customerId' },
          conversationId: { $max: { $ifNull: ['$conversationId', '$contentTypeId'] } },
          submittedAt: { $first: '$submittedAt' },
          answers: { $push: { _id: '$_id', formFieldId: '$formFieldId', value: '$value' } },
        },
      },
    ],
    { allowDiskUse: true },
  );

const submissionStep = (
  database: Database,
  collection: 'frontline_form_submissions' | 'form_submissions',
): Step => ({
  source: `${database}.${collection}`,
  documents: async (ctx) => {
    const db = dbOf(ctx, database);

    ctx.report.note(
      `${database}.${collection}`,
      'counted per submission: the answers grouped by groupId, else the lead conversation',
    );

    return (await exists(db, collection)) ? groupsOf(ctx, db, collection) : [];
  },
  transform: (doc, ctx) => {
    const group = String(docId(doc));
    const formId = ctx.known('form', idOf(doc.formId));

    if (doc.contentType === 'growthHack')
      return skip("a growth hack form's answers: not Frontline's");

    if (!formId) return skip('its form is not imported');

    const answers: unknown[] = Array.isArray(doc.answers) ? doc.answers : [];
    const conversationId = idOf(doc.conversationId);
    const fields = new Set<string>();

    const rows = answers.flatMap((answer) => {
      const entry = entriesOf(answer);
      const fieldId = idOf(entry.get('formFieldId'));
      const value = plain(entry.get('value'));

      // One answer per field: a field answered twice in a group keeps its first.
      if (!fieldId || fields.has(fieldId) || value === undefined || value === null || value === '')
        return [];

      fields.add(fieldId);

      return [
        [
          'frontline_form_answers',
          { id: String(idOf(entry.get('_id'))), submission_id: group, field_id: fieldId, value },
        ] as const,
      ];
    });

    if (rows.length === 0) return skip('no answers');

    return put(
      [
        'frontline_form_submissions',
        {
          id: group,
          form_id: formId,
          customer_id: ctx.customer(idOf(doc.customerId)),
          conversation_id:
            conversationId && ctx.conversations.has(conversationId) ? conversationId : null,
          created_at: dateOf(doc.submittedAt) ?? undefined,
        },
      ],
      ...rows,
    );
  },
});

export const FORM_STEPS: Step[] = [
  ...DATABASES.flatMap((database) => [
    formStep(database, 'frontline_forms'),
    formStep(database, 'forms'),
  ]),
  ...DATABASES.flatMap((database) => [
    fieldStep(database, 'frontline_form_fields'),
    fieldStep(database, 'form_fields'),
  ]),
  ...DATABASES.flatMap((database) => [
    submissionStep(database, 'frontline_form_submissions'),
    submissionStep(database, 'form_submissions'),
  ]),
];
