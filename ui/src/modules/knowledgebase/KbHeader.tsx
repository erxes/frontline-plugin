import { IconBook } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '~/shared/Header.tsx';
import { KB_PATH, useTopic } from './useKnowledgeBase.ts';

/**
 * The knowledge base pages' header: Knowledge base, then the open topic, leading to its own page,
 * then its page (`label`). `children` is the page's one primary action.
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
  const { data } = useTopic(topicId ?? '');

  const levels = [
    ...(topicId
      ? [{ label: data?.title ?? '…', to: `${KB_PATH}/${encodeURIComponent(topicId)}` }]
      : []),
    ...(label ? [{ label }] : []),
  ];

  return (
    <AppHeader
      icon={IconBook}
      app={{ label: t('knowledge-base', 'Knowledge Base'), to: KB_PATH }}
      levels={levels}
    >
      {children}
    </AppHeader>
  );
};
