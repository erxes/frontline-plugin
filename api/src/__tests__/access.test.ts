import { type AnyProcedure, call, isProcedure, resolveContractProcedures } from '@orpc/server';
import { describe, expect, it } from 'vite-plus/test';
import { manifest } from '#/core.ts';
import { router } from '#/router.ts';
import { memberOf } from '#/test/member.ts';

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

// Core refuses the whole manifest when a set names a permission it doesn't declare.
describe('every permission set', () => {
  const declared = manifest.permissions.map(({ action }) => action);

  it.each(manifest.permissionSets)('$key names only declared permissions', (set) => {
    expect(declared).toEqual(expect.arrayContaining(set.permissions));
  });
});
