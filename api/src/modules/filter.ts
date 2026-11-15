import { ConditionGroup, type ConditionRule, RelativeAmount } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { and, type Column, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

/** A LIKE pattern's text, where `%`, `_` and `\` match themselves. */
const escapeLike = (text: string) => text.replaceAll(/[\\%_]/g, String.raw`\$&`);

/** A LIKE pattern for values containing `text`. */
export const likeText = (text: string) => `%${escapeLike(text)}%`;

/**
 * What a list's filter bar holds (erxes-ui's `useListFilterParams()`): core's condition group as
 * JSON, its rules on the paths the UI's `ListFilter` fields name, and a search.
 */
export const FilterInput = {
  search: z.string().trim().max(200).optional(),
  filter: z
    .string()
    .transform((text, context) => {
      try {
        const parsed: unknown = JSON.parse(text);

        return parsed;
      } catch {
        context.addIssue({ code: 'custom', message: 'filter is not JSON' });

        return z.NEVER;
      }
    })
    .pipe(ConditionGroup)
    .optional(),
};

/**
 * How a list compares one of its fields, as the UI's `ListFilter` field `type` says: `members` is
 * a `member` field over an array of user ids, such as a channel's members.
 */
type FieldKind = 'text' | 'member' | 'members' | 'select' | 'date' | 'boolean' | 'number';

/** The fields a list can be filtered by: `subject.<name>` paths and the SQL each compares. */
export type FilterFields = Record<string, { kind: FieldKind; expr: Column | SQL }>;

const Text = z.string();
const Texts = z.array(z.string()).min(1);
const Bool = z.boolean();
const Num = z.number();

const refuse = (rule: ConditionRule) =>
  new ORPCError('BAD_REQUEST', {
    message: `This list can't be filtered by ${rule.path} ${rule.op}`,
  });

const presence = (x: Column | SQL, op: ConditionRule['op']) => {
  if (op === 'exists') return sql`${x} is not null`;

  return op === 'not_exists' ? sql`${x} is null` : undefined;
};

const textSql = (x: Column | SQL, rule: ConditionRule) => {
  const value = Text.parse(rule.value);

  switch (rule.op) {
    case 'eq':
      return sql`lower(${x}) = lower(${value})`;
    case 'neq':
      return sql`(${x} is null or lower(${x}) <> lower(${value}))`;
    case 'contains':
      return sql`${x} ilike ${likeText(value)}`;
    case 'not_contains':
      return sql`(${x} is null or ${x} not ilike ${likeText(value)})`;
    case 'starts_with':
      return sql`${x} ilike ${`${escapeLike(value)}%`}`;
    default:
      return undefined;
  }
};

/** Ids a rule picks: one for `eq`/`neq`, several for `in`/`not_in`; `me` is the member asking. */
const idsOf = (rule: ConditionRule, userId: string) =>
  (rule.op === 'in' || rule.op === 'not_in'
    ? Texts.parse(rule.value)
    : [Text.parse(rule.value)]
  ).map((id) => (id === 'me' ? userId : id));

const pickSql = (x: Column | SQL, rule: ConditionRule, userId: string) => {
  if (!['eq', 'neq', 'in', 'not_in'].includes(rule.op)) return undefined;

  const ids = sql`${sql.param(idsOf(rule, userId))}::text[]`;

  return rule.op === 'eq' || rule.op === 'in'
    ? sql`${x} = any(${ids})`
    : sql`(${x} is null or not (${x} = any(${ids})))`;
};

const arraySql = (x: Column | SQL, rule: ConditionRule, userId: string) => {
  if (!['eq', 'neq', 'in', 'not_in'].includes(rule.op)) return undefined;

  const ids = sql`${sql.param(idsOf(rule, userId))}::text[]`;

  return rule.op === 'eq' || rule.op === 'in' ? sql`${x} && ${ids}` : sql`not (${x} && ${ids})`;
};

const COMPARE: Partial<Record<ConditionRule['op'], string>> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const dateSql = (x: Column | SQL, rule: ConditionRule) => {
  const compare = COMPARE[rule.op];

  if (compare) return sql`(${x})::date ${sql.raw(compare)} ${Text.parse(rule.value)}::date`;

  if (!['within_last', 'more_than_ago', 'within_next'].includes(rule.op)) return undefined;

  const { amount, unit } = RelativeAmount.parse(rule.value);
  const span = sql`${`${amount} ${unit}`}::interval`;

  if (rule.op === 'within_last') return sql`(${x} <= now() and ${x} >= now() - ${span})`;

  return rule.op === 'more_than_ago'
    ? sql`${x} < now() - ${span}`
    : sql`(${x} >= now() and ${x} <= now() + ${span})`;
};

const numberSql = (x: Column | SQL, rule: ConditionRule) => {
  if (rule.op === 'neq') return sql`(${x} is null or ${x} <> ${Num.parse(rule.value)})`;

  const compare = COMPARE[rule.op];

  return compare ? sql`${x} ${sql.raw(compare)} ${Num.parse(rule.value)}` : undefined;
};

const compile = ({ kind, expr }: FilterFields[string], rule: ConditionRule, userId: string) => {
  switch (kind) {
    case 'text':
      return presence(expr, rule.op) ?? textSql(expr, rule);
    case 'member':
    case 'select':
      return presence(expr, rule.op) ?? pickSql(expr, rule, userId);
    case 'members':
      return arraySql(expr, rule, userId);
    case 'date':
      return presence(expr, rule.op) ?? dateSql(expr, rule);
    case 'number':
      return presence(expr, rule.op) ?? numberSql(expr, rule);
    case 'boolean':
      return rule.op === 'eq' ? sql`${expr} = ${Bool.parse(rule.value)}` : undefined;
  }
};

const ruleSql = (fields: FilterFields, rule: ConditionRule, userId: string) => {
  const field = fields[rule.path];

  if (!field) throw refuse(rule);

  try {
    const compiled = compile(field, rule, userId);

    if (compiled) return compiled;
  } catch (error) {
    // A value the field can't compare, such as text for a date.
    if (!(error instanceof z.ZodError)) throw error;
  }

  throw refuse(rule);
};

/**
 * The filter bar's conditions as SQL, on `fields`: all of a group's rules, or any (the advanced
 * filter's groups). A rule on a path the list has no field for, or with a value its field can't
 * compare, is refused.
 */
export const filterSql = (
  fields: FilterFields,
  group: ConditionGroup,
  userId: string,
): SQL | undefined => {
  const parts = group.rules.map((part) =>
    'rules' in part ? filterSql(fields, part, userId) : ruleSql(fields, part, userId),
  );

  return group.match === 'any' ? or(...parts) : and(...parts);
};
