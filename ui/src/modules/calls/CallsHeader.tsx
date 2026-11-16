import { IconPhone } from '@tabler/icons-react';
import { buttonVariants, PageHeader, Separator } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** One level of the breadcrumb: a link, or the page itself when it's last. */
const Crumb = ({ to, children }: { to?: string; children: ReactNode }) =>
  to ? (
    <Link to={to} className={buttonVariants({ variant: 'ghost' })}>
      {children}
    </Link>
  ) : (
    <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">{children}</span>
  );

/**
 * The calls pages' header, as core's breadcrumb draws it: Calls, then each level, the last not a
 * link. `children` is the page's one action.
 */
export const CallsHeader = ({
  levels,
  children,
}: {
  levels: { label: string; to?: string }[];
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <PageHeader>
      <PageHeader.Start>
        <Crumb>
          <IconPhone />
          {t('calls', 'Calls')}
        </Crumb>
        {levels.map((level) => (
          <span key={level.label} className="contents">
            <Separator.Inline />
            <Crumb to={level.to}>{level.label}</Crumb>
          </span>
        ))}
      </PageHeader.Start>
      {children && <PageHeader.End>{children}</PageHeader.End>}
    </PageHeader>
  );
};
