import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { openSecret, readToken, sameText, sealSecret, signToken } from '../secrets.ts';

const Secret = z.object({ token: z.string() });

describe('secrets', () => {
  it('stores a secret encrypted and opens it for its own organisation only', () => {
    const sealed = sealSecret('org-a', { token: 'bot-token-1' });

    expect(sealed).toMatch(/^v1:/);
    expect(sealed).not.toContain('bot-token-1');
    expect(sealSecret('org-a', { token: 'bot-token-1' })).not.toBe(sealed);
    expect(openSecret('org-a', sealed, Secret)).toEqual({ token: 'bot-token-1' });
    expect(() => openSecret('org-b', sealed, Secret)).toThrow('invalid tag');
    expect(() => openSecret('org-a', `v1:${sealed.slice(4, -2)}xx`, Secret)).toThrow('invalid tag');
    expect(() => openSecret('org-a', 'plain-token', Secret)).toThrow('Unknown secret format');
  });

  it('reads back the tokens it signed for the same purpose', async () => {
    const State = z.object({ orgId: z.string() });
    const token = await signToken('meta-login', { orgId: 'org-a' }, '10m');

    await expect(readToken('meta-login', token, State)).resolves.toEqual({ orgId: 'org-a' });
    await expect(readToken('other', token, State)).resolves.toBeNull();
    await expect(readToken('meta-login', `${token}x`, State)).resolves.toBeNull();

    const expired = await signToken('meta-login', { orgId: 'org-a' }, '-1s');

    await expect(readToken('meta-login', expired, State)).resolves.toBeNull();
  });

  it('compares text in constant time and refuses anything else', () => {
    expect(sameText('secret', 'secret')).toBe(true);
    expect(sameText('secret', 'secreT')).toBe(false);
    expect(sameText('secret', 'secret-longer')).toBe(false);
    expect(sameText('secret', ['secret'])).toBe(false);
    expect(sameText('secret', undefined)).toBe(false);
  });
});
