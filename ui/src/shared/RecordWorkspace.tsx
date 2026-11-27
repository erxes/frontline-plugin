import type { Icon } from '@tabler/icons-react';
import { cn, PageContainer, ScrollArea, Skeleton, useFormat } from 'erxes-ui';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ListError } from './List.tsx';

// A record with more to set than core's side panel holds (a channel, a help center, a form, a
// knowledge base topic) gets a page of its own: a column of its sections, as a team's are in
// Operation, beside the open one at full width.

/** One row of the column: its mark, its name and how many, lit while its page is open. */
export const NavRow = ({
  to,
  mark,
  label,
  count,
  muted = false,
}: {
  to: string;
  mark: ReactNode;
  label: string;
  count?: number;
  muted?: boolean;
}) => {
  const { pathname } = useLocation();
  const format = useFormat();
  const current = pathname === to;

  return (
    <li>
      <Link
        to={to}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-accent',
          current && 'bg-primary/10 font-medium text-primary-text hover:bg-primary/10',
          muted && !current && 'text-muted-foreground',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">{mark}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">{format.number(count)}</span>
        )}
      </Link>
    </li>
  );
};

/** A group of rows under a small caps heading. */
export const NavGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label} className="flex flex-col gap-1">
    <h3 className="px-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </h3>
    <ul className="flex flex-col gap-0.5">{children}</ul>
  </section>
);

/** One section of a record's page: its address, name, icon and how many it holds. */
export type WorkspaceSection = { to: string; label: string; icon: Icon; count?: number };

/**
 * The record at the column's top: its mark on a tile, its name and a line under it, and badges
 * such as its status; it opens `to`, its first section.
 */
export const WorkspaceHead = ({
  to,
  mark,
  title,
  subtitle,
  badges,
}: {
  to: string;
  mark: ReactNode;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
}) => (
  <Link to={to} className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
      {mark}
    </span>
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-sm font-semibold">{title}</span>
      {subtitle && <span className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</span>}
      {badges && <span className="flex flex-wrap items-center gap-1">{badges}</span>}
    </span>
  </Link>
);

/** The column of a record's sections: on a phone it sits above the open one. */
export const WorkspaceNav = ({
  label,
  head,
  sections,
  children,
  foot,
}: {
  label: string;
  head: ReactNode;
  sections: WorkspaceSection[];
  /** More groups under the sections. */
  children?: ReactNode;
  foot?: ReactNode;
}) => (
  <aside
    aria-label={label}
    className="flex max-h-56 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-r md:border-b-0"
  >
    <ScrollArea className="min-h-0 flex-1">
      <nav aria-label={label} className="flex flex-col gap-5 p-3">
        {head}
        <ul className="flex flex-col gap-0.5">
          {sections.map(({ to, label: name, icon: SectionIcon, count }) => (
            <NavRow
              key={to}
              to={to}
              mark={<SectionIcon className="size-4" />}
              label={name}
              count={count}
            />
          ))}
        </ul>
        {children}
      </nav>
    </ScrollArea>
    {foot}
  </aside>
);

/**
 * How wide the open section's column is: settings read best narrow, a builder needs room, and a
 * list (`flush`) fills it with its own bar and scrolling.
 */
const WIDTHS = { settings: 'max-w-3xl', wide: 'max-w-6xl' } as const;

type Width = keyof typeof WIDTHS | 'flush';

/**
 * A record's page: the header, then its sections' column beside the open one, while the record
 * loads its skeleton and when it fails the API's answer.
 */
export const RecordWorkspace = ({
  header,
  error,
  retry,
  nav,
  width = 'settings',
  children,
}: {
  header: ReactNode;
  error?: Error | null;
  retry?: () => void;
  /** The column, once the record is in; until then the page shows its skeleton. */
  nav: ReactNode | undefined;
  width?: Width;
  children: ReactNode;
}) => (
  <PageContainer>
    {header}
    {error ? (
      <ListError error={error} retry={retry} />
    ) : !nav ? (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row" aria-busy>
        <div className="flex flex-col gap-2 border-b p-3 md:w-72 md:border-r md:border-b-0">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {nav}
        {width === 'flush' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        ) : (
          <ScrollArea className="min-w-0 flex-1">
            <div className={cn('mx-auto flex w-full flex-col gap-4 p-6', WIDTHS[width])}>
              {children}
            </div>
          </ScrollArea>
        )}
      </div>
    )}
  </PageContainer>
);
