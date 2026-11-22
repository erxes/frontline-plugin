import type { Icon } from '@tabler/icons-react';
import { AppBreadcrumb, type Crumb, PageHeader } from 'erxes-ui';
import type { ReactNode } from 'react';

/**
 * A page's header: erxes-ui's `AppBreadcrumb` with the app's icon and name (`app`) first, then
 * each level, the last one the page. `children` is the page's one primary action.
 */
export const AppHeader = ({
  icon,
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
      <AppBreadcrumb items={[{ ...app, icon }, ...levels]} />
    </PageHeader.Start>
    {children && <PageHeader.End>{children}</PageHeader.End>}
  </PageHeader>
);
