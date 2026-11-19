import { z } from 'zod';
import { chunks, core } from '#/core.ts';
import { refuse } from './shared.ts';

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

/** How core finds a customer by a cell: its email, its phone, or neither. */
const contactOf = (cell: string) => {
  if (z.email().safeParse(cell).success) return { primaryEmail: cell.toLowerCase() };

  if (/^\+?[\d\s().-]{6,}$/.test(cell)) return { primaryPhone: cell.replace(/[\s().-]/g, '') };

  return null;
};

const keyOf = (cell: string) => JSON.stringify(contactOf(cell));

/**
 * A batch's customers by their cells' emails or phones, made in core when it has none, except
 * in a check. Returns the row's customer id for a cell. A cell with neither, such as the name an
 * export writes for a customer with no contact, leaves a ticket's customer as it is when the
 * row `keeps` one, and fails the row otherwise, as does a customer core refused.
 */
export const customersOf = async (orgId: string, cells: string[], dryRun: boolean) => {
  const client = core.forOrg(orgId);

  const wanted = new Map(
    (dryRun ? [] : cells).flatMap((cell) => {
      const contact = contactOf(cell);

      return contact ? [[keyOf(cell), contact] as const] : [];
    }),
  );

  const found = new Map(
    await Promise.all(
      [...wanted].map(async ([key, contact]) => {
        const made = await client.customers.findOrCreate(contact).then(
          ({ customer }) => customer.id,
          (error: unknown) => (error instanceof Error ? error : new Error('Core failed')),
        );

        return [key, made] as const;
      }),
    ),
  );

  return (cell: string, keeps = false) => {
    if (!contactOf(cell)) {
      if (keeps) return undefined;

      throw refuse(`Customer is an email or a phone, not ${cell}`);
    }

    const id = found.get(keyOf(cell));

    if (id instanceof Error) throw refuse(`Customer ${cell}: ${id.message}`);

    return id;
  };
};
