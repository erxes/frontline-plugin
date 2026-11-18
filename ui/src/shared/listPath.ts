import { listFilterQuery, type TConditionRule } from 'erxes-ui';
import { createSerializer } from 'nuqs';

const serialize = createSerializer(listFilterQuery);

/** The list at `path` narrowed to `rules`, as its filter bar keeps them in the address. */
export const listPath = (path: string, ...rules: TConditionRule[]) =>
  serialize(path, { advanced: { match: 'all', rules } });
