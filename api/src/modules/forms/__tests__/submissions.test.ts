import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as FilesModule from '#/modules/files.ts';
import { createApp } from '#/server.ts';
import { clientAs } from '#/test/member.ts';

// Core's storage: each upload becomes the next file id.
const stored = vi.hoisted(() => ({ count: 0 }));

vi.mock('#/modules/files.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesModule>()),
  storeFile: async (_orgId: string, file: { name: string }) => {
    stored.count += 1;

    return { url: `/core/v1/files/file-${stored.count}/download`, name: file.name };
  },
}));

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('not listening on a port');

  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

/** The embed's address on this test server: the path `forms.embed` gives, under `base`. */
const embedOf = async (client: ReturnType<typeof clientAs>, id: string) => {
  const { url } = await client.forms.embed({ id });

  return `${base}${new URL(url).pathname}`;
};

const send = (url: string, answers: Record<string, unknown>) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers }),
  });

/** Uploads a file to the form at `url`, as the embed does, and gives its receipt. */
const upload = async (url: string) => {
  const uploaded = await fetch(`${url}/files`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-file-name': 'zip.png' },
    body: 'png',
  });

  expect(uploaded.status).toBe(201);

  return z.object({ receipt: z.string() }).parse(await uploaded.json()).receipt;
};

const Created = z.object({ submissionId: z.string(), customerId: z.string().nullable() });

const Refused = z.object({
  errors: z.array(z.object({ fieldId: z.string(), message: z.string() })),
});

describe('form submissions', () => {
  it('serves an active form by its key and code, and counts the view', async () => {
    const owner = clientAs('org-fs-a');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Contact', title: 'Hi' });
    const field = await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Name' });
    const url = await embedOf(owner, form.id);

    const shown = await fetch(url);

    expect(shown.status).toBe(200);

    const body = z
      .object({
        form: z.record(z.string(), z.unknown()),
        fields: z.array(z.object({ id: z.string() })),
      })
      .parse(await shown.json());

    expect(body.form).toMatchObject({ title: 'Hi' });
    expect(body.form).not.toHaveProperty('viewCount');
    expect(body.fields.map((each) => each.id)).toEqual([field.id]);

    await expect(owner.forms.get({ id: form.id })).resolves.toMatchObject({ viewCount: 1 });

    expect((await fetch(url.replace(form.code, 'deadbeef'))).status).toBe(404);
    expect((await fetch(`${base}/api/public/forged/forms/${form.code}`)).status).toBe(404);

    await owner.forms.setStatus({ ids: [form.id], status: 'archived' });

    expect((await fetch(url)).status).toBe(404);
  });

  it('checks answers, keeps the shown ones and lets members correct them', async () => {
    const owner = clientAs('org-fs-b');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Order' });

    const size = await owner.forms.fields.add({
      formId: form.id,
      type: 'radio',
      label: 'Size',
      options: ['S', 'M', 'L'],
      isRequired: true,
    });

    const code = await owner.forms.fields.add({
      formId: form.id,
      type: 'text',
      label: 'Coupon',
      validator: { type: 'custom', pattern: '^[A-Z]{4}$', message: 'Four capitals' },
    });

    const note = await owner.forms.fields.add({
      formId: form.id,
      type: 'text',
      label: 'Why large',
      logicAction: 'show',
      logics: [{ fieldId: size.id, operator: 'is', value: 'L' }],
    });

    const url = await embedOf(owner, form.id);

    const refused = await send(url, { [code.id]: 'nope' });

    expect(refused.status).toBe(422);
    expect(Refused.parse(await refused.json()).errors).toEqual([
      { fieldId: size.id, message: 'This field is required' },
      { fieldId: code.id, message: 'Four capitals' },
    ]);

    expect((await send(url, { [size.id]: 42 })).status).toBe(422);
    expect((await fetch(url, { method: 'POST' })).status).toBe(400);

    const created = await send(url, { [size.id]: 'M', [code.id]: 'SAVE', [note.id]: 'hidden' });

    expect(created.status).toBe(201);

    const { submissionId, customerId } = Created.parse(await created.json());

    expect(customerId).toBeNull();

    await expect(owner.forms.submissions.get({ id: submissionId })).resolves.toMatchObject({
      formId: form.id,
      answers: { [size.id]: 'M', [code.id]: 'SAVE' },
    });
    await expect(owner.forms.get({ id: form.id })).resolves.toMatchObject({ submissionCount: 1 });

    await expect(
      owner.forms.submissions.update({ id: submissionId, fieldId: size.id, value: 'XL' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.forms.submissions.update({ id: submissionId, fieldId: size.id, value: 'L' }),
    ).resolves.toMatchObject({ answers: { [size.id]: 'L' } });
    await expect(
      owner.forms.submissions.update({ id: submissionId, fieldId: code.id, value: null }),
    ).resolves.toMatchObject({ answers: { [size.id]: 'L' } });

    await expect(
      owner.forms.submissions.list({
        formId: form.id,
        filter: JSON.stringify({
          match: 'all',
          rules: [{ path: `subject.answer.${size.id}`, op: 'eq', value: 'l' }],
        }),
      }),
    ).resolves.toMatchObject({ submissions: [{ id: submissionId }], totalCount: 1 });
    await expect(
      owner.forms.submissions.list({ formId: form.id, search: 'zzz' }),
    ).resolves.toMatchObject({
      submissions: [],
      totalCount: 0,
    });

    // Removing a field keeps what was answered to it.
    await owner.forms.fields.remove({ ids: [size.id] });

    await expect(owner.forms.submissions.get({ id: submissionId })).resolves.toMatchObject({
      answers: { [size.id]: 'L' },
    });

    await owner.forms.submissions.remove({ ids: [submissionId] });

    await expect(owner.forms.submissions.list({ formId: form.id })).resolves.toMatchObject({
      totalCount: 0,
    });
  });

  it('takes a file answer only by the receipt its upload to the form gave', async () => {
    const owner = clientAs('org-fs-e');
    const channel = await owner.channels.create({ name: 'Claims' });

    const [form, other] = await Promise.all(
      ['Claim', 'Other'].map((name) => owner.forms.create({ channelId: channel.id, name })),
    );

    if (!form || !other) throw new Error('no forms');

    const photo = await owner.forms.fields.add({ formId: form.id, type: 'file', label: 'Photo' });

    await owner.forms.fields.add({ formId: other.id, type: 'file', label: 'Photo' });

    const url = await embedOf(owner, form.id);
    const receipt = await upload(url);
    const foreign = await upload(await embedOf(owner, other.id));

    // A file's address is no answer, and another form's receipt doesn't attach here.
    expect((await send(url, { [photo.id]: [{ url: '/core/v1/files/x/download' }] })).status).toBe(
      400,
    );
    expect((await send(url, { [photo.id]: [foreign] })).status).toBe(422);

    const created = await send(url, { [photo.id]: [receipt] });

    expect(created.status).toBe(201);

    const { submissionId } = Created.parse(await created.json());

    await expect(owner.forms.submissions.get({ id: submissionId })).resolves.toMatchObject({
      answers: { [photo.id]: [{ url: '/core/v1/files/file-1/download', name: 'zip.png' }] },
    });
  });

  it("hides another organisation's submissions", async () => {
    const owner = clientAs('org-fs-c');
    const channel = await owner.channels.create({ name: 'Sales' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Lead' });
    const field = await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Name' });
    const created = await send(await embedOf(owner, form.id), { [field.id]: 'Bat-Erdene' });
    const { submissionId } = Created.parse(await created.json());

    const stranger = clientAs('org-fs-d');

    await expect(stranger.forms.submissions.get({ id: submissionId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(stranger.forms.submissions.remove({ ids: [submissionId] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
