import { type Icon, IconChevronRight } from '@tabler/icons-react';
import { PanelField } from 'erxes-ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Only record panel slots import this file, so it loads with them and stays out of the page
// module web loads on every page.

/**
 * A record panel's fields, read only `when` the member may not change them: their values still
 * read as text, not as greyed-out buttons.
 */
export const ReadOnly = ({ when, children }: { when: boolean; children: ReactNode }) => (
  <fieldset
    disabled={when}
    className="contents [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100"
  >
    {children}
  </fieldset>
);

/** A record panel row that only reads: its value as small text beside its icon and label. */
export const InfoRow = ({
  icon,
  label,
  children,
}: {
  icon: Icon;
  label: string;
  children: ReactNode;
}) => (
  <PanelField icon={icon} label={label} cell={false}>
    <span className="flex min-w-0 items-center gap-2 px-2 text-xs">{children}</span>
  </PanelField>
);

/** A record panel's link to one of the record's pages, with how many records it holds. */
export const PageLink = ({ to, label, count }: { to: string; label: string; count: ReactNode }) => (
  <Link
    to={to}
    className="flex h-8 w-full items-center justify-between rounded px-2 text-xs hover:bg-accent"
  >
    <span>{label}</span>
    <span className="flex items-center gap-1 text-muted-foreground">
      {count}
      <IconChevronRight className="size-4" />
    </span>
  </Link>
);
