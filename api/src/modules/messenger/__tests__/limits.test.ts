import { describe, expect, it } from 'vite-plus/test';
import { serve } from '#/test/http.ts';

const signedOut = serve('/api/public');

const burst = (count: number, request: () => Promise<Response>) =>
  Promise.all(Array.from({ length: count }, request));

const submit = () =>
  fetch(signedOut.url('/no-such-key/forms/no-such-form'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://shop.test' },
    body: JSON.stringify({ answers: {} }),
  });

describe('signed-out rate limits', () => {
  it('lets a visitor IP read far more than it submits', async () => {
    const reads = await burst(40, () =>
      fetch(signedOut.url('/messenger/settings?key=no-such-messenger')),
    );

    expect(reads.map((reply) => reply.status)).toEqual(Array.from({ length: 40 }, () => 404));
  });

  it('answers the 21st form submission in a minute from one IP with 429 and Retry-After', async () => {
    const allowed = await burst(20, submit);

    expect(allowed.map((reply) => reply.status)).toEqual(Array.from({ length: 20 }, () => 404));

    const refused = await submit();

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(60);
    // The website's page can read why.
    expect(refused.headers.get('access-control-allow-origin')).toBe('*');
    expect(await refused.json()).toEqual({ message: 'Too many requests: try again in a minute' });
  });
});
