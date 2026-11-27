import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';
import { expect, expectClickOpensCalendar, openShop } from './fixtures.ts';

export const FORMS = '/frontline/forms';

/** What the public address gives a visitor: the fields, by id. */
const Shown = z.object({ fields: z.array(z.object({ id: z.string(), label: z.string() })) });

/** Sends `answers` to a form's public address `url`, as its widget does, and gives the status. */
export const answer = async (
  request: APIRequestContext,
  url: string,
  answers: Record<string, unknown>,
) => (await request.post(url, { data: { answers } })).status();

/**
 * Sends the form twice: from a shop with the install code its page gives, where a click in Start
 * opens its calendar and Seats shows once Team is picked, and from its public address, which
 * drops a hidden field's answer.
 */
export const sendAsVisitor = async (page: Page, request: APIRequestContext, name: string) => {
  await page.goto(FORMS);
  await page.getByRole('link', { name, exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Form' })
    .getByRole('link', { name: 'Install' })
    .click();

  const installCode = (await page.getByLabel('Install code').textContent()) ?? '';
  const url = (await page.getByText(/\/api\/public\//).textContent()) ?? '';

  {
    await using site = await openShop(page.context(), installCode);
    const form = site.shop.getByRole('form', { name: 'Book a demo' });

    await expect(form.getByLabel('Seats')).toBeHidden();
    await expectClickOpensCalendar(form.getByLabel('Start', { exact: true }));
    // Plan searches its options: text that is none is refused, and one but for case becomes it.
    await form.getByLabel('Plan').fill('Tea');
    await form.getByRole('button', { name: 'Ask' }).click();
    await expect(form.getByText('Pick an option')).toBeVisible();
    await form.getByLabel('Plan').fill('team');
    await expect(form.getByLabel('Plan')).toHaveValue('Team');
    await form.getByLabel('Seats').fill('5');

    await form.getByRole('button', { name: 'Ask' }).click();
    await expect(site.shop.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  }

  const shown = await request.get(url);
  const { fields } = Shown.parse(await shown.json());
  const idOf = (label: string) => fields.find((field) => field.label === label)?.id ?? '';

  expect(shown.status()).toBe(200);
  expect(await answer(request, url, { [idOf('Plan')]: 'Free', [idOf('Seats')]: 9 })).toBe(201);
  expect(await answer(request, url, { [idOf('Plan')]: 'Gold' })).toBe(422);
};
