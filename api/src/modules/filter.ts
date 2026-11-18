import type { ConditionGroup } from '@erxes/core-contract';
import { escapeLike, FilterParam } from '@erxes/plugin-sdk/filter';
import { z } from 'zod';

/** A LIKE pattern for values containing `text`. */
export const likeText = (text: string) => `%${escapeLike(text)}%`;

/**
 * What a list's filter bar holds (erxes-ui's `useListFilterParams()`): core's condition group as
 * JSON, its rules on the paths the UI's `ListFilter` fields name, and a search. The SDK's
 * `compileFilter` turns the group into SQL.
 */
export const FilterInput = {
  search: z.string().trim().max(200).optional(),
  filter: FilterParam.optional(),
};

/** Whether a rule of `group`, at any depth, is on `path`: a list's default gives way to it. */
export const filtersBy = (group: ConditionGroup | undefined, path: string): boolean =>
  group?.rules.some((part) => ('rules' in part ? filtersBy(part, path) : part.path === path)) ??
  false;
