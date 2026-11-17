import {
  Badge,
  Collapsible,
  listFilterQuery,
  Sidebar,
  storedFamily,
  type TConditionGroup,
  type TConditionRule,
  useFormat,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { createSerializer, useQueryStates } from 'nuqs';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';

export const INBOX = `/${PLUGIN}/inbox`;

const inboxLink = createSerializer(listFilterQuery);

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

export const Count = ({ count }: { count: number }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  if (!count) return null;

  return (
    <Badge
      variant="secondary"
      className="ml-auto"
      aria-label={t('unread-count', '{{count}} unread', { count })}
    >
      {format.number(count)}
    </Badge>
  );
};

/** Whether the inbox shows `filter` now, and the link that turns it on, or off when it is. */
export const useFilterLink = (filter: TConditionGroup) => {
  const { pathname } = useLocation();
  const open = useOpenFilter();
  const active = pathname === INBOX && open === JSON.stringify(filter);

  return { active, to: active ? INBOX : inboxLink(INBOX, { advanced: filter }) };
};

/**
 * One queue or channel: a link that sets the inbox's filter to its rule, or clears it when that
 * filter is on already, with its unread count, and under it whatever `children` it opens.
 */
export const FilterLink = ({
  name,
  icon,
  rule,
  count,
  children,
}: {
  name: string;
  icon: ReactNode;
  rule: TConditionRule;
  count: number;
  children?: ReactNode;
}) => {
  const { active, to } = useFilterLink(filterOf(rule));

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton isActive={active} render={<Link to={to} />}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <Count count={count} />
      </Sidebar.MenuButton>
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
