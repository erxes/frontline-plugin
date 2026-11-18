import { z } from 'zod';
import { core } from '#/core.ts';
import { refuse } from './shared.ts';

/** Core lists at most 100 ids at a time. */
const chunks = (ids: Iterable<string>) => {
  const unique = [...new Set(ids)];

  return Array.from({ length: Math.ceil(unique.length / 100) }, (_, at) =>
    unique.slice(at * 100, at * 100 + 100),
  );
};

/**
 * How an export names the people its rows point at: members by email, customers by their email,
 * phone or name, companies by name. An id core no longer has stays as it is.
 */
export const namesOf = async (
  orgId: string,
  ids: { users: string[]; customers: string[]; companies: string[] },
) => {
  const client = core.forOrg(orgId);

  const [users, customers, companies] = await Promise.all([
    Promise.all(
      chunks(ids.users).map((list) =>
        client.users.list({ ids: list.join(','), limit: list.length }),
      ),
    ),
    Promise.all(
      chunks(ids.customers).map((list) =>
        client.customers.list({ ids: list.join(','), limit: list.length }),
      ),
    ),
    Promise.all(
      chunks(ids.companies).map((list) =>
        client.companies.list({ ids: list.join(','), limit: list.length }),
      ),
    ),
  ]);

  const names = new Map<string, string>([
    ...users.flatMap((page) => page.data.map((user) => [user.id, user.email ?? user.id] as const)),
    ...customers.flatMap((page) =>
      page.data.map(
        (customer) =>
          [
            customer.id,
            customer.primaryEmail ??
              customer.primaryPhone ??
              ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.id),
          ] as const,
      ),
    ),
    ...companies.flatMap((page) =>
      page.data.map((company) => [company.id, company.primaryName ?? company.id] as const),
    ),
  ]);

  return (id: string | null) => (id ? (names.get(id) ?? id) : null);
};

/** The members of `emails`, by lowercased email; an email no member has is left out. */
export const membersByEmail = async (orgId: string, emails: Iterable<string>) => {
  const client = core.forOrg(orgId);
  const wanted = [...new Set([...emails].map((email) => email.toLowerCase()))];

  const found = await Promise.all(
    wanted.map(async (email) => {
      const { data } = await client.users.list({ search: email, limit: 5 });
      const user = data.find((row) => row.email?.toLowerCase() === email);

      return user ? ([email, user.id] as const) : null;
    }),
  );

  return new Map(found.filter((pair) => pair !== null));
};

const isEmail = (cell: string) => z.email().safeParse(cell).success;

/**
 * A batch's customers by their cells' emails, made in core when it has none, except in a
 * check: a row whose cell isn't an email, or whose customer core refused, fails on its own.
 * Returns the row's customer id for a cell.
 */
export const customersOf = async (orgId: string, cells: string[], dryRun: boolean) => {
  const client = core.forOrg(orgId);

  const wanted = dryRun
    ? []
    : [...new Set(cells.filter(isEmail).map((cell) => cell.toLowerCase()))];

  const found = new Map(
    await Promise.all(
      wanted.map(async (email) => {
        const made = await client.customers.findOrCreate({ primaryEmail: email }).then(
          ({ customer }) => customer.id,
          (error: unknown) => (error instanceof Error ? error : new Error('Core failed')),
        );

        return [email, made] as const;
      }),
    ),
  );

  return (cell: string) => {
    if (!isEmail(cell)) throw refuse(`Customer is an email address, not ${cell}`);

    const id = found.get(cell.toLowerCase());

    if (id instanceof Error) throw refuse(`Customer ${cell}: ${id.message}`);

    return id;
  };
};
