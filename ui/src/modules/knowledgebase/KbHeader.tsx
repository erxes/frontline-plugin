import { IconBook } from '@tabler/icons-react';
import { buttonVariants, PageHeader, Separator } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { KB_PATH, useTopic } from './useKnowledgeBase.ts';

/** One level of the breadcrumb: a link, or the page itself when it's last. */
const Crumb = ({ to, children }: { to?: string; children: ReactNode }) =>
  to ? (
    <Link to={to} className={buttonVariants({ variant: 'ghost' })}>
      {children}
    </Link>
  ) : (
    <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">{children}</span>
  );

/** The topic's name, leading to its own page, where its articles, categories and settings are. */
const TopicCrumb = ({ id }: { id: string }) => {
  const { data } = useTopic(id);

  return (
    <>
      <Separator.Inline />
      <Crumb to={`${KB_PATH}/${encodeURIComponent(id)}`}>{data?.title ?? '…'}</Crumb>
    </>
  );
};

/**
 * The knowledge base pages' header, as core's breadcrumb draws it: Knowledge base, then the open
 * topic, then its page (`label`). `children` is the page's one primary action.
 */
export const KbHeader = ({
  topicId,
  label,
  children,
}: {
  topicId?: string;
  label?: string;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <PageHeader>
      <PageHeader.Start>
        <Crumb to={topicId ? KB_PATH : undefined}>
          <IconBook />
          {t('knowledge-base', 'Knowledge Base')}
        </Crumb>
        {topicId && <TopicCrumb id={topicId} />}
        {label && (
          <>
            <Separator.Inline />
            <Crumb>{label}</Crumb>
          </>
        )}
      </PageHeader.Start>
      {children && <PageHeader.End>{children}</PageHeader.End>}
    </PageHeader>
  );
};
