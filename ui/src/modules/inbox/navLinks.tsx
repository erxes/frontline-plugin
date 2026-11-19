import type { QueryClient } from '@tanstack/react-query';
import {
  Badge,
  cn,
  Collapsible,
  listFilterQuery,
  Sidebar,
  storedFamily,
  type TConditionGroup,
  type TConditionRule,
  useFormat,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { useQueryStates } from 'nuqs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { inboxPage } from '~/pages.ts';
import { PLUGIN } from '~/plugin.ts';
import { INBOX_PATH, listPath } from '~/shared/listPath.ts';
import { usePrefetch } from '~/shared/prefetch.ts';
import { prefetchInbox } from './queries.ts';

/** Whether each sidebar group is open, remembered in the browser as the old sidebar did. */
const groupOpen = storedFamily({
  key: `${PLUGIN}:inbox-group`,
  schema: z.boolean(),
  initial: true,
});

/** The inbox filtered by `rules`, as the filter bar keeps it in the address. */
export const filterOf = (...rules: TConditionRule[]): TConditionGroup => ({ match: 'all', rules });

/** The inbox filter in the address, to compare a link's rule with. */
export const useOpenFilter = () => {
  const [{ advanced }] = useQueryStates(listFilterQuery);

  return JSON.stringify(advanced);
};

/** An unread count at the row's end; `beforeAction` leaves room for the row's action button. */
export const Count = ({ count, beforeAction }: { count: number; beforeAction?: boolean }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  if (!count) return null;

  return (
    <Badge
      variant="secondary"
      className={cn('ml-auto', beforeAction && 'mr-5')}
      aria-label={t('unread-count', '{{count}} unread', { count })}
    >
      {format.number(count)}
    </Badge>
  );
};

/** The inbox page at `to` and its first page of conversations. */
const loadInbox = (queryClient: QueryClient, to: string) =>
  Promise.all([inboxPage(), prefetchInbox(queryClient, to)]);

/** Loads the inbox a sidebar link leads to as the member points at it: `{...prefetch(to)}`. */
export const usePrefetchInbox = () => usePrefetch(loadInbox);

/** Whether the inbox shows `rules` now, and the link that turns them on, or off when they are. */
export const useFilterLink = (...rules: TConditionRule[]) => {
  const { pathname } = useLocation();
  const open = useOpenFilter();
  const active = pathname === INBOX_PATH && open === JSON.stringify(filterOf(...rules));

  return { active, to: active ? INBOX_PATH : listPath(INBOX_PATH, ...rules) };
};

/**
 * One queue or channel: a link that sets the inbox's filter to its rule, or clears it when that
 * filter is on already, with its unread count, an `action` button at its end, and under it
 * whatever `children` it opens.
 */
export const FilterLink = ({
  name,
  icon,
  rule,
  count,
  action,
  children,
}: {
  name: string;
  icon: ReactNode;
  rule: TConditionRule;
  count: number;
  action?: ReactNode;
  children?: ReactNode;
}) => {
  const { active, to } = useFilterLink(rule);
  const prefetch = usePrefetchInbox();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton isActive={active} render={<Link to={to} {...prefetch(to)} />}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <Count count={count} beforeAction={Boolean(action)} />
      </Sidebar.MenuButton>
      {action}
      {children}
    </Sidebar.MenuItem>
  );
};

/** A sidebar group whose label folds it, as the old Work queue, My inbox and Team inbox did. */
export const NavGroup = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => {
  const [open, setOpen] = useAtom(groupOpen(id));

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<Sidebar.Group variant="compact" />}>
      <Collapsible.Trigger nativeButton={false} render={<Sidebar.GroupLabel />}>
        <Collapsible.TriggerIcon />
        {label}
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <Sidebar.GroupContent>
          <Sidebar.Menu aria-label={label}>{children}</Sidebar.Menu>
        </Sidebar.GroupContent>
      </Collapsible.Panel>
    </Collapsible>
  );
};
