import type { Document } from 'mongodb';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { addChannel, CHANNEL, importDocuments, ORG, query } from '#/test/import.ts';

beforeAll(addChannel);

describe('import of old Mongo data', () => {
  const form = {
    _id: 'old-form',
    type: 'lead',
    name: 'Demo request',
    title: 'Book a demo',
    code: 'demo01',
    channelId: CHANNEL,
    numberOfPages: 2,
    createdUserId: 'user-a',
    createdDate: new Date('2023-05-01T08:00:00Z'),
    leadData: {
      loadType: 'popup',
      appearance: 'messenger',
      themeColor: '#123456',
      callout: { title: 'Hi', body: 'Ask us', buttonText: 'Start', skip: true },
      steps: { second: { name: 'Details', order: 2 }, first: { name: 'Contact', order: 1 } },
      viewCount: 41,
      contactsGathered: 3,
      redirectUrl: 'https://example.com/thanks',
    },
  };

  const fields = [
    {
      _id: 'f-email',
      contentType: 'form',
      contentTypeId: 'old-form',
      type: 'input',
      validation: 'email',
      text: 'Email',
      order: 1,
    },
    {
      _id: 'f-date',
      contentType: 'form',
      contentTypeId: 'old-form',
      type: 'input',
      validation: 'date',
      text: 'When',
      order: 2,
    },
    {
      _id: 'f-topics',
      contentType: 'form',
      contentTypeId: 'old-form',
      type: 'multiSelect',
      text: 'Topics',
      options: ['Sales', 'Support'],
      logicAction: 'show',
      logics: [{ fieldId: 'f-email', logicOperator: 'isNot', logicValue: '' }],
      column: 1,
      pageNumber: 2,
    },
    {
      _id: 'f-intro',
      contentType: 'form',
      contentTypeId: 'old-form',
      type: 'html',
      text: '<p>Hello</p>',
    },
    {
      _id: 'f-company',
      contentType: 'form',
      contentTypeId: 'old-form',
      type: 'company_primaryName',
      text: 'Company',
    },
  ];

  const submission = {
    _id: 'group-1',
    formId: 'old-form',
    contentType: 'lead',
    customerId: 'customer-1',
    submittedAt: new Date('2024-02-03T04:05:06Z'),
    answers: [
      { _id: 'answer-1', formFieldId: 'f-email', value: 'a@example.com' },
      { _id: 'answer-2', formFieldId: 'f-topics', value: ['Sales'] },
      { _id: 'answer-3', formFieldId: 'f-email', value: 'again@example.com' },
    ],
  };

  const runs: [string, Document[]][] = [
    ['erxes.frontline_forms', [form]],
    ['erxes.form_fields', fields],
    [
      'erxes.frontline_form_submissions',
      [submission, { ...submission, _id: 'group-2', formId: 'gone' }],
    ],
  ];

  it('imports a form with its look, fields and one submission per answer group', async () => {
    const report = await importDocuments(runs);

    expect(report['erxes.frontline_forms']).toMatchObject({
      seen: 1,
      copied: { frontline_forms: 1 },
    });
    expect(report['erxes.form_fields']).toMatchObject({
      seen: 5,
      copied: { frontline_form_fields: 4 },
      reasons: {
        'an HTML block: the new form has no static text between fields': {
          count: 1,
          examples: ['f-intro'],
        },
      },
    });
    expect(report['erxes.frontline_form_submissions']).toMatchObject({
      copied: { frontline_form_submissions: 1, frontline_form_answers: 2 },
      reasons: { 'its form is not imported': { count: 1, examples: ['group-2'] } },
    });

    await expect(
      query('SELECT * FROM frontline_forms WHERE id = $1', ['old-form']),
    ).resolves.toMatchObject([
      {
        org_id: ORG,
        channel_id: CHANNEL,
        appearance: 'messenger',
        load_type: 'popup',
        primary_color: '#123456',
        callout_title: 'Hi',
        callout_skip: true,
        steps: [
          { name: 'Contact', description: '' },
          { name: 'Details', description: '' },
        ],
        view_count: 41,
        created_by: 'user-a',
        created_at: new Date('2023-05-01T08:00:00Z'),
      },
    ]);

    const rows = await query(
      'SELECT id, type, validator, logic_action, logics, "column", page_number FROM frontline_form_fields ORDER BY id',
    );

    expect(rows).toMatchObject([
      { id: 'f-company', type: 'text' },
      { id: 'f-date', type: 'date', validator: null },
      { id: 'f-email', type: 'text', validator: { type: 'preset', preset: 'email' } },
      {
        id: 'f-topics',
        type: 'check',
        logic_action: 'show',
        logics: [{ fieldId: 'f-email', operator: 'isNot' }],
        column: 1,
        page_number: 2,
      },
    ]);

    await expect(
      query(
        'SELECT s.id, s.customer_id, s.created_at, a.field_id, a.value FROM frontline_form_submissions s JOIN frontline_form_answers a ON a.submission_id = s.id ORDER BY a.id',
      ),
    ).resolves.toEqual([
      {
        id: 'group-1',
        customer_id: 'customer-1',
        created_at: submission.submittedAt,
        field_id: 'f-email',
        value: 'a@example.com',
      },
      {
        id: 'group-1',
        customer_id: 'customer-1',
        created_at: submission.submittedAt,
        field_id: 'f-topics',
        value: ['Sales'],
      },
    ]);
  });

  it('copies nothing on a second run', async () => {
    const report = await importDocuments(runs);

    expect(report['erxes.frontline_forms']).toMatchObject({
      copied: { frontline_forms: 0 },
      existing: { frontline_forms: 1 },
    });
    expect(report['erxes.form_fields']).toMatchObject({
      copied: { frontline_form_fields: 0 },
      existing: { frontline_form_fields: 4 },
    });
    expect(report['erxes.frontline_form_submissions']).toMatchObject({
      copied: { frontline_form_submissions: 0, frontline_form_answers: 0 },
    });
  });
});
