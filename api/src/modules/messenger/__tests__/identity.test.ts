import { describe, expect, it, vi } from 'vite-plus/test';
import { core } from './standIns.ts';
import { ann, connect, messenger, setUp, write } from './visitors.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

describe('messenger identity', () => {
  it('shows the identity secret only to a member who may change the messenger', async () => {
    const { owner, teammate, id, identitySecret } = await setUp('org-mi-a');

    expect(await owner.integrations.messenger.settings({ id })).toMatchObject({ identitySecret });
    expect(await teammate.integrations.messenger.settings({ id })).toMatchObject({
      identitySecret: null,
    });
    await expect(teammate.integrations.messenger.rotateSecret({ id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const { identitySecret: rotated } = await owner.integrations.messenger.rotateSecret({ id });

    expect(rotated).not.toBe(identitySecret);
  });

  it('gives a stranger who types a known customer’s email nothing of theirs', async () => {
    const { owner, id, key, token, hers, signed, ownerOf } = await setUp('org-mi-b');
    const before = await write(token, 'Anonymous question');

    // A messenger that requires an email takes the typed one, on the visitor's own lead.
    await owner.integrations.update({ id, config: { requireAuth: true } });
    expect((await messenger.post('/messages', { content: 'Again' }, token)).status).toBe(403);

    const stranger = await connect({ key, token, identity: ann });
    const lead = await ownerOf(before);

    expect(stranger).toMatchObject({ identified: true, conversations: [{ id: before }] });
    expect(lead).not.toBe('customer-ann');
    expect(core.updates.at(-1)).toEqual({ id: lead, primaryEmail: ann.email, firstName: 'Ann' });
    expect(core.updates.map((change) => change.id)).not.toContain('customer-ann');
    expect(await write(stranger.token, 'Now with my email', before)).toBe(before);
    expect((await messenger.get(`/conversations/${hers}/messages`, stranger.token)).status).toBe(
      404,
    );

    // A signature of another value, or none the secret made, is refused.
    for (const identity of [signed('x@example.com'), { ...ann, hash: 'forged' }])
      expect((await messenger.post('/connect', { key, token, identity })).status).toBe(403);

    expect(
      (await messenger.post('/connect', { key, identity: { firstName: 'No contact' } })).status,
    ).toBe(400);
  });

  it('signs a visitor in as the customer the website names, until it stops', async () => {
    const { key, token, hers, signed, ownerOf } = await setUp('org-mi-c');
    const before = await write(token, 'Anonymous question');

    // Ann signs in on this browser, and her anonymous conversation joins hers.
    const verified = await connect({ key, token, identity: signed() });

    expect(verified.identified).toBe(true);
    expect(verified.conversations.map((row) => row.id).toSorted()).toEqual(
      [before, hers].toSorted(),
    );
    expect(await ownerOf(before)).toBe('customer-ann');
    expect(await write(verified.token, 'Signed in', before)).toBe(before);

    // Signed out, the page starts a new visitor with nothing of hers.
    expect((await connect({ key, token: verified.token })).conversations).toEqual([]);
  });

  it("fills only the signed-in customer's blank fields, since her hash sits in the page", async () => {
    const { key, signed } = await setUp('org-mi-d');

    core.updates.length = 0;
    await connect({ key, identity: signed(), customFields: { plan: 'free', city: 'Darkhan' } });

    expect(core.updates).toEqual([{ id: 'customer-ann', customFields: { city: 'Darkhan' } }]);

    // A visitor's own lead takes every value.
    core.updates.length = 0;
    await connect({ key, customFields: { plan: 'free' } });

    expect(core.updates).toEqual([
      { id: `customer-${core.customers}`, customFields: { plan: 'free' } },
    ]);
  });
});
