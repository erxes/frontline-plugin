import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { addChannel, CHANNEL, importDocuments, query } from '#/test/import.ts';
import { messengerConfigOf } from '../../../scripts/import/steps/integrations.ts';
import { statusTypeAt } from '../../../scripts/import/steps/legacyTickets.ts';

beforeAll(addChannel);

/** A knowledge base article of `categoryId`. */
const article = (id: string, categoryId: string) => ({
  _id: id,
  title: `Article ${id}`,
  categoryId,
  status: 'publish',
  content: '<p>Hello &amp; welcome</p>',
  createdBy: 'user-a',
});

describe('import of surveys and the knowledge base', () => {
  it("keeps a survey's step and option ids, renaming `_id`, and refuses a survey with one option", async () => {
    const survey = {
      _id: 'survey-1',
      title: 'How did we do?',
      code: 'svy001',
      channelId: CHANNEL,
      status: 'active',
      createdUserId: 'user-a',
      steps: [
        {
          _id: 'step-1',
          name: 'Step 1',
          question: 'How are you?',
          allowMultiselect: false,
          attachments: [{ url: 'https://old.example/files/a.png', name: 'a.png' }],
          options: [
            { _id: 'option-2', text: 'bad', order: 1, ticketCreationEnabled: false },
            { _id: 'option-1', text: 'good', order: 0, ticketCreationEnabled: false },
          ],
        },
      ],
    };

    const report = await importDocuments([
      [
        'erxes.frontline_surveys',
        [
          survey,
          {
            ...survey,
            _id: 'survey-2',
            code: 'svy002',
            steps: [{ ...survey.steps[0], options: [{ _id: 'o', text: 'only' }] }],
          },
        ],
      ],
    ]);

    expect(report['erxes.frontline_surveys']).toMatchObject({
      copied: { frontline_surveys: 1 },
      reasons: { 'a question without two distinct options': { count: 1, examples: ['survey-2'] } },
    });
    await expect(
      query('SELECT steps FROM frontline_surveys WHERE id = $1', ['survey-1']),
    ).resolves.toEqual([
      {
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            description: '',
            question: 'How are you?',
            allowMultiselect: false,
            attachments: [{ url: 'https://old.example/files/a.png', name: 'a.png' }],
            options: [
              { id: 'option-1', text: 'good', ticket: null },
              { id: 'option-2', text: 'bad', ticket: null },
            ],
          },
        ],
      },
    ]);
  });

  it('skips and lists a row the database refuses, and copies the rest of its batch', async () => {
    // An earlier step said the category was queued, but no row of it reached the database.
    const report = await importDocuments(
      [
        ['erxes.knowledgebase_topics', [{ _id: 'topic-1', title: 'Help', code: 'help' }]],
        [
          'erxes.knowledgebase_categories',
          [{ _id: 'category-1', title: 'Start', topicId: 'topic-1' }],
        ],
        [
          'erxes.knowledgebase_articles',
          [
            article('article-1', 'category-1'),
            article('article-2', 'category-lost'),
            article('article-3', 'category-gone'),
          ],
        ],
      ],
      (ctx) => ctx.remember('kb.category', 'category-lost', 'category-lost'),
    );

    expect(report['erxes.knowledgebase_articles']).toMatchObject({
      seen: 3,
      skipped: 2,
      copied: { frontline_knowledgebase_articles: 1 },
      reasons: {
        'frontline_knowledgebase_articles: refused by frontline_knowledgebase_articles_category_fkey':
          {
            count: 1,
            examples: ['article-2'],
          },
        'its category is gone': { count: 1, examples: ['article-3'] },
      },
    });
    await expect(
      query('SELECT plain_text, status FROM frontline_knowledgebase_articles'),
    ).resolves.toEqual([{ plain_text: ' Hello & welcome ', status: 'publish' }]);
  });
});

describe('old settings as the new ones', () => {
  it("reads a messenger's 12-hour times, weekend rows and response rate, and drops a value the new settings refuse", () => {
    const config = messengerConfigOf(
      {
        languageCode: 'mn',
        messengerData: {
          availabilityMethod: 'auto',
          responseRate: 'A few hours',
          onlineHours: [
            { day: 'weekends', from: '9:30 AM', to: '6:00 PM' },
            { day: 'monday', from: '12:00 AM', to: '12:15 PM' },
          ],
          messages: { mn: { welcome: 'Сайн байна уу', greetings: { title: 'Тавтай морил' } } },
          supporterIds: ['user-a', 'user-b'],
          links: { facebook: 'https://facebook.com/erxes', twitter: 'not a link' },
        },
        uiOptions: { color: 'not-a-colour' },
      },
      { users: (ids: string[]) => ids },
    );

    expect(config).toMatchObject({
      welcome: 'Сайн байна уу',
      greetingTitle: 'Тавтай морил',
      availability: 'auto',
      responseRate: 'hours',
      onlineHours: [
        { day: 'weekend', from: '09:30', to: '18:00' },
        { day: 'monday', from: '00:00', to: '12:15' },
      ],
      supporterIds: ['user-a', 'user-b'],
      links: ['https://facebook.com/erxes'],
      language: 'mn',
    });
    expect(config.color).not.toBe('not-a-colour');
  });

  it('turns an old stage position into a status type: first new, last resolved, the rest in progress', () => {
    expect([0, 1, 2, 3].map((index) => statusTypeAt(index, 4))).toEqual([1, 3, 3, 4]);
  });
});
