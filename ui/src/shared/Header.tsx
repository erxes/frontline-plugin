import type { Icon } from '@tabler/icons-react';
import { buttonVariants, PageHeader, Separator } from 'erxes-ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type Crumb = { label: string; to?: string };

/**
 * One level of the breadcrumb: a ghost link, or the page itself when it has no `to`, its icon
 * sized as a ghost button sizes it.
 */
const Level = ({ to, children }: { to?: string; children: ReactNode }) =>
  to ? (
    <Link to={to} className={buttonVariants({ variant: 'ghost' })}>
      {children}
    </Link>
  ) : (
    <span className="flex h-8 min-w-0 items-center gap-1.5 px-3 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0">
      {children}
    </span>
  );

/**
 * A page's header as core's `AppBreadcrumb` draws it: the app's icon and name (`app`, a link
 * when `levels` follow it), then each level, the last not a link. `children` is the page's one
 * primary action.
 */
export const AppHeader = ({
  icon: AppIcon,
  app,
  levels = [],
  children,
}: {
  icon: Icon;
  app: Crumb;
  levels?: Crumb[];
  children?: ReactNode;
}) => (
  <PageHeader>
    <PageHeader.Start>
      <Level to={levels.length > 0 ? app.to : undefined}>
        <AppIcon />
        {app.label}
      </Level>
      {levels.map((level, index) => (
        <span key={`${level.to ?? ''}:${level.label}`} className="contents">
          <Separator.Inline />
          <Level to={index < levels.length - 1 ? level.to : undefined}>
            <span className="truncate">{level.label}</span>
          </Level>
        </span>
      ))}
    </PageHeader.Start>
    {children && <PageHeader.End>{children}</PageHeader.End>}
  </PageHeader>
);
