import { type AnyProcedure, call, isProcedure, resolveContractProcedures } from '@orpc/server';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { manifest } from '#/manifest.ts';
import { router } from '#/router.ts';
import { clientAs, memberOf } from '#/test/member.ts';

// Every procedure, found by walking the router, so a new one is covered the day it lands.
const procedures: [string, AnyProcedure][] = [];

await resolveContractProcedures({ router, path: [] }, ({ contract, path }) => {
  if (isProcedure(contract)) procedures.push([path.join('.'), contract]);
});

describe('every procedure', () => {
  it('is found in the router', () => {
    expect(procedures.length).toBeGreaterThan(0);
  });

  // The permission check runs before input validation, so any input reaches it.
  it.each(procedures)('%s refuses a member without its permission', async (_path, procedure) => {
    await expect(
      call(procedure, {}, { context: { member: memberOf('org-a', []) } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// What the integrations page reads, by a member who holds every permission but the integration ones.
describe('the integrations page', () => {
  const others = Object.values(PERMISSIONS).filter((action) => !action.includes('.integration.'));
  const member = clientAs('org-a', ['team.view', ...others]);

  const refusal = {
    code: 'FORBIDDEN',
    message: 'You need the frontline.integration.view permission',
  };

  it('needs frontline.integration.view', async () => {
    await expect(member.integrations.accounts.list({})).rejects.toMatchObject(refusal);
    await expect(member.integrations.meta.bots.list()).rejects.toMatchObject(refusal);
  });
});

// Core refuses the whole manifest when a set names a permission it doesn't declare.
describe('every permission set', () => {
  const declared = manifest.permissions.map(({ action }) => action);

  it.each(manifest.permissionSets)('$key names only declared permissions', (set) => {
    expect(declared).toEqual(expect.arrayContaining(set.permissions));
  });
});
