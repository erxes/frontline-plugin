import { IconGitBranch } from '@tabler/icons-react';
import { Skeleton, TabButton } from 'erxes-ui';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { pipelinePath, usePipeline, usePipelineRoute } from './queries.ts';

// Each tab loads on first visit; the routes live here so the page module stays small.
const PipelineGeneralPage = lazy(async () => ({
  default: (await import('./PipelineGeneralPage.tsx')).PipelineGeneralPage,
}));

const PipelineStatusesPage = lazy(async () => ({
  default: (await import('./PipelineStatusesPage.tsx')).PipelineStatusesPage,
}));

const PipelineSlaPage = lazy(async () => ({
  default: (await import('./PipelineSlaPage.tsx')).PipelineSlaPage,
}));

/** A pipeline's name over its settings tabs, each its own page. */
export const PipelineLayout = () => {
  const { t } = useTranslation('frontline');
  const { channelId, pipelineId } = usePipelineRoute();
  const { data, error } = usePipeline(pipelineId);
  const { pathname } = useLocation();

  const tabs = [
    { segment: '', label: t('general', 'General') },
    { segment: 'statuses', label: t('ticket-statuses', 'Ticket statuses') },
    { segment: 'sla', label: t('pipeline-sla', 'SLA') },
  ];

  if (error) return <p className="m-3 text-sm text-destructive-text">{error.message}</p>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <IconGitBranch className="size-6 text-muted-foreground" />
        {data?.name}
      </h1>
      <nav aria-label={t('pipeline-settings', 'Pipeline settings')} className="flex gap-1">
        {tabs.map((tab) => {
          const path = pipelinePath(channelId, pipelineId, tab.segment);
          const active = pathname.replace(/\/$/, '') === path;

          return (
            <TabButton
              key={tab.segment}
              render={<Link to={path} aria-current={active ? 'page' : undefined} />}
              active={active}
            >
              {tab.label}
            </TabButton>
          );
        })}
      </nav>
      <Suspense fallback={<Skeleton className="h-60 md:max-w-2xl" />}>
        <Routes>
          <Route index element={<PipelineGeneralPage />} />
          <Route path="statuses" element={<PipelineStatusesPage />} />
          <Route path="sla" element={<PipelineSlaPage />} />
        </Routes>
      </Suspense>
    </div>
  );
};
