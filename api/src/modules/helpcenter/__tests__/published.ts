import { clientAs } from '#/test/member.ts';

/** The published article's body as visitors get it: no handlers, scripts or script links. */
export const SANITIZED =
  '<p>Money back</p><p>Fees &amp; refunds</p><a target="_blank" rel="noreferrer">Terms</a><a href="https://acme.test/refunds" target="_blank" rel="noreferrer">Policy</a>';

/** A help center over a topic with one published article, one draft and one private. */
export const publishedSite = async (orgId: string) => {
  const owner = clientAs(orgId);
  const topic = await owner.knowledgebase.topics.create({ title: 'Help' });

  const category = await owner.knowledgebase.categories.create({
    topicId: topic.id,
    title: 'Billing',
  });

  const article = await owner.knowledgebase.articles.create({
    categoryId: category.id,
    title: 'Refunds',
    content:
      '<p onclick="steal()">Money back</p><p>Fees &amp; refunds</p><script>steal()</script><a href="javascript:steal()">Terms</a><a href="https://acme.test/refunds">Policy</a>',
    status: 'publish',
  });

  await owner.knowledgebase.articles.create({ categoryId: category.id, title: 'Draft' });

  await owner.knowledgebase.articles.create({
    categoryId: category.id,
    title: 'Internal',
    status: 'publish',
    isPrivate: true,
  });

  const center = await owner.helpCenters.create({ title: 'Acme help', kbTopicId: topic.id });

  return { owner, topic, center, article };
};
